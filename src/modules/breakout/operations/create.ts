import {
	ChannelType,
	type CommandInteraction,
	type VoiceChannel,
} from 'discord.js';
import type { OperationResult } from '../../../types/index.js';
import {
	createRoom,
	deleteRoom,
	hasExistingBreakoutRooms,
} from '../services/room.js';
import { clearSession, storeRooms } from '../state/session.js';
import {
	completeOperation,
	getCompletedSteps,
	getCurrentOperation,
	startOperation,
	updateProgress,
} from '../state/state.js';

/**
 * Executes the create breakout rooms operation
 */
export async function executeCreate(
	interaction: CommandInteraction,
	numRooms: number,
	force: boolean = false,
): Promise<OperationResult> {
	const guildId = interaction.guildId;
	if (!guildId || !interaction.guild) {
		return {
			success: false,
			message: 'This command can only be used in a guild.',
		};
	}

	const operationType = 'create';

	// Check if we are resuming an interrupted operation
	const currentOp = await getCurrentOperation(guildId);
	const isResuming = currentOp?.type === operationType;

	if (isResuming) {
		console.log(`🔄 Resuming create operation for guild ${guildId}`);
	} else {
		// Check for existing breakout rooms
		const existingRooms = await hasExistingBreakoutRooms(interaction.guild);
		if (existingRooms.exists && !force) {
			return {
				success: false,
				message: `There are already ${existingRooms.rooms.length} breakout rooms in this server. Use '/breakout create' with the force flag set to true to replace them, or '/breakout end' first to clean up existing rooms.`,
			};
		}

		// If force is true and rooms exist, cleanup first
		if (force && existingRooms.exists) {
			console.log(
				`🔄 Force flag enabled, cleaning up ${existingRooms.rooms.length} existing rooms`,
			);
			// Simple cleanup: delete rooms.
			// Note: Ideally we would move users back to main room if known, but for simplicity/force we just delete.
			for (const room of existingRooms.rooms) {
				await deleteRoom(room);
			}
			clearSession(guildId);
		}

		// Start new operation
		await startOperation(guildId, operationType, { numRooms });
	}

	try {
		const createdChannels: VoiceChannel[] = [];

		// Create each breakout room with checkpointing
		for (let i = 1; i <= numRooms; i++) {
			const roomName = `breakout-room-${i}`;
			const stepKey = `create_room_${i}`;

			// Check if this step was already completed in a previous attempt
			const steps = await getCompletedSteps(guildId);
			if (steps[stepKey]) {
				console.log(`⏭️ Room ${roomName} was already created, skipping`);

				// Try to find the existing channel to add to our list
				// We can use the ID stored in the step if available
				const storedChannelId = steps[stepKey].channelId;
				let existingChannel: any;

				if (storedChannelId) {
					existingChannel =
						interaction.guild.channels.cache.get(storedChannelId);
				}

				if (!existingChannel) {
					// Fallback to name search
					existingChannel = interaction.guild.channels.cache.find(
						(c) => c.name === roomName && c.type === ChannelType.GuildVoice,
					);
				}

				if (existingChannel) {
					createdChannels.push(existingChannel as VoiceChannel);
					continue;
				}
			}

			console.log(`📂 Creating voice channel: ${roomName}`);
			try {
				const createdChannel = await createRoom(interaction, roomName);
				createdChannels.push(createdChannel);
				await updateProgress(guildId, stepKey, {
					channelId: createdChannel.id,
				});
			} catch (error) {
				console.error(`❌ Failed to create ${roomName}:`, error);
				throw error;
			}
		}

		// Store the created breakout rooms
		await updateProgress(guildId, 'store_rooms', {
			roomIds: createdChannels.map((c) => c.id),
		});
		storeRooms(guildId, createdChannels);

		// Complete operation
		await completeOperation(guildId);

		const cmdChannel = interaction.channel;
		const hasParent = Boolean(
			cmdChannel && 'parent' in cmdChannel && cmdChannel.parent,
		);
		return {
			success: true,
			message: `Successfully created ${numRooms} breakout voice channels${
				hasParent ? ' in the same category' : ''
			}!`,
		};
	} catch (error) {
		console.error(`❌ Error in CreateOperation:`, error);
		return {
			success: false,
			message:
				'An error occurred while creating breakout rooms. You can try running the command again to resume the process.',
		};
	}
}
