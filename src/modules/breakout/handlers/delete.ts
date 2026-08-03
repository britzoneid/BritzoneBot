import type { ChatInputCommandInteraction } from 'discord.js';
import { handleInteraction, replyOrEdit } from '@/lib/discord/response.js';
import { logger } from '@/lib/logger.js';
import { executeDelete } from '@/modules/breakout/operations/delete.js';

/**
 * Handles the delete subcommand for breakout rooms
 */
export async function handleDeleteCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) return;

	const force = interaction.options.getBoolean('force') || false;

	const log = logger.child({
		subcommand: 'delete',
		guildId: interaction.guildId,
		force,
	});

	log.info('🎯 Deleting breakout channels');

	await handleInteraction(
		interaction,
		async () => {
			const result = await executeDelete(interaction, force);

			if (result.success) {
				await replyOrEdit(interaction, result.message);
			} else {
				await replyOrEdit(
					interaction,
					result.message || 'Failed to delete breakout rooms.',
				);
			}
		},
		{ deferReply: true, ephemeral: true },
	);
}
