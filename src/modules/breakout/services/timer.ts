import {
	ChannelType,
	type ChatInputCommandInteraction,
	type Client,
	type GuildBasedChannel,
} from 'discord.js';
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

	console.log(
		`⏱️ Started breakout timer monitoring for ${totalMinutes} minutes in guild ${guildId}`,
	);

	// Use recursive setTimeout to prevent overlapping async executions
	async function monitorTick(): Promise<void> {
		try {
			const timerState = await getTimerData(guildId);
			if (!timerState) {
				console.log(`⏱️ Timer for guild ${guildId} was cancelled or removed`);
				return; // Stop monitoring
			}

			const now = Date.now();
			const minutesLeft = Math.ceil((endTime - now) / (60 * 1000));

			if (minutesLeft <= 5 && !timerState.fiveMinSent) {
				console.log(
					`⏱️ Sending 5-minute warning to ${breakoutRooms.length} breakout rooms`,
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
				console.log(`⏱️ Breakout timer ended for guild ${guildId}`);
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
			console.error(`❌ Error in timer monitoring:`, error);
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
		console.error(`❌ Could not find guild with ID ${guildId}`);
		return;
	}

	const maxRetries = 5;
	const retryDelay = 5000;

	for (const roomId of roomIds) {
		const voiceChannel = guild.channels.cache.get(roomId);
		if (!voiceChannel) {
			console.log(`⚠️ Could not find voice channel ${roomId}`);
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
			console.log(`⚠️ Could not find text channel for ${voiceChannel.name}`);
			continue;
		}

		// Type guard: ensure it's a text channel before sending
		if (!textChannel.isTextBased()) {
			console.log(`⚠️ Channel ${textChannel.id} is not text-based`);
			continue;
		}

		let success = false;
		let attempts = 0;

		while (!success && attempts < maxRetries) {
			try {
				await textChannel.send(message);
				success = true;
				console.log(`✅ Reminder sent to ${textChannel.name}`);
			} catch (error) {
				attempts++;
				console.error(
					`❌ Attempt ${attempts}/${maxRetries} - Failed to send reminder to ${textChannel.name}:`,
					error,
				);

				if (attempts < maxRetries) {
					console.log(`🔄 Retrying in ${retryDelay / 1000} seconds...`);
					await new Promise((resolve) => setTimeout(resolve, retryDelay));
				}
			}
		}

		if (!success) {
			console.error(
				`❌ Failed to send reminder to ${textChannel.name} after ${maxRetries} attempts`,
			);
		}
	}
}
