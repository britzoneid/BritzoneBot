import { type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { replyOrEdit } from '../../../lib/discord/response.js';
import { logger } from '../../../lib/logger.js';
import { broadcastToBreakoutRooms } from '../services/message.js';

/**
 * Handles the broadcast subcommand for breakout rooms
 */
export async function handleBroadcastCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) return;

	const message = interaction.options.getString('message', true);
	const log = logger.child({
		subcommand: 'broadcast',
		guildId: interaction.guildId,
	});

	log.info({ message }, '📢 Broadcasting message');

	await interaction.deferReply();

	const result = await broadcastToBreakoutRooms(interaction.guild, message);

	if (result.success) {
		const embed = new EmbedBuilder()
			.setTitle('Broadcast Results')
			.setColor('#00FF00')
			.setDescription('Message broadcast complete')
			.addFields({
				name: 'Successfully Sent To',
				value: result.sent.join('\n') || 'None',
				inline: true,
			});

		if (result.failed.length > 0) {
			embed.addFields({
				name: 'Failed To Send To',
				value: result.failed.join('\n'),
				inline: true,
			});
		}

		await replyOrEdit(interaction, { embeds: [embed] });
	} else {
		await replyOrEdit(interaction, result.message);
	}
}
