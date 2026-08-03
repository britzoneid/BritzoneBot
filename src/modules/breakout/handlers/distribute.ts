import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	ComponentType,
	type StageChannel,
	type VoiceChannel,
} from 'discord.js';
import {
	handleInteraction,
	replyOrEdit,
} from '../../../lib/discord/response.js';
import { logger } from '../../../lib/logger.js';
import { executeDistribute } from '../operations/distribute.js';
import { getRooms } from '../state/state.js';
import { distributeUsers } from '../utils/distribution.js';
import { buildDistributionEmbed } from '../utils/embeds.js';

/**
 * Handles the distribute subcommand for breakout rooms
 */
export async function handleDistributeCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) return;

	const mainRoom = interaction.options.getChannel('mainroom', true) as
		| VoiceChannel
		| StageChannel;

	if (!mainRoom?.isVoiceBased()) {
		await replyOrEdit(interaction, {
			content: 'Selected main room must be a voice or stage channel.',
			ephemeral: true,
		});
		return;
	}

	const facilitatorsInput = interaction.options.getString('facilitators');
	const force = interaction.options.getBoolean('force') || false;

	const log = logger.child({
		subcommand: 'distribute',
		guildId: interaction.guildId,
		mainRoom: mainRoom.name,
		force,
	});
	log.info('🎯 Main room selected');

	// Process facilitators if provided
	const facilitators = new Set<string>();
	if (facilitatorsInput) {
		const mentionPattern = /<@!?(\d+)>/g;
		const matches = facilitatorsInput.matchAll(mentionPattern);
		for (const match of matches) {
			facilitators.add(match[1]);
		}
		log.debug({ count: facilitators.size }, '👥 Facilitators identified');
	}

	const breakoutRooms = getRooms(interaction.guild);

	if (breakoutRooms.length === 0) {
		log.warn('❌ Error: No breakout rooms found');
		await replyOrEdit(
			interaction,
			'No breakout rooms found! Please create breakout rooms first with `/breakout create`.',
		);
		return;
	}

	const usersInMainRoom = mainRoom.members;

	if (usersInMainRoom.size === 0) {
		log.warn(`⚠️ No users found in ${mainRoom.name}`);
		await replyOrEdit(interaction, `There are no users in ${mainRoom.name}.`);
		return;
	}

	await handleInteraction(
		interaction,
		async () => {
			const usersToDistribute = Array.from(usersInMainRoom.values()).filter(
				(member) => !facilitators.has(member.user.id),
			);

			log.info(
				{
					usersCount: usersToDistribute.length,
					roomsCount: breakoutRooms.length,
				},
				'🧩 Calculating distribution plan',
			);

			const distribution = distributeUsers(usersToDistribute, breakoutRooms);

			log.debug('📝 Creating preview embed');
			const previewEmbed = buildDistributionEmbed({
				mainRoom,
				breakoutRooms,
				facilitators,
				usersInMainRoom,
				distribution,
				isPreview: true,
			});

			const confirmButton = new ButtonBuilder()
				.setCustomId('confirm_distribute')
				.setLabel('Confirm')
				.setStyle(ButtonStyle.Success);

			const cancelButton = new ButtonBuilder()
				.setCustomId('cancel_distribute')
				.setLabel('Cancel')
				.setStyle(ButtonStyle.Secondary);

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				confirmButton,
				cancelButton,
			);

			log.info('📤 Sending preview with confirmation buttons');
			const response = await replyOrEdit(interaction, {
				embeds: [previewEmbed],
				components: [row],
			});

			// Await button confirmation
			const collector = response.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 60_000,
			});

			collector.on('collect', async (i) => {
				if (i.user.id !== interaction.user.id) {
					await i.reply({
						content:
							'You are not authorized to interact with this distribution preview.',
						ephemeral: true,
					});
					return;
				}

				if (i.customId === 'cancel_distribute') {
					collector.stop('cancelled');
					log.info('❌ Distribution cancelled by user');
					await i.update({
						content: '❌ Distribution cancelled.',
						embeds: [previewEmbed],
						components: [],
					});
					return;
				}

				if (i.customId === 'confirm_distribute') {
					collector.stop('confirmed');
					log.info('✅ Distribution confirmed by user');

					await i.update({
						content: '⏳ Distributing users to breakout rooms...',
						embeds: [previewEmbed],
						components: [],
					});

					const result = await executeDistribute(
						interaction,
						mainRoom,
						distribution,
						force,
					);

					if (!result.success) {
						await interaction.editReply({
							content: `❌ ${result.message}`,
							embeds: [],
							components: [],
						});
						return;
					}

					log.debug('📝 Creating final response embed');
					const finalEmbed = buildDistributionEmbed({
						mainRoom,
						breakoutRooms,
						facilitators,
						usersInMainRoom,
						moveResults: result.moveResults,
						distribution,
					});

					log.info('📤 Distribution completed successfully');
					await interaction.editReply({
						content: null,
						embeds: [finalEmbed],
						components: [],
					});
				}
			});

			collector.on('end', async (_, reason) => {
				if (reason !== 'confirmed' && reason !== 'cancelled') {
					log.warn('⏱️ Distribution preview confirmation timed out');
					const disabledRow =
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							confirmButton.setDisabled(true),
							cancelButton.setDisabled(true),
						);
					try {
						await interaction.editReply({
							content: '⏱️ Distribution request timed out.',
							embeds: [previewEmbed],
							components: [disabledRow],
						});
					} catch (err) {
						log.error({ err }, 'Failed to edit reply on collector timeout');
					}
				}
			});
		},
		{ deferReply: true, ephemeral: true, handlerTimeoutMs: 120_000 },
	);
}
