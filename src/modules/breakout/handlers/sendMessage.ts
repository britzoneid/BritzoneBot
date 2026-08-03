import {
	type ChatInputCommandInteraction,
	MessageFlags,
	type VoiceChannel,
} from 'discord.js';
import { replyOrEdit } from '../../../lib/discord/response.js';
import { logger } from '../../../lib/logger.js';
import { sendMessageToChannel } from '../services/message.js';

/**
 * Handles the send-message subcommand for voice channels
 */
export async function handleSendMessageCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	const channel = interaction.options.getChannel(
		'channel',
		true,
	) as VoiceChannel;
	const message = interaction.options.getString('message', true);

	const log = logger.child({
		subcommand: 'send-message',
		guildId: interaction.guildId,
		channel: channel.name,
	});

	log.info('📨 Sending message');

	const result = await sendMessageToChannel(channel, message);

	await replyOrEdit(interaction, {
		content: result.message,
		flags: !result.success ? MessageFlags.Ephemeral : undefined,
	});
}
