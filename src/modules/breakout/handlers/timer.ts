import type { ChatInputCommandInteraction } from 'discord.js';
import { replyOrEdit } from '@/lib/discord/response.js';
import { logger } from '@/lib/logger.js';
import {
	formatScheduleSummary,
	getTimerSchedule,
} from '@/modules/breakout/constants/timerPresets.js';
import { monitorBreakoutTimer } from '@/modules/breakout/services/timer.js';
import {
	getMainRoom,
	getRooms,
	setTimerData,
	type TimerData,
} from '@/modules/breakout/state/state.js';

/**
 * Handles the timer subcommand for breakout rooms
 */
export async function handleTimerCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) return;

	const minutesOption = interaction.options.getString('minutes', true);
	const minutes = Number.parseInt(minutesOption, 10);
	const autoRecallOption =
		interaction.options.getBoolean('auto_recall') ?? true;

	if (!minutes || minutes <= 0) {
		await replyOrEdit(
			interaction,
			'⚠️ Please select a valid duration in minutes.',
		);
		return;
	}

	const log = logger.child({
		subcommand: 'timer',
		guildId: interaction.guildId,
		minutes,
		autoRecallOption,
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

	const mainRoom = getMainRoom(interaction.guild);
	const autoRecall = autoRecallOption && !!mainRoom;

	const schedule = getTimerSchedule(minutes);
	const fiveMinWarningTime = minutes - 5;
	const timerData: TimerData = {
		timerId: `${interaction.guildId}_${Date.now()}`,
		totalMinutes: minutes,
		startTime: Date.now(),
		guildId: interaction.guildId,
		breakoutRooms: breakoutRooms.map((room) => room.id),
		fiveMinSent: fiveMinWarningTime <= 0,
		sentReminders: [],
		autoRecall,
		mainRoomId: mainRoom?.id,
	};

	await setTimerData(interaction.guildId, timerData);
	monitorBreakoutTimer(timerData, interaction.client).catch((error) => {
		log.error({ err: error }, '❌ Timer monitoring failed');
	});

	const summary = formatScheduleSummary(schedule);

	let autoRecallNote =
		'ℹ️ Auto-recall is disabled. Run `/breakout recall` manually when ready.';
	if (autoRecall && mainRoom) {
		autoRecallNote = `🔁 **Auto-recall** to *${mainRoom.name}* when time is up.`;
	} else if (!mainRoom && autoRecallOption) {
		autoRecallNote =
			'ℹ️ Auto-recall is disabled (no main room configured). Run `/breakout recall` manually when ready.';
	}

	await replyOrEdit(
		interaction,
		`⏱️ **Breakout timer set for ${minutes} minutes.**\n${summary}\n${autoRecallNote}`,
	);
}
