import { ChannelType, type ChatInputCommandInteraction, type Client, type GuildBasedChannel } from 'discord.js';
import stateManager, { type TimerData } from '../state/StateManager.js';

class TimerService {
  /**
   * Monitors a breakout timer and sends reminders at defined intervals.
   *
   * @param timerData Timer configuration data
   * @param interaction The Discord command interaction
   */
  async monitorBreakoutTimer(timerData: TimerData, interaction: ChatInputCommandInteraction): Promise<void> {
    const { totalMinutes, startTime, guildId, breakoutRooms } = timerData;
    const endTime = startTime + totalMinutes * 60 * 1000;

    // Initial check
    let timerState = await stateManager.getTimerData(guildId);

    console.log(`⏱️ Started breakout timer monitoring for ${totalMinutes} minutes in guild ${guildId}`);

    const intervalId = setInterval(async () => {
      try {
        timerState = await stateManager.getTimerData(guildId);
        if (!timerState) {
          console.log(`⏱️ Timer for guild ${guildId} was cancelled or removed`);
          clearInterval(intervalId);
          return;
        }

        const now = Date.now();
        const minutesLeft = Math.ceil((endTime - now) / (60 * 1000));

        if (minutesLeft <= 5 && !timerState.fiveMinSent) {
          console.log(`⏱️ Sending 5-minute warning to ${breakoutRooms.length} breakout rooms`);
          await this.sendReminderWithRetry(
            guildId,
            breakoutRooms,
            '⏱️ **5 minutes remaining** in this breakout session.',
            interaction.client,
          );

          timerState.fiveMinSent = true;
          await stateManager.setTimerData(guildId, timerState);
        }

        if (now >= endTime) {
          console.log(`⏱️ Breakout timer ended for guild ${guildId}`);
          await this.sendReminderWithRetry(
            guildId,
            breakoutRooms,
            "⏰ **Time's up!** This breakout session has ended.",
            interaction.client,
          );

          await stateManager.clearTimerData(guildId);
          clearInterval(intervalId);
        }
      } catch (error) {
        console.error(`❌ Error in timer monitoring:`, error);
      }
    }, 20000);
  }

  /**
   * Sends a reminder message to associated text channels with retry logic.
   *
   * @param guildId The ID of the guild
   * @param roomIds Array of voice channel IDs
   * @param message The reminder message to be sent
   * @param client The Discord.js client instance
   */
  private async sendReminderWithRetry(
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

      const textChannel = guild.channels.cache.find(
        (c: GuildBasedChannel) =>
          c.type === ChannelType.GuildText &&
          c.name.toLowerCase().includes(voiceChannel.name.toLowerCase().replace(/\s+/g, '-')),
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
        console.error(`❌ Failed to send reminder to ${textChannel.name} after ${maxRetries} attempts`);
      }
    }
  }
}

export default new TimerService();
