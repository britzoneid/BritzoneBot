import {
	ChannelType,
	type CommandInteraction,
	type VoiceBasedChannel,
	type VoiceChannel,
} from 'discord.js';
import { logger } from '../../../lib/logger.js';
import type { OperationResult } from '../../../types/index.js';
import { moveUserToRoom } from '../services/distribution.js';
import {
	completeOperation,
	getCompletedSteps,
	getCurrentOperation,
	getRooms,
	startOperation,
	updateProgress,
} from '../state/state.js';

/**
 * Executes the recall operation: moves all members from breakout rooms back to the main voice channel.
 * Breakout rooms remain intact.
 */
export async function executeRecall(
	interaction: CommandInteraction,
	mainChannel: VoiceBasedChannel,
): Promise<OperationResult> {
	const guildId = interaction.guildId;
	if (!guildId || !interaction.guild) {
		return {
			success: false,
			message: 'This command can only be used in a guild.',
		};
	}

	const operationType = 'recall';
	const log = logger.child({
		operation: operationType,
		guildId,
		mainChannel: mainChannel.name,
	});

	// Check if we are resuming an interrupted operation
	const currentOp = await getCurrentOperation(guildId);
	const isResuming = currentOp?.type === operationType;

	let breakoutRooms: VoiceChannel[] = [];

	if (isResuming) {
		log.info('🔄 Resuming recall operation');
		const storedRoomIds = currentOp.params.roomIds as string[];
		if (storedRoomIds) {
			breakoutRooms = storedRoomIds
				.map((id) => interaction.guild?.channels.cache.get(id) as VoiceChannel)
				.filter((c) => c !== undefined);
		}
	}

	if (!isResuming || breakoutRooms.length === 0) {
		// Get breakout rooms
		breakoutRooms = getRooms(interaction.guild);

		// If no stored rooms, identify them by name pattern as fallback
		if (!breakoutRooms || breakoutRooms.length === 0) {
			breakoutRooms = Array.from(
				interaction.guild.channels.cache
					.filter(
						(channel) =>
							channel.type === ChannelType.GuildVoice &&
							channel.name.startsWith('breakout-room-'),
					)
					.values(),
			) as VoiceChannel[];
		}

		if (breakoutRooms.length === 0) {
			log.warn('⚠️ No breakout rooms found to recall members from.');
			return {
				success: false,
				message: 'No breakout rooms found to recall members from!',
			};
		}

		// Start new operation
		if (!isResuming) {
			await startOperation(guildId, operationType, {
				mainRoomId: mainChannel.id,
				roomIds: breakoutRooms.map((room) => room.id),
			});

			log.info(
				{ roomsCount: breakoutRooms.length },
				'🔍 Found breakout room(s) to recall members from',
			);
		}
	}

	let totalMoved = 0;

	try {
		// Process each room one by one with checkpoints
		for (const room of breakoutRooms) {
			if (!room) continue;

			log.debug(
				{ roomName: room.name, roomId: room.id },
				'📌 Recalling members from breakout room',
			);

			const steps = await getCompletedSteps(guildId);
			const roomRecalledKey = `room_recalled_${room.id}`;

			if (steps[roomRecalledKey]) {
				log.debug(
					{ roomName: room.name },
					'⏭️ Room members were already recalled, skipping',
				);
				const processedData = steps[roomRecalledKey];
				if (processedData && typeof processedData.movedCount === 'number') {
					totalMoved += processedData.movedCount;
				}
				continue;
			}

			let roomMovedCount = 0;
			try {
				const guildRoom = interaction.guild.channels.cache.get(room.id) as
					| VoiceChannel
					| undefined;
				if (!guildRoom) {
					log.warn(
						{ roomName: room.name, roomId: room.id },
						'⚠️ Room no longer exists, skipping',
					);
					await updateProgress(guildId, roomRecalledKey, {
						skipped: true,
						movedCount: 0,
					});
					continue;
				}

				if (guildRoom.members && guildRoom.members.size > 0) {
					for (const [memberId, member] of guildRoom.members) {
						const memberMovedKey = `member_moved_${memberId}_from_${room.id}`;

						if (steps[memberMovedKey]) {
							log.debug(
								{ user: member.user },
								'⏭️ Member was already moved, skipping',
							);
							totalMoved++;
							roomMovedCount++;
							continue;
						}

						try {
							await moveUserToRoom(member, mainChannel);
							log.debug(
								{
									user: member.user,
									from: room.name,
									to: mainChannel.name,
								},
								'✅ Moved member back to main channel',
							);
							await updateProgress(guildId, memberMovedKey);
							totalMoved++;
							roomMovedCount++;
						} catch (error) {
							log.error(
								{ err: error, user: member.user, from: room.name },
								'❌ Failed to move member',
							);
						}
					}
				}

				await updateProgress(guildId, roomRecalledKey, {
					movedCount: roomMovedCount,
				});
			} catch (error) {
				log.error(
					{ err: error, roomName: room.name },
					'❌ Error recalling members from room',
				);
			}
		}

		await completeOperation(guildId);

		log.info(
			{ totalMoved, totalRooms: breakoutRooms.length },
			'🎉 Successfully recalled members to main voice channel.',
		);

		return {
			success: true,
			message: `Successfully moved ${totalMoved} member(s) back to ${mainChannel.name}!`,
		};
	} catch (error) {
		log.error({ err: error }, '❌ Error in RecallOperation');
		return {
			success: false,
			message:
				'An error occurred while recalling members. You can try running the command again to resume the process.',
		};
	}
}
