import { type ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { preflightBreakout } from '@/lib/discord/permission.js';
import { handleInteraction } from '@/lib/discord/response.js';
import { logger } from '@/lib/logger.js';
import {
	formatScheduleSummary,
	getTimerSchedule,
} from '@/modules/breakout/constants/timerPresets.js';
import {
	cancelBreakoutTimer,
	monitorBreakoutTimer,
} from '@/modules/breakout/services/timer.js';
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

	await handleInteraction(
		interaction,
		async (ctx) => {
			const guild = interaction.guild;
			if (!guild) return;
			const guildId = interaction.guildId;
			if (!guildId) return;

			const minutesOption = interaction.options.getString('minutes');
			const customMinutesOption =
				interaction.options.getInteger('custom_minutes');

			if (minutesOption === 'cancel') {
				const canceled = await cancelBreakoutTimer(guildId);
				if (canceled) {
					await ctx.reply('⏱️ **Breakout timer canceled.**');
				} else {
					await ctx.reply('ℹ️ No active breakout timer to cancel.');
				}
				return;
			}

			let minutes: number | null = null;

			if (customMinutesOption !== null) {
				if (customMinutesOption < 30) {
					await ctx.reply(
						'⚠️ Custom timer duration must be at least 30 minutes.',
					);
					return;
				}
				minutes = customMinutesOption;
			} else if (minutesOption === 'custom') {
				await ctx.reply(
					'⚠️ Please provide the `custom_minutes` option (minimum 30 minutes) when choosing Custom duration.',
				);
				return;
			} else if (minutesOption) {
				minutes = Number.parseFloat(minutesOption);
			}

			if (minutes === null || Number.isNaN(minutes) || minutes <= 0) {
				await ctx.reply(
					'⚠️ Please select a duration preset or provide a custom duration in minutes (minimum 30 minutes). Use `/breakout status` to check active session status.',
				);
				return;
			}

			if (minutes !== 0.05 && minutes < 30) {
				await ctx.reply('⚠️ Timer duration must be at least 30 minutes.');
				return;
			}

			const autoRecallOption =
				interaction.options.getBoolean('auto_recall') ?? true;
			const gracePeriodOption = interaction.options.getInteger('grace_period');
			const gracePeriodSeconds = gracePeriodOption ?? 60;

			const mainRoom = getMainRoom(guild);
			const breakoutRooms = getRooms(guild);

			if (interaction.member instanceof GuildMember) {
				const check = preflightBreakout({
					member: interaction.member,
					voiceChannel: mainRoom,
					channels: breakoutRooms,
					requireUserMove: autoRecallOption && !!mainRoom,
				});

				if (!check.ok) {
					await ctx.reply(check.reason ?? 'Permission check failed.');
					return;
				}
			}

			const log = logger.child({
				subcommand: 'timer',
				guildId,
				minutes,
				autoRecallOption,
				gracePeriodSeconds,
			});

			log.info('⏱️ Setting breakout timer');

			if (breakoutRooms.length === 0) {
				log.warn('❌ Error: No breakout rooms found');
				await ctx.reply(
					'No breakout rooms found! Please create breakout rooms first with `/breakout create`.',
				);
				return;
			}

			const autoRecall = autoRecallOption && !!mainRoom;
			const schedule = getTimerSchedule(minutes);
			const fiveMinWarningTime = minutes - 5;
			const timerData: TimerData = {
				timerId: `${guildId}_${Date.now()}`,
				totalMinutes: minutes,
				startTime: Date.now(),
				guildId,
				breakoutRooms: breakoutRooms.map((room) => room.id),
				fiveMinSent: fiveMinWarningTime <= 0,
				sentReminders: [],
				autoRecall,
				gracePeriodSeconds,
				mainRoomId: mainRoom?.id,
			};

			await setTimerData(guildId, timerData);
			monitorBreakoutTimer(timerData, interaction.client).catch((error) => {
				log.error({ err: error }, '❌ Timer monitoring failed');
			});

			const summary = formatScheduleSummary(schedule);

			let autoRecallNote =
				'ℹ️ Auto-recall is disabled. Run `/breakout recall` manually when ready.';
			if (autoRecall && mainRoom) {
				autoRecallNote =
					gracePeriodSeconds > 0
						? `🔁 **Auto-recall** to *${mainRoom.name}* when time is up (with a ${gracePeriodSeconds}s grace period).`
						: `🔁 **Auto-recall** to *${mainRoom.name}* immediately when time is up.`;
			} else if (!mainRoom && autoRecallOption) {
				autoRecallNote =
					'ℹ️ Auto-recall is disabled (no main room configured). Run `/breakout recall` manually when ready.';
			}

			const durationText =
				minutes < 1
					? `${Math.round(minutes * 60)} seconds`
					: `${minutes} minutes`;

			await ctx.reply(
				`⏱️ **Breakout timer set for ${durationText}.**\n${summary}\n${autoRecallNote}`,
			);
		},
		{ deferReply: true, ephemeral: true },
	);
}
