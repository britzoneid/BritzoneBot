import { type ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { confirmAction } from '@/lib/discord/confirm.js';
import { preflightBreakout } from '@/lib/discord/permission.js';
import {
	handleInteraction,
	replyOrEdit,
	sendPublicAnnouncement,
} from '@/lib/discord/response.js';
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

	if (interaction.member instanceof GuildMember) {
		const category =
			interaction.channel && 'parent' in interaction.channel
				? interaction.channel.parent
				: undefined;
		const check = preflightBreakout({
			member: interaction.member,
			category: category ?? undefined,
		});

		if (!check.ok) {
			await replyOrEdit(interaction, {
				content: check.reason ?? 'Permission check failed.',
				ephemeral: true,
			});
			return;
		}
	}

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
		await handleInteraction(
			interaction,
			async () => {
				await confirmAction({
					interaction,
					content: `⚠️ ${totalMembers} member(s) are still in existing breakout rooms and no main room is configured. Creating new rooms will disconnect them from voice.`,
					confirmLabel: `Recreate rooms and disconnect ${totalMembers} member(s)`,
					loadingContent: '⏳ Creating breakout rooms...',
					onConfirm: async () => {
						const result = await executeCreate(interaction, numRooms);
						if (result.success) {
							await interaction.editReply({
								content: result.message,
								components: [],
							});
							await sendPublicAnnouncement(interaction, {
								content: `🛠️ ${result.message}`,
							});
						} else {
							await interaction.editReply({
								content: result.message || 'Failed to create breakout rooms.',
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
			const result = await executeCreate(interaction, numRooms);

			if (result.success) {
				await replyOrEdit(interaction, result.message);
				await sendPublicAnnouncement(interaction, {
					content: `🛠️ ${result.message}`,
				});
			} else {
				log.error({ result }, '❌ Error creating breakout rooms');
				await replyOrEdit(interaction, result.message);
			}
		},
		{ deferReply: true, ephemeral: true },
	);
}
