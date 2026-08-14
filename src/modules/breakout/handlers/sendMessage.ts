import {
	type ChatInputCommandInteraction,
	GuildMember,
	MessageFlags,
	type VoiceChannel,
} from 'discord.js';
import { preflightBreakout } from '@/lib/discord/permission.js';
import { handleInteraction, replyOrEdit } from '@/lib/discord/response.js';
import { logger } from '@/lib/logger.js';
import { sendMessageToChannel } from '@/modules/breakout/services/message.js';

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

	if (interaction.member instanceof GuildMember) {
		const check = preflightBreakout({
			member: interaction.member,
			textChannel: channel,
		});

		if (!check.ok) {
			await replyOrEdit(interaction, {
				content: check.reason ?? 'Permission check failed.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
	}

	const log = logger.child({
		subcommand: 'send-message',
		guildId: interaction.guildId,
		channel: channel.name,
	});

	log.info('📨 Sending message');

	await handleInteraction(
		interaction,
		async (ctx) => {
			const result = await sendMessageToChannel(channel, message);

			await ctx.reply({
				content: result.message,
			});
		},
		{ deferReply: true, ephemeral: true },
	);
}
