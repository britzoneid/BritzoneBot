import {
	ChannelType,
	type ChatInputCommandInteraction,
	GuildMember,
	SlashCommandBuilder,
	type StageChannel,
	type VoiceChannel,
} from 'discord.js';
import { confirmAction } from '@/lib/discord/confirm.js';
import { moveUser } from '@/lib/discord/member.js';
import {
	canInvokeBreakout,
	canMemberMoveMembers,
	formatPermissionNames,
	getMissingBotPermissions,
	VOICE_MOVE_PERMISSIONS,
} from '@/lib/discord/permission.js';
import { handleInteraction } from '@/lib/discord/response.js';
import { logger } from '@/lib/logger.js';
import type { Command, MoveFailure, MoveResult } from '@/types/index.js';

/** Longest member list shown in the confirmation preview before it's truncated. */
const MAX_PREVIEW_LIST_LENGTH = 1500;

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('move-all-audience')
		.setDescription(
			'Move everyone from one voice channel into another, after a confirmation preview',
		)
		.addChannelOption((option) =>
			option
				.setName('source')
				.setDescription('The voice channel to move members out of')
				.setRequired(true)
				.addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice),
		)
		.addChannelOption((option) =>
			option
				.setName('destination')
				.setDescription('The voice channel to move members into')
				.setRequired(true)
				.addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice),
		) as SlashCommandBuilder,

	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		if (!interaction.guildId || !interaction.guild) {
			return;
		}

		await handleInteraction(
			interaction,
			async (ctx) => {
				const source = interaction.options.getChannel('source', true) as
					| VoiceChannel
					| StageChannel;
				const destination = interaction.options.getChannel(
					'destination',
					true,
				) as VoiceChannel | StageChannel;

				if (!source.isVoiceBased() || !destination.isVoiceBased()) {
					await ctx.reply(
						'Both the source and destination must be voice or stage channels.',
					);
					return;
				}

				if (source.id === destination.id) {
					await ctx.reply('Source and destination must be different channels.');
					return;
				}

				if (!(interaction.member instanceof GuildMember)) {
					await ctx.reply('Unable to verify your permissions.');
					return;
				}
				const member = interaction.member;

				if (!canInvokeBreakout(member)) {
					await ctx.reply(
						'You do not have the required manager role for this server.',
					);
					return;
				}

				if (!canMemberMoveMembers(member)) {
					await ctx.reply(
						'You need the **Move Members** permission to use this command.',
					);
					return;
				}

				const guild = interaction.guild;
				if (!guild) return;

				const permissionFailures: string[] = [];
				for (const channel of [source, destination]) {
					const missing = getMissingBotPermissions(
						guild,
						channel,
						VOICE_MOVE_PERMISSIONS,
					);
					if (missing.length > 0) {
						permissionFailures.push(
							`**${formatPermissionNames(missing)}** in ${channel.name}`,
						);
					}
				}
				if (permissionFailures.length > 0) {
					await ctx.reply(
						`I'm missing permissions:\n${permissionFailures
							.map((failure) => `• ${failure}`)
							.join('\n')}\nAsk an admin to grant them.`,
					);
					return;
				}

				const membersToMove: GuildMember[] = [...source.members.values()];
				if (membersToMove.length === 0) {
					await ctx.reply(`There is no one in ${source.name} to move.`);
					return;
				}

				const log = logger.child({
					command: 'move-all-audience',
					guildId: interaction.guildId,
					source: source.name,
					destination: destination.name,
				});

				const memberList = membersToMove
					.map((m) => `• ${m.user.tag}`)
					.join('\n');
				const truncatedMemberList =
					memberList.length > MAX_PREVIEW_LIST_LENGTH
						? `${memberList.slice(0, MAX_PREVIEW_LIST_LENGTH)}…`
						: memberList;

				const preview =
					`Move **${membersToMove.length}** member(s) from **${source.name}** to **${destination.name}**?\n\n` +
					truncatedMemberList;

				log.info(
					{ memberCount: membersToMove.length },
					'📤 Sending move-all-audience preview',
				);

				await confirmAction({
					interaction,
					content: preview,
					confirmLabel: 'Move audience',
					loadingContent: `⏳ Moving ${membersToMove.length} member(s)...`,
					onInteractionCollected: ctx.restartTimeout,
					onConfirm: async () => {
						const success: MoveResult[] = [];
						const failed: MoveFailure[] = [];

						for (const target of membersToMove) {
							try {
								await moveUser(target, destination);
								success.push({
									userId: target.id,
									userTag: target.user.tag,
									roomId: destination.id,
									roomName: destination.name,
								});
							} catch (error) {
								log.error(
									{ err: error, user: target.user },
									'❌ Failed to move member',
								);
								failed.push({
									userId: target.id,
									userTag: target.user.tag,
									reason:
										error instanceof Error ? error.message : 'Unknown error',
								});
							}
						}

						log.info(
							{ moved: success.length, failed: failed.length },
							'🎉 move-all-audience completed',
						);

						const summaryLines = [
							`✅ Moved ${success.length}/${membersToMove.length} member(s) to ${destination.name}.`,
						];
						if (failed.length > 0) {
							summaryLines.push(
								`⚠️ Failed to move: ${failed
									.map((f) => f.userTag ?? f.userId ?? 'unknown')
									.join(', ')}`,
							);
						}

						await ctx.editReply({
							content: summaryLines.join('\n'),
							components: [],
						});
					},
				});
			},
			{ deferReply: true, ephemeral: true, handlerTimeoutMs: 120_000 },
		);
	},
};

export default command;
