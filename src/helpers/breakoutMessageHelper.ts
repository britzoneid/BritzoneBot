import type { VoiceChannel } from 'discord.js';
import breakoutRoomManager from './breakoutRoomManager.js';

/**
 * Result of broadcasting messages to breakout rooms
 */
export interface BroadcastResult {
  success: boolean;
  sent: string[];
  failed: string[];
  message: string;
}

/**
 * Result of sending message to a single channel
 */
export interface ChannelMessageResult {
  success: boolean;
  message: string;
}

/**
 * Broadcasts a message to all breakout rooms
 * @param guildId The ID of the guild
 * @param message The message to broadcast
 * @returns Result with list of successful and failed sends
 */
export async function broadcastToBreakoutRooms(guildId: string, message: string): Promise<BroadcastResult> {
  console.log(`📢 Broadcasting message to breakout rooms in guild ${guildId}`);
  const rooms = breakoutRoomManager.getRooms(guildId);

  if (!rooms || rooms.length === 0) {
    console.log('❌ No breakout rooms found for broadcasting');
    return {
      success: false,
      sent: [],
      failed: [],
      message: 'No breakout rooms found',
    };
  }

  const results = {
    sent: [] as string[],
    failed: [] as string[],
  };

  for (const room of rooms) {
    try {
      // Type guard to check if channel supports sending messages
      if ('send' in room && typeof room.send === 'function') {
        await room.send(message);
        results.sent.push(room.name);
        console.log(`✅ Message sent to ${room.name}`);
      } else {
        console.log(`⚠️ Channel ${room.name} does not support sending messages`);
        results.failed.push(room.name);
      }
    } catch (error) {
      console.error(`❌ Failed to send message to ${room.name}:`, error);
      results.failed.push(room.name);
    }
  }

  return {
    success: results.sent.length > 0,
    sent: results.sent,
    failed: results.failed,
    message: `Message broadcast complete. Success: ${results.sent.length}, Failed: ${results.failed.length}`,
  };
}

/**
 * Sends a message to a specific voice channel
 * @param channel The voice channel to send the message to
 * @param message The message to send
 * @returns Result indicating success or failure
 */
export async function sendMessageToChannel(channel: VoiceChannel, message: string): Promise<ChannelMessageResult> {
  console.log(`📨 Attempting to send message to channel ${channel.name}`);

  try {
    // Type guard to check if channel supports sending messages
    if ('send' in channel && typeof channel.send === 'function') {
      await channel.send(message);
      console.log(`✅ Message sent successfully to ${channel.name}`);
      return {
        success: true,
        message: `Message sent successfully to ${channel.name}`,
      };
    } else {
      console.log(`⚠️ Channel ${channel.name} does not support sending messages`);
      return {
        success: false,
        message: `Channel ${channel.name} does not support sending messages`,
      };
    }
  } catch (error: any) {
    console.error(`❌ Failed to send message to ${channel.name}:`, error);
    return {
      success: false,
      message: `Failed to send message to ${channel.name}: ${error.message}`,
    };
  }
}
