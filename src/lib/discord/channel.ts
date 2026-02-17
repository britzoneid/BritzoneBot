import {
	type CategoryChannel,
	ChannelType,
	type Guild,
	type VoiceChannel,
} from 'discord.js';
import { logger } from '../logger.js';

/**
 * Creates a new voice channel
 * @param parent Guild or category to create channel in
 * @param name Name of the channel
 * @returns The created channel
 */
export async function createChannel(
	parent: Guild | CategoryChannel,
	name: string,
): Promise<VoiceChannel> {
	try {
		logger.debug({ channelName: name }, `📂 Creating voice channel`);

		// If parent is a category, use its children.create method
		if ('children' in parent) {
			const channel = await parent.children.create({
				name,
				type: ChannelType.GuildVoice,
			});
			logger.info(
				{ category: parent.name, channel: channel.name },
				`✅ Created channel in category`,
			);
			return channel as VoiceChannel;
		}

		// Otherwise, create in guild
		const channel = await parent.channels.create({
			name,
			type: ChannelType.GuildVoice,
		});
		logger.info(
			{ guild: parent.name, channel: channel.name },
			`✅ Created channel in guild`,
		);
		return channel as VoiceChannel;
	} catch (error) {
		logger.error(
			{ err: error, channelName: name },
			`❌ Failed to create channel`,
		);
		throw error;
	}
}
