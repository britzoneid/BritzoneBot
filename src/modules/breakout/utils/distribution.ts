import { randomInt } from 'node:crypto';
import type { GuildMember, StageChannel, VoiceChannel } from 'discord.js';
import { logger } from '../../../lib/logger.js';

/**
 * Result of user distribution
 */
export interface UserDistribution {
	[roomId: string]: GuildMember[];
}

/**
 * Distribute users among breakout rooms
 * @param users Array of users to distribute (excluding facilitators)
 * @param breakoutRooms Array of breakout room channels
 * @returns Mapping of breakout room IDs to arrays of users
 */
export function distributeUsers(
	users: GuildMember[] | Map<string, GuildMember>,
	breakoutRooms: Array<VoiceChannel | StageChannel>,
): UserDistribution {
	const log = logger.child({
		breakoutRoomsCount: breakoutRooms.length,
		guildId: breakoutRooms[0]?.guild.id,
	});

	log.debug(`🔄 Starting distribution of users`);

	if (breakoutRooms.length === 0) {
		log.error(`❌ Distribution error: No breakout rooms provided`);
		throw new Error('No breakout rooms provided.');
	}

	const distribution: UserDistribution = {};
	breakoutRooms.forEach((room) => {
		distribution[room.id] = [];
	});

	// Convert users collection to array if it's not already, and create a copy to avoid mutation
	const userArray = Array.isArray(users)
		? [...users]
		: Array.from(users.values());

	log.debug({ usersCount: userArray.length }, `👤 Total users to distribute`);

	// Shuffle users for randomness
	for (let i = userArray.length - 1; i > 0; i--) {
		const j = randomInt(0, i + 1);
		[userArray[i], userArray[j]] = [userArray[j], userArray[i]];
	}

	// Distribute users evenly
	userArray.forEach((user, index) => {
		const roomIndex = index % breakoutRooms.length;
		const roomId = breakoutRooms[roomIndex].id;
		distribution[roomId].push(user);
	});

	// Log the distribution summary
	const summary: Record<string, number> = {};
	Object.keys(distribution).forEach((roomId) => {
		const room = breakoutRooms.find((r) => r.id === roomId);
		if (room) {
			summary[room.name] = distribution[roomId].length;
		}
	});

	log.info({ distribution: summary }, `📋 Distribution complete`);

	return distribution;
}
