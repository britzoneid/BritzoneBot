import type { GuildMember, VoiceChannel } from 'discord.js';
import { moveUser } from '../../../lib/discord/member.js';
import sessionManager from '../state/SessionManager.js';

/**
 * Checks if a distribution is currently active
 */
export async function hasActiveDistribution(guildId: string): Promise<boolean> {
	const mainRoom = sessionManager.getMainRoom(guildId);
	if (!mainRoom) return false;

	const rooms = sessionManager.getRooms(guildId);
	if (!rooms || rooms.length === 0) return false;

	// Check if at least one room has members in it
	return rooms.some((room) => room.members && room.members.size > 0);
}

/**
 * Moves a user to a specific room
 */
export async function moveUserToRoom(
	user: GuildMember,
	room: VoiceChannel,
): Promise<void> {
	await moveUser(user, room);
}
