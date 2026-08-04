import type { Client } from 'discord.js';
import type { Logger } from 'pino';
import { logger } from '@/lib/logger.js';
import {
	formatReminderMessage,
	getTimerSchedule,
} from '@/modules/breakout/constants/timerPresets.js';
import {
	clearTimerData,
	getTimerData,
	setTimerData,
	type TimerData,
} from '@/modules/breakout/state/state.js';

// Track active in-memory timer cleanup functions per guild
const activeTimerCleanups = new Map<string, () => void>();

/**
 * Monitors a breakout timer and sends reminders at exact target times using targeted timeouts.
 *
 * @param timerData Timer configuration data
 * @param client The Discord client instance
 */
export async function monitorBreakoutTimer(
	timerData: TimerData,
	client: Client,
): Promise<void> {
	const { timerId, totalMinutes, startTime, guildId, breakoutRooms } =
		timerData;
	const endTime = startTime + totalMinutes * 60 * 1000;
	const log = logger.child({ guildId, timerId });

	// Cancel any previously scheduled timer timeouts for this guild
	activeTimerCleanups.get(guildId)?.();

	const timeouts: NodeJS.Timeout[] = [];
	const cleanup = () => {
		for (const t of timeouts) {
			clearTimeout(t);
		}
		activeTimerCleanups.delete(guildId);
	};
	activeTimerCleanups.set(guildId, cleanup);

	const now = Date.now();

	// 1. Expired while offline/restarting or past end time
	if (now >= endTime) {
		log.info(
			'⏱️ Timer expired during offline window or past end time. Sending completion notice.',
		);
		await sendReminderWithRetry(
			log,
			guildId,
			breakoutRooms,
			"⏰ **Time's up!** This breakout session has ended.",
			client,
		);
		await clearTimerData(guildId);
		cleanup();
		return;
	}

	// 2. Schedule intermediate reminders from lookup/calculated schedule
	const schedule = getTimerSchedule(totalMinutes);
	const sentReminders = new Set<number>(timerData.sentReminders || []);
	if (timerData.fiveMinSent) {
		sentReminders.add(5);
	}

	for (const remainingMinutes of schedule) {
		const reminderTime = endTime - remainingMinutes * 60 * 1000;
		const delay = reminderTime - now;
		const message = formatReminderMessage(remainingMinutes);

		if (sentReminders.has(remainingMinutes)) {
			continue;
		}

		if (delay > 0) {
			const t = setTimeout(async () => {
				const state = await getTimerData(guildId);
				if (!state || (timerId && state.timerId !== timerId)) return;

				log.info(
					{ roomCount: breakoutRooms.length, remainingMinutes },
					`⏱️ Sending ${remainingMinutes}-minute reminder`,
				);
				await sendReminderWithRetry(
					log,
					guildId,
					breakoutRooms,
					message,
					client,
				);
				const updatedSent = Array.from(
					new Set([...(state.sentReminders || []), remainingMinutes]),
				);
				state.sentReminders = updatedSent;
				if (remainingMinutes === 5) {
					state.fiveMinSent = true;
				}
				await setTimerData(guildId, state);
			}, delay);
			timeouts.push(t);
		} else {
			// Catch-up: send immediately if missed while offline
			log.info(
				{ remainingMinutes },
				`⏱️ Missed ${remainingMinutes}-minute warning while offline. Sending catch-up notice.`,
			);
			await sendReminderWithRetry(log, guildId, breakoutRooms, message, client);
			sentReminders.add(remainingMinutes);
			timerData.sentReminders = Array.from(sentReminders);
			if (remainingMinutes === 5) {
				timerData.fiveMinSent = true;
			}
			await setTimerData(guildId, timerData);
		}
	}

	// 3. Time's Up
	const endDelay = endTime - now;
	const tEnd = setTimeout(async () => {
		const state = await getTimerData(guildId);
		if (!state || (timerId && state.timerId !== timerId)) return;

		log.info('⏱️ Breakout timer ended');
		await sendReminderWithRetry(
			log,
			guildId,
			breakoutRooms,
			"⏰ **Time's up!** This breakout session has ended.",
			client,
		);
		await clearTimerData(guildId);
		cleanup();
	}, endDelay);
	timeouts.push(tEnd);

	log.info(
		{ totalMinutes, endDelayMs: endDelay, scheduledReminders: schedule.length },
		'⏱️ Targeted breakout timer scheduled',
	);
}

/**
 * Sends a reminder message to associated text channels with retry logic.
 *
 * @param guildId The ID of the guild
 * @param roomIds Array of voice channel IDs
 * @param message The reminder message to be sent
 * @param client The Discord.js client instance
 */
async function sendReminderWithRetry(
	log: Logger,
	guildId: string,
	roomIds: string[],
	message: string,
	client: Client,
): Promise<void> {
	const guild = client.guilds.cache.get(guildId);
	if (!guild) {
		logger.error({ guildId }, `❌ Could not find guild`);
		return;
	}

	const maxRetries = 5;

	for (const roomId of roomIds) {
		const voiceChannel = guild.channels.cache.get(roomId);
		if (!voiceChannel) {
			log.warn({ roomId }, `⚠️ Could not find voice channel`);
			continue;
		}

		// assume the voice channel has integrated text channel
		const textChannel = voiceChannel;

		// Type guard: ensure it's a text channel before sending
		if (!textChannel.isTextBased()) {
			log.warn({ channelId: textChannel.id }, `⚠️ Channel is not text-based`);
			continue;
		}
		let success = false;
		let attempts = 0;

		while (!success && attempts < maxRetries) {
			try {
				await textChannel.send(message);
				success = true;
				log.info({ channel: textChannel.name }, `✅ Reminder sent`);
			} catch (error) {
				attempts++;
				log.error(
					{
						err: error,
						attempt: attempts,
						maxRetries,
						channel: textChannel.name,
					},
					`❌ Failed to send reminder`,
				);

				if (attempts < maxRetries) {
					// Exponential backoff
					const delay = Math.min(1000 * 2 ** attempts, 10000);
					log.debug({ delay: delay / 1000 }, `🔄 Retrying reminder send`);
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}

		if (!success) {
			log.error(
				{ channel: textChannel.name, maxRetries },
				`❌ Failed to send reminder after max attempts`,
			);
		}
	}
}
