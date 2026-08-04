import type { ChatInputCommandInteraction } from 'discord.js';
import { replyOrEdit } from '@/lib/discord/response.js';
import { logger } from '@/lib/logger.js';
import {
	formatScheduleSummary,
	getTimerSchedule,
} from '@/modules/breakout/constants/timerPresets.js';
import { monitorBreakoutTimer } from '@/modules/breakout/services/timer.js';
import { getRooms, setTimerData } from '@/modules/breakout/state/state.js';

/**
 * Handles the timer subcommand for breakout rooms
 */
export async function handleTimerCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) return;

	const presetOption = interaction.options.getString('preset');
	const minutesOption = interaction.options.getInteger('minutes');

	let minutes: number | null = null;

	if (presetOption && presetOption !== 'custom') {
		minutes = Number.parseInt(presetOption, 10);
	} else if (minutesOption) {
		minutes = minutesOption;
	}

	if (!minutes || minutes <= 0) {
		await replyOrEdit(
			interaction,
			'⚠️ Please select a valid duration preset or specify custom minutes with the `minutes` option.',
		);
		return;
	}

	const log = logger.child({
		subcommand: 'timer',
		guildId: interaction.guildId,
		minutes,
		preset: presetOption || 'custom',
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

	const schedule = getTimerSchedule(minutes);
	const fiveMinWarningTime = minutes - 5;
	const timerData = {
		timerId: `${interaction.guildId}_${Date.now()}`,
		totalMinutes: minutes,
		startTime: Date.now(),
		guildId: interaction.guildId,
		breakoutRooms: breakoutRooms.map((room) => room.id),
		fiveMinSent: fiveMinWarningTime <= 0,
		sentReminders: [],
	};

	await setTimerData(interaction.guildId, timerData);
	monitorBreakoutTimer(timerData, interaction.client).catch((error) => {
		log.error({ err: error }, '❌ Timer monitoring failed');
	});

	const summary = formatScheduleSummary(schedule);
	await replyOrEdit(
		interaction,
		`⏱️ **Breakout timer set for ${minutes} minutes.**\n${summary}`,
	);
}
