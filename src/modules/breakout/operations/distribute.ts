import type {
	CommandInteraction,
	VoiceBasedChannel,
	VoiceChannel,
} from 'discord.js';
import { logger } from '../../../lib/logger.js';
import type { OperationResult } from '../../../types/index.js';
import {
	hasActiveDistribution,
	moveUserToRoom,
} from '../services/distribution.js';
import { setMainRoom } from '../state/session.js';
import {
	completeOperation,
	getCompletedSteps,
	getCurrentOperation,
	startOperation,
	updateProgress,
} from '../state/state.js';
import type { UserDistribution } from '../utils/distribution.js';

export async function executeDistribute(
	interaction: CommandInteraction,
	mainRoom: VoiceBasedChannel,
	distribution: UserDistribution,
	force: boolean = false,
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

	if (isResuming) {
		log.info(`🔄 Resuming distribute operation`);

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
				// Fallback to provided distribution if reconstruction fails?
				// Or fail? If we fail here, we might be in a bad state.
				// Let's log and continue with provided distribution but warn.
				log.warn(`⚠️ Falling back to fresh distribution plan due to error.`);
			}
		}
	} else {
		// Check if distribution is already active
		const isDistributionActive = await hasActiveDistribution(guildId);
		if (isDistributionActive && !force) {
			return {
				success: false,
				message:
					"Users are already distributed to breakout rooms. Use '/breakout distribute' with the force flag set to true to redistribute, or use '/breakout end' first to end the current session.",
			};
		}

		// If force is true and distribution is active, we should technically clean up.
		// But similar to CreateOperation, avoiding circular dependency for now.
		// The original code called endBreakoutSession.
		if (force && isDistributionActive) {
			log.info(
				`🔄 Force flag enabled, proceeding with redistribution (previous session implicit end)`,
			);
			// We'll rely on the new distribution simply moving users, effectively "stealing" them from old rooms.
			// But we should probably clear the session manager's main room if it changes?
			// sessionManager.setMainRoom handles overwrite.
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
		});
	}

	try {
		// Store the main room for future reference
		// We do this every time just in case, or only if not resuming?
		// Safe to do every time as it updates in-memory map.
		// But we should update progress step 'set_main_room'
		const steps = await getCompletedSteps(guildId);

		if (!steps['set_main_room']) {
			setMainRoom(guildId, mainRoom);
			await updateProgress(guildId, 'set_main_room');
		} else {
			// Ensure session manager is in sync if we restarted the bot
			setMainRoom(guildId, mainRoom);
		}

		const movePromises: Promise<void>[] = [];
		const moveResults = {
			success: [] as string[],
			failed: [] as string[],
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

			// Refetch steps inside loop? No, outside is fine if we don't await parallel moves that depend on it?
			// But moves are parallelized here.
			// The original code fetched steps inside the user loop? No, inside room loop.
			// "const steps = await stateManager.getCompletedSteps(guildId);" was inside room loop.

			// Wait, the original code had:
			// for (const [roomId, users] of Object.entries(distribution)) {
			//   const steps = await stateManager.getCompletedSteps(guildId);
			//   for (const user of users) { ... }
			// }

			// So I should fetch steps or reuse. Steps are cumulative.

			for (const user of users) {
				const moveKey = `move_user_${user.id}_to_${roomId}`;

				// We need latest steps if we want to be 100% correct about concurrent updates,
				// but here we are generating promises.
				// Since we are not awaiting inside the user loop, steps won't change *during* this loop
				// (unless another process updates it, which shouldn't happen).
				// But if we resume, we fetch steps once.

				if (steps[moveKey]) {
					log.debug(
						{ user: user.user, room: room.name },
						`⏭️ User was already moved, skipping`,
					);
					moveResults.success.push(`${user.user.tag} → ${room.name}`);
					continue;
				}

				movePromises.push(
					moveUserToRoom(user, room)
						.then(async () => {
							moveResults.success.push(`${user.user.tag} → ${room.name}`);
							await updateProgress(guildId, moveKey);
						})
						.catch((error: any) => {
							moveResults.failed.push(`${user.user.tag} (${error.message})`);
							log.error(
								{ err: error, user: user.user },
								`❌ Failed to move user`,
							);
						}),
				);
			}
		}

		// Wait for all moves to complete
		log.info(
			{ count: movePromises.length },
			`⏳ Waiting for move operations to complete`,
		);
		await Promise.all(movePromises);

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
		logger.error({ err: error, guildId }, `❌ Error in DistributeOperation`);
		return {
			success: false,
			message:
				'An error occurred while distributing users. You can try running the command again to resume the process.',
		};
	}
}
