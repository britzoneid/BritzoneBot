import type { ChatInputCommandInteraction } from 'discord.js';
import { handleInteraction, replyOrEdit } from '@/lib/discord/response.js';
import { logger } from '@/lib/logger.js';
import { executeCreate } from '@/modules/breakout/operations/create.js';

/**
 * Handles the create subcommand for breakout rooms
 */
export async function handleCreateCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	const numRooms = interaction.options.getInteger('number', true);
	const force = interaction.options.getBoolean('force') || false;
	const log = logger.child({
		subcommand: 'create',
		guildId: interaction.guildId,
		numRooms,
		force,
	});

	log.info('🔢 Creating breakout rooms');

	await handleInteraction(
		interaction,
		async () => {
			const result = await executeCreate(interaction, numRooms, force);

			if (result.success) {
				await replyOrEdit(interaction, result.message);
			} else {
				log.error({ result }, '❌ Error creating breakout rooms');
				await replyOrEdit(interaction, result.message);
			}
		},
		{ deferReply: true, ephemeral: true },
	);
}
