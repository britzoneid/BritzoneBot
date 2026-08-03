import {
	EmbedBuilder,
	type GuildMember,
	type VoiceBasedChannel,
	type VoiceChannel,
} from 'discord.js';
import type { MoveFailure, MoveResult } from '../../../types/index.js';
import type { UserDistribution } from './distribution.js';

interface DistributionEmbedParams {
	mainRoom: VoiceBasedChannel;
	breakoutRooms: VoiceChannel[];
	facilitators?: Set<string>;
	usersInMainRoom?: Map<string, GuildMember>;
	moveResults?: {
		success: (MoveResult | string)[];
		failed: (MoveFailure | string)[];
	};
	distribution?: UserDistribution;
}

/**
 * Builds the embed for breakout room distribution results
 */
export function buildDistributionEmbed(
	params: DistributionEmbedParams,
): EmbedBuilder {
	const {
		mainRoom,
		breakoutRooms,
		facilitators,
		usersInMainRoom,
		moveResults,
		distribution,
	} = params;

	const embed = new EmbedBuilder()
		.setTitle('Breakout Room Assignment')
		.setColor('#00FF00')
		.setDescription(
			`Split users from ${mainRoom.name} into ${breakoutRooms.length} breakout rooms.`,
		)
		.setTimestamp();

	// Add facilitators field if any exist
	if (facilitators && facilitators.size > 0 && usersInMainRoom) {
		const facilitatorUsers = Array.from(usersInMainRoom.values())
			.filter((member) => facilitators.has(member.user.id))
			.map((member) => member.user.tag)
			.join('\n');

		embed.addFields({
			name: '👥 Facilitators',
			value: facilitatorUsers || 'None',
			inline: false,
		});
	}

	// Index successful moves by roomId
	const movesByRoom = new Map<string, string[]>();
	if (moveResults?.success) {
		for (const move of moveResults.success) {
			if (typeof move === 'object' && move.roomId) {
				const list = movesByRoom.get(move.roomId) || [];
				list.push(move.userTag);
				movesByRoom.set(move.roomId, list);
			}
		}
	}

	// Add fields for each breakout room
	breakoutRooms.forEach((room) => {
		let usersInRoom: string;

		if (moveResults?.success && movesByRoom.size > 0) {
			const roomUserTags = movesByRoom.get(room.id) || [];
			usersInRoom =
				roomUserTags.length > 0 ? roomUserTags.join('\n') : 'No users assigned';
		} else if (distribution) {
			const plannedUsers = distribution[room.id]?.map((u) => u.user.tag) || [];
			usersInRoom =
				plannedUsers.length > 0 ? plannedUsers.join('\n') : 'No users assigned';
		} else {
			usersInRoom = 'No users assigned';
		}

		embed.addFields({
			name: room.name,
			value: usersInRoom,
			inline: true,
		});
	});

	// Add error field if any failed moves
	if (moveResults?.failed && moveResults.failed.length > 0) {
		const failedMessages = moveResults.failed.map((f) => {
			if (typeof f === 'string') return f;
			return f.userTag ? `${f.userTag} (${f.reason})` : f.reason;
		});
		embed.addFields({
			name: 'Failed Moves',
			value: failedMessages.join('\n'),
			inline: false,
		});
	}

	return embed;
}
