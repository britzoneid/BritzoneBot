import {
	EmbedBuilder,
	type GuildMember,
	type VoiceBasedChannel,
	type VoiceChannel,
} from 'discord.js';
import { logger } from '@/lib/logger.js';
import type { MoveFailure, MoveResult } from '@/types/index.js';
import type { UserDistribution } from './distribution.js';

interface DistributionEmbedParams {
	mainRoom: VoiceBasedChannel;
	breakoutRooms: VoiceChannel[];
	facilitators?: Set<string>;
	excludedUsers?: Set<string>;
	usersInMainRoom?: Map<string, GuildMember>;
	moveResults?: {
		success: MoveResult[];
		failed: MoveFailure[];
	};
	distribution?: UserDistribution;
	isPreview?: boolean;
}

/**
 * Truncates a string to stay safely within Discord field length limits (1,024 chars max)
 */
function truncateValue(value: string, maxLength: number = 1000): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 4)}\n...`;
}

/**
 * Builds the embed for breakout room distribution results with Discord API limit guards
 */
export function buildDistributionEmbed(
	params: DistributionEmbedParams,
): EmbedBuilder {
	const {
		mainRoom,
		breakoutRooms,
		facilitators,
		excludedUsers,
		usersInMainRoom,
		moveResults,
		distribution,
		isPreview = false,
	} = params;

	const title = isPreview
		? '📋 Breakout Room Assignment (Preview)'
		: 'Breakout Room Assignment';

	const description = isPreview
		? `Preview of user distribution from **${mainRoom.name}** into **${breakoutRooms.length}** breakout rooms.\n\nPlease confirm below to proceed with moving users.`
		: `Split users from ${mainRoom.name} into ${breakoutRooms.length} breakout rooms.`;

	const embed = new EmbedBuilder()
		.setTitle(title)
		.setColor(isPreview ? '#3B82F6' : '#00FF00')
		.setDescription(truncateValue(description, 2048))
		.setTimestamp();

	let fieldCount = 0;
	const MAX_FIELDS = 25;

	// Add excluded users field if any exist
	if (
		excludedUsers &&
		excludedUsers.size > 0 &&
		usersInMainRoom &&
		fieldCount < MAX_FIELDS
	) {
		const excludedUserTags = Array.from(usersInMainRoom.values())
			.filter((member) => excludedUsers.has(member.user.id))
			.map((member) => member.user.tag)
			.join('\n');

		embed.addFields({
			name: '🚫 Excluded Users',
			value: truncateValue(excludedUserTags || 'None'),
			inline: false,
		});
		fieldCount++;
	}

	// Index successful moves by roomId
	const movesByRoom = new Map<
		string,
		Array<{ userId: string; userTag: string }>
	>();
	if (moveResults?.success) {
		for (const move of moveResults.success) {
			if (move.roomId) {
				const list = movesByRoom.get(move.roomId) || [];
				list.push({ userId: move.userId, userTag: move.userTag });
				movesByRoom.set(move.roomId, list);
			}
		}
	}

	// Reserve 1 field slot for Failed Moves if applicable
	const maxRoomFields =
		moveResults?.failed && moveResults.failed.length > 0
			? MAX_FIELDS - fieldCount - 1
			: MAX_FIELDS - fieldCount;

	const roomsToDisplay = breakoutRooms.slice(0, maxRoomFields);

	// Add fields for each breakout room
	roomsToDisplay.forEach((room) => {
		let usersInRoom: string;

		if (moveResults !== undefined) {
			const roomUsers = movesByRoom.get(room.id) || [];
			usersInRoom =
				roomUsers.length > 0
					? roomUsers
							.map((u) =>
								facilitators?.has(u.userId) ? `⭐ ${u.userTag}` : u.userTag,
							)
							.join('\n')
					: 'No users assigned';
		} else if (distribution) {
			const plannedUsers = distribution[room.id] || [];
			usersInRoom =
				plannedUsers.length > 0
					? plannedUsers
							.map((u) =>
								facilitators?.has(u.id) ? `⭐ ${u.user.tag}` : u.user.tag,
							)
							.join('\n')
					: 'No users assigned';
		} else {
			usersInRoom = 'No users assigned';
		}

		embed.addFields({
			name: room.name.slice(0, 256),
			value: truncateValue(usersInRoom),
			inline: true,
		});
		fieldCount++;
	});

	// If rooms were truncated due to 25 field limit, append a notice
	if (breakoutRooms.length > roomsToDisplay.length) {
		logTruncationNotice(breakoutRooms.length - roomsToDisplay.length);
	}

	// Add error field if any failed moves exist
	if (
		moveResults?.failed &&
		moveResults.failed.length > 0 &&
		fieldCount < MAX_FIELDS
	) {
		const failedMessages = moveResults.failed.map((f) =>
			f.userTag ? `${f.userTag} (${f.reason})` : f.reason,
		);
		embed.addFields({
			name: 'Failed Moves',
			value: truncateValue(failedMessages.join('\n')),
			inline: false,
		});
	}

	return embed;
}

function logTruncationNotice(excessCount: number): void {
	logger.warn(
		{ excessCount },
		'⚠️ Embed breakout room fields truncated due to Discord limit',
	);
}
