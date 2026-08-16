import { type ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { preflightBreakout } from '@/lib/discord/permission.js';
import { handleInteraction } from '@/lib/discord/response.js';
import { logger } from '@/lib/logger.js';
import {
	getCurrentOperation,
	getMainRoom,
	getRooms,
	getTimerData,
} from '@/modules/breakout/state/state.js';
import { formatBreakoutStatus } from '@/modules/breakout/utils/status.js';

/**
 * Handles the status subcommand for breakout rooms
 */
export async function handleStatusCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) return;

	await handleInteraction(
		interaction,
		async (ctx) => {
			const guild = interaction.guild;
			if (!guild) return;
			const guildId = interaction.guildId;
			if (!guildId) return;

			if (interaction.member instanceof GuildMember) {
				const check = preflightBreakout({
					member: interaction.member,
				});

				if (!check.ok) {
					await ctx.reply(check.reason ?? 'Permission check failed.');
					return;
				}
			}

			const log = logger.child({
				subcommand: 'status',
				guildId,
			});

			log.info('📊 Checking breakout session status');

			const mainRoom = getMainRoom(guild);
			const breakoutRooms = getRooms(guild);
			const timerData = await getTimerData(guildId);
			const currentOp = await getCurrentOperation(guildId);

			const statusText = formatBreakoutStatus({
				mainRoom,
				breakoutRooms,
				timerData,
				currentOperationType: currentOp?.type,
			});

			await ctx.reply(statusText);
		},
		{ ephemeral: true },
	);
}
