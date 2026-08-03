import type { ChatInputCommandInteraction } from 'discord.js';
import { replyOrEdit } from '@/lib/discord/response.js';
import { logger } from '@/lib/logger.js';
import { monitorBreakoutTimer } from '@/modules/breakout/services/timer.js';
import { getRooms, setTimerData } from '@/modules/breakout/state/state.js';

/**
 * Handles the timer subcommand for breakout rooms
 */
export async function handleTimerCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) return;

	const minutes = interaction.options.getInteger('minutes', true);
	const log = logger.child({
		subcommand: 'timer',
		guildId: interaction.guildId,
		minutes,
	});

	log.info('⏱️ Setting breakout timer');

	const breakoutRooms = getRooms(interaction.guild);

	if (breakoutRooms.length === 0) {
		log.warn('❌ Error: No breakout rooms found');
		await replyOrEdit(
			interaction,
			'No breakout rooms found! Please create breakout rooms first with `/breakout create`.',
		);
		return;
	}

	const fiveMinWarningTime = minutes - 5;
	const timerData = {
		timerId: `${interaction.guildId}_${Date.now()}`,
		totalMinutes: minutes,
		startTime: Date.now(),
		guildId: interaction.guildId,
		breakoutRooms: breakoutRooms.map((room) => room.id),
		fiveMinSent: fiveMinWarningTime <= 0,
	};

	await setTimerData(interaction.guildId, timerData);
	monitorBreakoutTimer(timerData, interaction.client).catch((error) => {
		log.error({ err: error }, '❌ Timer monitoring failed');
	});

	await replyOrEdit(
		interaction,
		`⏱️ Breakout timer set for ${minutes} minutes. Reminder will be sent at 5 minute mark.`,
	);
}
