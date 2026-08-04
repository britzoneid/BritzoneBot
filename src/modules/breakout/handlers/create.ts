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
import { executeCreate } from '@/modules/breakout/operations/create.js';
import { hasExistingBreakoutRooms } from '@/modules/breakout/services/room.js';
import { getMainRoom } from '@/modules/breakout/state/state.js';

/**
 * Handles the create subcommand for breakout rooms
 */
export async function handleCreateCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) return;

	const numRooms = interaction.options.getInteger('number', true);
	const log = logger.child({
		subcommand: 'create',
		guildId: interaction.guildId,
		numRooms,
	});

	log.info('🔢 Creating breakout rooms');

	const existing = await hasExistingBreakoutRooms(interaction.guild);
	const mainRoom = getMainRoom(interaction.guild);

	let totalMembers = 0;
	if (existing.exists) {
		for (const room of existing.rooms) {
			if (room.members && room.members.size > 0) {
				totalMembers += room.members.size;
			}
		}
	}

	// Interactive confirmation if existing rooms have members and no main room is configured
	if (totalMembers > 0 && !mainRoom) {
		const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId('confirm_create')
				.setLabel(`Recreate rooms and disconnect ${totalMembers} member(s)`)
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder()
				.setCustomId('cancel_create')
				.setLabel('Cancel')
				.setStyle(ButtonStyle.Secondary),
		);

		await handleInteraction(
			interaction,
			async () => {
				const response = await replyOrEdit(interaction, {
					content: `⚠️ ${totalMembers} member(s) are still in existing breakout rooms and no main room is configured. Creating new rooms will disconnect them from voice.`,
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

							if (i.customId === 'cancel_create') {
								collector.stop('cancelled');
								log.info('❌ Room creation cancelled by user');
								await i.update({
									content: '❌ Creation cancelled.',
									components: [],
								});
								resolve();
								return;
							}

							if (i.customId === 'confirm_create') {
								collector.stop('confirmed');
								log.info('✅ Room creation confirmed by user');
								await i.update({
									content: '⏳ Creating breakout rooms...',
									components: [],
								});

								const result = await executeCreate(interaction, numRooms);
								if (result.success) {
									await interaction.editReply({
										content: result.message,
										components: [],
									});
								} else {
									await interaction.editReply({
										content:
											result.message || 'Failed to create breakout rooms.',
										components: [],
									});
								}
								resolve();
							}
						} catch (err) {
							log.error({ err }, 'Failed handling create component collector');
							resolve();
						}
					});

					collector.on('end', async (_, reason) => {
						if (reason !== 'confirmed' && reason !== 'cancelled') {
							log.warn('⏱️ Create confirmation timed out');
							try {
								await interaction.editReply({
									content: '⏱️ Create request timed out.',
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
			const result = await executeCreate(interaction, numRooms);

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
