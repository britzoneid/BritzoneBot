import {
	ChannelType,
	type CommandInteraction,
	type VoiceBasedChannel,
	type VoiceChannel,
} from 'discord.js';
import type { OperationResult } from '../../../types/index.js';
import { moveUserToRoom } from '../services/distribution.js';
import { deleteRoom } from '../services/room.js';
import { clearSession, getRooms } from '../state/session.js';
import {
	completeOperation,
	getCompletedSteps,
	getCurrentOperation,
	startOperation,
	updateProgress,
} from '../state/state.js';

export async function executeEnd(
	interaction: CommandInteraction,
	mainChannel: VoiceBasedChannel,
	force: boolean = false,
): Promise<OperationResult> {
	const guildId = interaction.guildId;
	if (!guildId || !interaction.guild) {
		return {
			success: false,
			message: 'This command can only be used in a guild.',
		};
	}

	const operationType = 'end';

	// Check if we are resuming an interrupted operation
	const currentOp = await getCurrentOperation(guildId);
	const isResuming = currentOp?.type === operationType;

	let breakoutRooms: VoiceChannel[] = [];

	if (isResuming) {
		console.log(`🔄 Resuming end operation for guild ${guildId}`);
		// If resuming, we need to reconstruct the list of rooms to process?
		// Or we can just re-discover them.
		// Re-discovery is safer as some might have been deleted already.
		// But we stored roomIds in params?
		// The original code passed roomIds in params.

		const storedRoomIds = currentOp.params.roomIds as string[];
		if (storedRoomIds) {
			breakoutRooms = storedRoomIds
				.map((id) => interaction.guild!.channels.cache.get(id) as VoiceChannel)
				.filter((c) => c !== undefined);
		}

		// If we failed to get from params (e.g. migration issue), fallback to discovery logic below
	}

	if (!isResuming || breakoutRooms.length === 0) {
		// Get breakout rooms
		breakoutRooms = getRooms(guildId);

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
			console.log(`⚠️ No breakout rooms found to end.`);
			return {
				success: false,
				message: 'No breakout rooms found to end!',
			};
		}

		// Check if any rooms have users in them
		let hasUsers = false;
		let totalUsers = 0;

		for (const room of breakoutRooms) {
			const guildRoom = interaction.guild.channels.cache.get(room.id) as
				| VoiceChannel
				| undefined;
			if (guildRoom && guildRoom.members && guildRoom.members.size > 0) {
				hasUsers = true;
				totalUsers += guildRoom.members.size;
			}
		}

		// If no users are found and we're not forcing, warn the user
		if (!hasUsers && !force) {
			return {
				success: false,
				message: `No users found in any breakout rooms. Use '/breakout end' with the force flag set to true if you still want to end the session and delete the rooms.`,
			};
		}

		// Start new operation
		if (!isResuming) {
			await startOperation(guildId, operationType, {
				mainRoomId: mainChannel.id,
				roomIds: breakoutRooms.map((room) => room.id),
			});

			console.log(
				`🔍 Found ${breakoutRooms.length} breakout room(s) to process with ${totalUsers} total users.`,
			);
		}
	}

	let totalMoved = 0;
	const totalRooms = breakoutRooms.length;
	let deletedRooms = 0;

	try {
		// Process each room one by one with checkpoints
		for (const room of breakoutRooms) {
			if (!room) continue;

			console.log(`📌 Processing breakout room: ${room.name} (${room.id})`);

			// Check if we already processed this room
			const steps = await getCompletedSteps(guildId);
			const roomProcessedKey = `room_processed_${room.id}`;

			if (steps[roomProcessedKey]) {
				console.log(`⏭️ Room ${room.name} was already processed, skipping`);
				deletedRooms++;

				// Account for previously moved members from this room
				const processedData = steps[roomProcessedKey];
				if (processedData && typeof processedData.movedCount === 'number') {
					totalMoved += processedData.movedCount;
				}
				continue;
			}

			// Move members first
			let roomMovedCount = 0;
			try {
				// Check if the room still exists in the guild
				const guildRoom = interaction.guild.channels.cache.get(room.id) as
					| VoiceChannel
					| undefined;
				if (!guildRoom) {
					console.log(
						`⚠️ Room ${room.name} (${room.id}) no longer exists, skipping`,
					);
					await updateProgress(guildId, roomProcessedKey, {
						skipped: true,
						movedCount: 0,
					});
					deletedRooms++; // Count as deleted since it doesn't exist anymore
					continue;
				}

				// Move each member
				if (guildRoom.members && guildRoom.members.size > 0) {
					for (const [memberId, member] of guildRoom.members) {
						const memberMovedKey = `member_moved_${memberId}_from_${room.id}`;

						if (steps[memberMovedKey]) {
							console.log(
								`⏭️ Member ${member.user.tag} was already moved, skipping`,
							);
							totalMoved++;
							roomMovedCount++;
							continue;
						}

						try {
							await moveUserToRoom(member, mainChannel);
							console.log(
								`✅ Moved ${member.user.tag} from ${room.name} to ${mainChannel.name}`,
							);
							await updateProgress(guildId, memberMovedKey);
							totalMoved++;
							roomMovedCount++;
						} catch (error) {
							console.error(
								`❌ Failed to move ${member.user.tag} from ${room.name}:`,
								error,
							);
						}
					}
				}

				// Then delete the room
				const roomDeletedKey = `room_deleted_${room.id}`;
				if (!steps[roomDeletedKey]) {
					try {
						await deleteRoom(
							guildRoom,
							'Breakout room ended and members moved back to main room',
						);
						console.log(`🗑️ Deleted breakout room: ${room.name}`);
						await updateProgress(guildId, roomDeletedKey);
						deletedRooms++;
					} catch (error) {
						console.error(
							`❌ Failed to delete breakout room ${room.name}:`,
							error,
						);
					}
				} else {
					console.log(`⏭️ Room ${room.name} was already deleted, skipping`);
					deletedRooms++;
				}

				// Mark this room as fully processed with the moved count
				await updateProgress(guildId, roomProcessedKey, {
					movedCount: roomMovedCount,
				});
			} catch (error) {
				console.error(`❌ Error processing room ${room.name}:`, error);
				// Continue with other rooms even if one fails
			}
		}

		// Clear the stored session data
		await updateProgress(guildId, 'clear_session');
		clearSession(guildId);

		// Complete operation
		await completeOperation(guildId);

		console.log(
			`🎉 Successfully moved ${totalMoved} member(s) back to ${mainChannel.name} and deleted ${deletedRooms}/${totalRooms} breakout room(s).`,
		);

		return {
			success: true,
			message: `Successfully moved ${totalMoved} member(s) back to ${mainChannel.name} and deleted ${deletedRooms}/${totalRooms} breakout room(s)!`,
		};
	} catch (error) {
		console.error(`❌ Error in EndOperation:`, error);
		return {
			success: false,
			message:
				'An error occurred while ending the breakout session. You can try running the command again to resume the process.',
		};
	}
}
