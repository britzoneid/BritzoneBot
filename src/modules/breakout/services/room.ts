import {
	ChannelType,
	type CommandInteraction,
	type Guild,
	type VoiceChannel,
} from 'discord.js';
import { createChannel } from '../../../lib/discord/channel.js';
import { clearSession, getRooms, storeRooms } from '../state/session.js';

interface ExistingRoomsResult {
	exists: boolean;
	rooms: VoiceChannel[];
	source?: 'stored' | 'pattern';
}

/**
 * Checks if breakout rooms already exist for the guild
 */
export async function hasExistingBreakoutRooms(
	guild: Guild,
): Promise<ExistingRoomsResult> {
	// Check in room manager first
	const storedRooms = getRooms(guild.id);
	if (storedRooms && storedRooms.length > 0) {
		// Verify rooms still exist in guild
		const existingRooms = storedRooms.filter((room) =>
			guild.channels.cache.has(room.id),
		);

		// Sync session manager if we found stale rooms
		if (existingRooms.length !== storedRooms.length) {
			if (existingRooms.length > 0) {
				storeRooms(guild.id, existingRooms);
			} else {
				clearSession(guild.id);
			}
		}

		if (existingRooms.length > 0) {
			return {
				exists: true,
				rooms: existingRooms,
				source: 'stored',
			};
		}
	}

	// Fallback: Check for rooms by naming pattern
	const patternRooms = Array.from(
		guild.channels.cache
			.filter(
				(channel) =>
					channel.type === ChannelType.GuildVoice &&
					channel.name.startsWith('breakout-room-'),
			)
			.values(),
	) as VoiceChannel[];

	if (patternRooms.length > 0) {
		return {
			exists: true,
			rooms: patternRooms,
			source: 'pattern',
		};
	}

	return { exists: false, rooms: [] };
}

/**
 * Creates a single breakout room
 */
export async function createRoom(
	interaction: CommandInteraction,
	roomName: string,
): Promise<VoiceChannel> {
	const channel = interaction.channel;
	// Get parent category from channel if available, otherwise use guild as fallback
	// Use type guard to safely access parent property
	const channelParent = channel && 'parent' in channel ? channel.parent : null;
	// Ensure parent is only Guild or CategoryChannel (required by createChannel)
	const parent =
		channelParent && 'children' in channelParent
			? channelParent
			: interaction.guild;

	if (!parent) {
		throw new Error('Could not find a valid parent for the channel');
	}

	return await createChannel(parent, roomName);
}

/**
 * Deletes a single breakout room
 */
export async function deleteRoom(
	room: VoiceChannel,
	reason: string = 'Breakout room cleanup',
): Promise<void> {
	try {
		await room.delete(reason);
	} catch (error) {
		console.error(`Failed to delete room ${room.name}:`, error);
		throw error;
	}
}
