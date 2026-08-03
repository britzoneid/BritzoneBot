import type {
	Guild,
	GuildMember,
	StageChannel,
	VoiceChannel,
} from 'discord.js';
import { moveUser } from '@/lib/discord/member.js';
import { getMainRoom, getRooms } from '@/modules/breakout/state/state.js';

/**
 * Checks if a distribution is currently active
 */
export async function hasActiveDistribution(guild: Guild): Promise<boolean> {
	const mainRoom = getMainRoom(guild);
	if (!mainRoom) return false;

	const rooms = getRooms(guild);
	if (!rooms || rooms.length === 0) return false;

	// Check if at least one room has members in it
	return rooms.some(
		(room: VoiceChannel) => room.members && room.members.size > 0,
	);
}

/**
 * Moves a user to a specific room
 */
export async function moveUserToRoom(
	user: GuildMember,
	room: VoiceChannel | StageChannel,
): Promise<void> {
	await moveUser(user, room);
}
