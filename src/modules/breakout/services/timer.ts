import {
	ChannelType,
	type ChatInputCommandInteraction,
	type Client,
	type GuildBasedChannel,
} from 'discord.js';
import { logger } from '../../../lib/logger.js';
import {
	clearTimerData,
	getTimerData,
	setTimerData,
	type TimerData,
} from '../state/state.js';

/**
 * Monitors a breakout timer and sends reminders at defined intervals.
 *
 * @param timerData Timer configuration data
 * @param interaction The Discord command interaction
 */
export async function monitorBreakoutTimer(
	timerData: TimerData,
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	const { totalMinutes, startTime, guildId, breakoutRooms } = timerData;
	const endTime = startTime + totalMinutes * 60 * 1000;

	logger.info({ totalMinutes, guildId }, `⏱️ Started breakout timer monitoring`);

	// Use recursive setTimeout to prevent overlapping async executions
	async function monitorTick(): Promise<void> {
		try {
			const timerState = await getTimerData(guildId);
			if (!timerState) {
				logger.debug({ guildId }, `⏱️ Timer was cancelled or removed`);
				return; // Stop monitoring
			}

			const now = Date.now();
			const minutesLeft = Math.ceil((endTime - now) / (60 * 1000));

			if (minutesLeft <= 5 && !timerState.fiveMinSent) {
				logger.info(
					{ roomCount: breakoutRooms.length },
					`⏱️ Sending 5-minute warning`,
				);
				await sendReminderWithRetry(
					guildId,
					breakoutRooms,
					'⏱️ **5 minutes remaining** in this breakout session.',
					interaction.client,
				);

				timerState.fiveMinSent = true;
				await setTimerData(guildId, timerState);
			}

			if (now >= endTime) {
				logger.info({ guildId }, `⏱️ Breakout timer ended`);
				await sendReminderWithRetry(
					guildId,
					breakoutRooms,
					"⏰ **Time's up!** This breakout session has ended.",
					interaction.client,
				);

				await clearTimerData(guildId);
				return; // Stop monitoring
			}

			// Schedule next check after all async work completes
			setTimeout(() => monitorTick(), 20000);
		} catch (error) {
			logger.error({ err: error }, `❌ Error in timer monitoring`);
			// Continue monitoring despite errors
			setTimeout(() => monitorTick(), 20000);
		}
	}

	// Start the monitoring loop
	await monitorTick();
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
	const retryDelay = 5000;

	for (const roomId of roomIds) {
		const voiceChannel = guild.channels.cache.get(roomId);
		if (!voiceChannel) {
			logger.warn({ roomId }, `⚠️ Could not find voice channel`);
			continue;
		}

		// Try to find a text channel that matches the voice channel name
		// This logic assumes a naming convention used in the project
		const textChannel = guild.channels.cache.find(
			(c: GuildBasedChannel) =>
				c.type === ChannelType.GuildText &&
				c.name
					.toLowerCase()
					.includes(voiceChannel.name.toLowerCase().replace(/\s+/g, '-')),
		);

		if (!textChannel) {
			logger.warn(
				{ voiceChannel: voiceChannel.name },
				`⚠️ Could not find matching text channel`,
			);
			continue;
		}

		// Type guard: ensure it's a text channel before sending
		if (!textChannel.isTextBased()) {
			logger.warn({ channelId: textChannel.id }, `⚠️ Channel is not text-based`);
			continue;
		}

		let success = false;
		let attempts = 0;

		while (!success && attempts < maxRetries) {
			try {
				await textChannel.send(message);
				success = true;
				logger.info({ channel: textChannel.name }, `✅ Reminder sent`);
			} catch (error) {
				attempts++;
				logger.error(
					{
						err: error,
						attempt: attempts,
						maxRetries,
						channel: textChannel.name,
					},
					`❌ Failed to send reminder`,
				);

				if (attempts < maxRetries) {
					logger.debug(
						{ delay: retryDelay / 1000 },
						`🔄 Retrying reminder send`,
					);
					await new Promise((resolve) => setTimeout(resolve, retryDelay));
				}
			}
		}

		if (!success) {
			logger.error(
				{ channel: textChannel.name, maxRetries },
				`❌ Failed to send reminder after max attempts`,
			);
		}
	}
}
