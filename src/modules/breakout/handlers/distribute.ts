import type {
	ChatInputCommandInteraction,
	StageChannel,
	VoiceChannel,
} from 'discord.js';
import {
	handleInteraction,
	replyOrEdit,
} from '../../../lib/discord/response.js';
import { logger } from '../../../lib/logger.js';
import { executeDistribute } from '../operations/distribute.js';
import { getRooms } from '../state/session.js';
import { distributeUsers } from '../utils/distribution.js';
import { buildDistributionEmbed } from '../utils/embeds.js';

/**
 * Handles the distribute subcommand for breakout rooms
 */
export async function handleDistributeCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId) return;

	const mainRoom = interaction.options.getChannel('mainroom', true) as
		| VoiceChannel
		| StageChannel;
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

	const breakoutRooms = getRooms(interaction.guildId);

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
				'🧩 Distributing users',
			);

			const distribution = distributeUsers(usersToDistribute, breakoutRooms);

			const result = await executeDistribute(
				interaction,
				mainRoom,
				distribution,
				force,
			);

			if (!result.success) {
				await replyOrEdit(interaction, result.message);
				return;
			}

			log.debug('📝 Creating response embed');
			const embed = buildDistributionEmbed({
				mainRoom,
				breakoutRooms,
				facilitators,
				usersInMainRoom,
				moveResults: result.moveResults,
				distribution,
			});

			log.info('📤 Sending breakout room results');
			await replyOrEdit(interaction, { embeds: [embed] });
		},
		{ deferReply: true, ephemeral: true },
	);
}
