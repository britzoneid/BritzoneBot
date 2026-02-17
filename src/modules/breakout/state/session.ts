import type { VoiceBasedChannel, VoiceChannel } from 'discord.js';

/**
 * Represents a breakout session for a guild
 */
interface BreakoutSession {
	/** Array of breakout room channels */
	rooms?: VoiceChannel[];
	/** The main voice channel */
	mainRoom?: VoiceBasedChannel;
}

/**
 * Internal state: breakout sessions by guild ID
 */
const sessions = new Map<string, BreakoutSession>();

/**
 * Stores breakout rooms for a guild
 * @param guildId The Discord guild ID
 * @param rooms Array of voice channels
 */
export function storeRooms(guildId: string, rooms: VoiceChannel[]): void {
	const session = sessions.get(guildId) || {};
	session.rooms = rooms;
	sessions.set(guildId, session);
	console.log(`📝 Stored ${rooms.length} breakout rooms for guild ${guildId}`);
}

/**
 * Sets the main room for a guild's breakout session
 * @param guildId The Discord guild ID
 * @param mainRoom The main voice channel
 */
export function setMainRoom(
	guildId: string,
	mainRoom: VoiceBasedChannel,
): void {
	const session = sessions.get(guildId) || {};
	session.mainRoom = mainRoom;
	sessions.set(guildId, session);
	console.log(`📝 Set main room to ${mainRoom.name} for guild ${guildId}`);
}

/**
 * Gets the breakout rooms for a guild
 * @param guildId The Discord guild ID
 * @returns Array of voice channels or empty array
 */
export function getRooms(guildId: string): VoiceChannel[] {
	const session = sessions.get(guildId);
	return session?.rooms || [];
}

/**
 * Gets the main room for a guild
 * @param guildId The Discord guild ID
 * @returns The main voice channel or undefined
 */
export function getMainRoom(guildId: string): VoiceBasedChannel | undefined {
	const session = sessions.get(guildId);
	return session?.mainRoom;
}

/**
 * Clears session data for a guild
 * @param guildId The Discord guild ID
 */
export function clearSession(guildId: string): void {
	sessions.delete(guildId);
	console.log(`🧹 Cleared breakout session for guild ${guildId}`);
}
