import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	ComponentType,
	MessageFlags,
} from 'discord.js';
import { handleInteraction, replyOrEdit } from '@/lib/discord/response.js';
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
		const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId('confirm_delete')
				.setLabel(`Delete and disconnect ${totalMembers} member(s)`)
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder()
				.setCustomId('cancel_delete')
				.setLabel('Cancel')
				.setStyle(ButtonStyle.Secondary),
		);

		await handleInteraction(
			interaction,
			async () => {
				const response = await replyOrEdit(interaction, {
					content: `⚠️ ${totalMembers} member(s) are still in breakout rooms and no main room is configured. Deleting will disconnect them from voice.`,
					components: [confirmRow],
				});

				const collector = response.createMessageComponentCollector({
					componentType: ComponentType.Button,
					time: 60_000,
				});

				await new Promise<void>((resolve) => {
					collector.on('collect', async (i) => {
						try {
							if (i.user.id !== interaction.user.id) {
								await i.reply({
									content:
										'You are not authorized to interact with this prompt.',
									flags: MessageFlags.Ephemeral,
								});
								return;
							}

							if (i.customId === 'cancel_delete') {
								collector.stop('cancelled');
								log.info('❌ Room deletion cancelled by user');
								await i.update({
									content: '❌ Deletion cancelled.',
									components: [],
								});
								resolve();
								return;
							}

							if (i.customId === 'confirm_delete') {
								collector.stop('confirmed');
								log.info('✅ Room deletion confirmed by user');
								await i.update({
									content: '⏳ Deleting breakout rooms...',
									components: [],
								});

								const result = await executeDelete(interaction);
								if (result.success) {
									await interaction.editReply({
										content: result.message,
										components: [],
									});
								} else {
									await interaction.editReply({
										content:
											result.message || 'Failed to delete breakout rooms.',
										components: [],
									});
								}
								resolve();
							}
						} catch (err) {
							log.error({ err }, 'Failed handling delete component collector');
							resolve();
						}
					});

					collector.on('end', async (_, reason) => {
						if (reason !== 'confirmed' && reason !== 'cancelled') {
							log.warn('⏱️ Delete confirmation timed out');
							try {
								await interaction.editReply({
									content: '⏱️ Delete request timed out.',
									components: [],
								});
							} catch (err) {
								log.error({ err }, 'Failed to edit reply on collector timeout');
							}
						}
						resolve();
					});
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
