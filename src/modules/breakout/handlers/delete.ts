import type { ChatInputCommandInteraction } from 'discord.js';
import { confirmAction } from '@/lib/discord/confirm.js';
import {
	handleInteraction,
	replyOrEdit,
	sendPublicAnnouncement,
} from '@/lib/discord/response.js';
import { logger } from '@/lib/logger.js';
import { executeDelete } from '@/modules/breakout/operations/delete.js';
import { getMainRoom, getRooms } from '@/modules/breakout/state/state.js';

/**
 * Handles the delete subcommand for breakout rooms
 */
export async function handleDeleteCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) return;

	const log = logger.child({
		subcommand: 'delete',
		guildId: interaction.guildId,
	});

	log.info('🎯 Deleting breakout channels');

	const breakoutRooms = getRooms(interaction.guild);
	const mainRoom = getMainRoom(interaction.guild);

	let totalMembers = 0;
	for (const room of breakoutRooms) {
		if (room.members && room.members.size > 0) {
			totalMembers += room.members.size;
		}
	}

	// Interactive confirmation if members exist and no main room is configured
	if (totalMembers > 0 && !mainRoom) {
		await handleInteraction(
			interaction,
			async () => {
				await confirmAction({
					interaction,
					content: `⚠️ ${totalMembers} member(s) are still in breakout rooms and no main room is configured. Deleting will disconnect them from voice.`,
					confirmLabel: `Delete and disconnect ${totalMembers} member(s)`,
					loadingContent: '⏳ Deleting breakout rooms...',
					onConfirm: async () => {
						const result = await executeDelete(interaction);
						if (result.success) {
							await interaction.editReply({
								content: result.message,
								components: [],
							});
							await sendPublicAnnouncement(interaction, {
								content: `🗑️ ${result.message}`,
							});
						} else {
							await interaction.editReply({
								content: result.message || 'Failed to delete breakout rooms.',
								components: [],
							});
						}
					},
				});
			},
			{ deferReply: true, ephemeral: true, handlerTimeoutMs: 120_000 },
		);
		return;
	}

	await handleInteraction(
		interaction,
		async () => {
			const result = await executeDelete(interaction);

			if (result.success) {
				await replyOrEdit(interaction, result.message);
				await sendPublicAnnouncement(interaction, {
					content: `🗑️ ${result.message}`,
				});
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
