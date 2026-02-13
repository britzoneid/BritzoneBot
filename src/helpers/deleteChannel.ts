import type { VoiceChannel } from 'discord.js';

/**
 * Safely deletes a voice channel
 * @param channel The channel to delete
 * @param reason Reason for deletion
 */
async function deleteChannel(channel: VoiceChannel, reason: string = 'Channel cleanup'): Promise<void> {
  try {
    console.log(`🗑️ Attempting to delete channel: ${channel.name}`);
    await channel.delete(reason);
    console.log(`✅ Successfully deleted channel: ${channel.name}`);
  } catch (error) {
    console.error(`❌ Failed to delete channel ${channel.name}:`, error);
    throw error;
  }
}

export default deleteChannel;
