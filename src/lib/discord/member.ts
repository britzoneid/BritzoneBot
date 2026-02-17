import type { GuildMember, StageChannel, VoiceChannel } from 'discord.js';
import { logger } from '../logger.js';

/**
 * Move a user to a specified voice channel
 * @param member The guild member to move
 * @param channel The destination channel
 * @returns Promise that resolves when the user is moved
 */
export async function moveUser(
	member: GuildMember,
	channel: VoiceChannel | StageChannel,
): Promise<GuildMember> {
	// Check if member is currently in a voice channel
	if (!member.voice.channel) {
		logger.warn(
			{ user: member.user },
			`❌ Failed move: member is not in a voice channel`,
		);
		throw new Error(`${member.user.tag} is not in a voice channel.`);
	}

	try {
		logger.debug(
			{ user: member.user, channel: channel.name },
			`🚚 Attempting to move user`,
		);

		const movedMember = await member.voice.setChannel(channel);
		logger.info(
			{ user: member.user, channel: channel.name },
			`✅ Successfully moved user`,
		);
		return movedMember;
	} catch (error) {
		logger.error(
			{ err: error, user: member.user, channel: channel.name },
			`❌ Failed to move user`,
		);
		throw error;
	}
}
