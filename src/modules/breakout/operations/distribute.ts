import type {
	CommandInteraction,
	VoiceBasedChannel,
	VoiceChannel,
} from 'discord.js';
import { logger } from '../../../lib/logger.js';
import type {
	MoveFailure,
	MoveResult,
	OperationResult,
} from '../../../types/index.js';
import {
	hasActiveDistribution,
	moveUserToRoom,
} from '../services/distribution.js';
import {
	completeOperation,
	getCompletedSteps,
	getCurrentOperation,
	setMainRoomId,
	startOperation,
	updateProgress,
} from '../state/state.js';
import type { UserDistribution } from '../utils/distribution.js';

export async function executeDistribute(
	interaction: CommandInteraction,
	mainRoom: VoiceBasedChannel,
	distribution: UserDistribution,
	force: boolean = false,
	facilitators?: Set<string>,
): Promise<OperationResult> {
	const guildId = interaction.guildId;
	if (!guildId || !interaction.guild) {
		return {
			success: false,
			message: 'This command can only be used in a guild.',
		};
	}

	const operationType = 'distribute';
	const log = logger.child({
		operation: operationType,
		guildId,
		force,
	});

	// Check if we are resuming an interrupted operation
	const currentOp = await getCurrentOperation(guildId);
	const isResuming = currentOp?.type === operationType;

	// Use a local variable for distribution to allow overriding from state
	let activeDistribution = distribution;
	let activeFacilitators = facilitators;

	if (isResuming) {
		log.info(`🔄 Resuming distribute operation`);

		if (currentOp?.params?.facilitatorIds) {
			activeFacilitators = new Set(currentOp.params.facilitatorIds as string[]);
		}

		// Reconstruct distribution from stored state
		if (currentOp?.params?.distribution) {
			try {
				const storedPlan = currentOp.params.distribution as Record<
					string,
					string[]
				>;
				const reconstructed: UserDistribution = {};
				log.debug(`📦 Reconstructing distribution plan from saved state`);

				for (const [roomId, userIds] of Object.entries(storedPlan)) {
					reconstructed[roomId] = [];
					for (const userId of userIds) {
						try {
							// Try cache first, then fetch
							let member = interaction.guild.members.cache.get(userId);
							if (!member) {
								member = await interaction.guild.members.fetch(userId);
							}

							if (member) {
								reconstructed[roomId].push(member);
							} else {
								log.warn(
									{ userId },
									`⚠️ User from stored plan not found in guild`,
								);
							}
						} catch (err) {
							log.warn({ err, userId }, `⚠️ Failed to fetch user for resume`);
						}
					}
				}
				activeDistribution = reconstructed;
				log.info(
					{ roomCount: Object.keys(activeDistribution).length },
					`✅ Reconstructed plan`,
				);
			} catch (error) {
				log.error({ err: error }, `❌ Failed to reconstruct distribution plan`);
				log.warn(`⚠️ Falling back to fresh distribution plan due to error.`);
			}
		}
	} else {
		// Check if distribution is already active
		const isDistributionActive = await hasActiveDistribution(interaction.guild);
		if (isDistributionActive && !force) {
			return {
				success: false,
				message:
					"Users are already distributed to breakout rooms. Use '/breakout distribute' with the force flag set to true to redistribute, or use '/breakout end' first to end the current session.",
			};
		}

		if (force && isDistributionActive) {
			log.info(
				`🔄 Force flag enabled, proceeding with redistribution (previous session implicit end)`,
			);
		}

		// Store distribution plan for recovery
		const distributionPlan: Record<string, string[]> = {};
		for (const [roomId, users] of Object.entries(distribution)) {
			distributionPlan[roomId] = users.map((user) => user.id);
		}

		// Start new operation
		await startOperation(guildId, operationType, {
			mainRoomId: mainRoom.id,
			distribution: distributionPlan,
			facilitatorIds: Array.from(facilitators || []),
		});
	}

	try {
		const steps = await getCompletedSteps(guildId);

		if (!steps.set_main_room) {
			await setMainRoomId(guildId, mainRoom.id);
			await updateProgress(guildId, 'set_main_room');
		} else {
			await setMainRoomId(guildId, mainRoom.id);
		}

		const facilitatorPromises: Promise<void>[] = [];
		const regularPromises: Promise<void>[] = [];
		const moveResults = {
			success: [] as MoveResult[],
			failed: [] as MoveFailure[],
		};

		// Process each room using the active distribution
		for (const [roomId, users] of Object.entries(activeDistribution)) {
			const room = interaction.guild.channels.cache.get(roomId) as
				| VoiceChannel
				| undefined;

			if (!room) {
				log.warn({ roomId }, `⚠️ Room not found, skipping users`);
				continue;
			}

			log.debug(
				{ roomName: room.name, userCount: users.length },
				`🔄 Processing moves for room`,
			);

			for (const user of users) {
				const moveKey = `move_user_${user.id}_to_${roomId}`;

				if (steps[moveKey]) {
					log.debug(
						{ user: user.user, room: room.name },
						`⏭️ User was already moved, skipping`,
					);
					moveResults.success.push({
						userId: user.id,
						userTag: user.user.tag,
						roomId: room.id,
						roomName: room.name,
					});
					continue;
				}

				const isFacilitator = activeFacilitators?.has(user.id) ?? false;
				const moveTask = moveUserToRoom(user, room)
					.then(async () => {
						moveResults.success.push({
							userId: user.id,
							userTag: user.user.tag,
							roomId: room.id,
							roomName: room.name,
						});
						await updateProgress(guildId, moveKey);
					})
					.catch((error: unknown) => {
						moveResults.failed.push({
							userId: user.id,
							userTag: user.user.tag,
							reason: error instanceof Error ? error.message : String(error),
						});
						log.error(
							{ err: error, user: user.user },
							`❌ Failed to move user`,
						);
					});

				if (isFacilitator) {
					facilitatorPromises.push(moveTask);
				} else {
					regularPromises.push(moveTask);
				}
			}
		}

		// Phase 1: Move facilitators first
		if (facilitatorPromises.length > 0) {
			log.info(
				{ count: facilitatorPromises.length },
				`👑 Moving facilitators into breakout rooms first...`,
			);
			await Promise.all(facilitatorPromises);
		}

		// Phase 2: Move regular members
		if (regularPromises.length > 0) {
			log.info(
				{ count: regularPromises.length },
				`⏳ Moving remaining members into breakout rooms...`,
			);
			await Promise.all(regularPromises);
		}

		// Mark distribution as complete
		await updateProgress(guildId, 'distribution_complete', {
			successful: moveResults.success.length,
			failed: moveResults.failed.length,
		});

		// Complete operation
		await completeOperation(guildId);

		return {
			success: true,
			moveResults,
			message: 'Distribution completed successfully',
		};
	} catch (error) {
		log.error({ err: error }, `❌ Error in DistributeOperation`);
		return {
			success: false,
			message:
				'An error occurred while distributing users. You can try running the command again to resume the process.',
		};
	}
}
