import {
	type ChatInputCommandInteraction,
	GuildMember,
	type VoiceBasedChannel,
} from 'discord.js';
import { preflightBreakout } from '@/lib/discord/permission.js';
import {
	handleInteraction,
	replyOrEdit,
	sendPublicAnnouncement,
} from '@/lib/discord/response.js';
import { logger } from '@/lib/logger.js';
import { executeRecall } from '@/modules/breakout/operations/recall.js';
import { getMainRoom } from '@/modules/breakout/state/state.js';

/**
 * Handles the recall subcommand for breakout rooms
 */
export async function handleRecallCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) return;

	let mainChannel = interaction.options.getChannel(
		'mainroom',
	) as VoiceBasedChannel | null;

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

	const targetMainChannel = mainChannel;

	if (interaction.member instanceof GuildMember) {
		const check = preflightBreakout({
			member: interaction.member,
			voiceChannel: targetMainChannel,
			requireUserMove: true,
		});

		if (!check.ok) {
			await replyOrEdit(interaction, {
				content: check.reason ?? 'Permission check failed.',
				ephemeral: true,
			});
			return;
		}
	}

	const log = logger.child({
		subcommand: 'recall',
		guildId: interaction.guildId,
		mainRoom: targetMainChannel.name,
	});

	log.info('🎯 Recalling members from breakout session');

	await handleInteraction(
		interaction,
		async () => {
			const result = await executeRecall(interaction, targetMainChannel);

			if (result.success) {
				await replyOrEdit(interaction, result.message);
				await sendPublicAnnouncement(interaction, {
					content: `📢 ${result.message}`,
				});
			} else {
				await replyOrEdit(
					interaction,
					result.message || 'Failed to recall breakout members.',
				);
			}
		},
		{ deferReply: true, ephemeral: true },
	);
}
