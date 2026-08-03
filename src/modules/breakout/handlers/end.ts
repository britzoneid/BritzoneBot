import type {
	ChatInputCommandInteraction,
	VoiceBasedChannel,
} from 'discord.js';
import {
	handleInteraction,
	replyOrEdit,
} from '../../../lib/discord/response.js';
import { logger } from '../../../lib/logger.js';
import { executeEnd } from '../operations/end.js';
import { getMainRoom } from '../state/state.js';

/**
 * Handles the end subcommand for breakout rooms
 */
export async function handleEndCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) return;

	// Support both 'mainroom' (standardized) and 'main_room' (legacy fallback)
	let mainChannel = (interaction.options.getChannel('mainroom') ||
		interaction.options.getChannel('main_room')) as VoiceBasedChannel | null;
	const force = interaction.options.getBoolean('force') || false;

	if (!mainChannel) {
		const storedMainChannel = getMainRoom(interaction.guild);
		if (storedMainChannel) {
			mainChannel = storedMainChannel;
		} else {
			await replyOrEdit(
				interaction,
				'Please specify a main voice channel where users should be moved back.',
			);
			return;
		}
	}

	const log = logger.child({
		subcommand: 'end',
		guildId: interaction.guildId,
		mainRoom: mainChannel.name,
		force,
	});

	log.info('🎯 Ending breakout session');

	await handleInteraction(
		interaction,
		async () => {
			const result = await executeEnd(interaction, mainChannel, force);

			if (result.success) {
				await replyOrEdit(interaction, result.message);
			} else {
				await replyOrEdit(
					interaction,
					result.message || 'Failed to end breakout session.',
				);
			}
		},
		{ deferReply: true, ephemeral: true },
	);
}
