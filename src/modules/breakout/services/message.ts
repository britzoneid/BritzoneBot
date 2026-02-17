import type { VoiceChannel } from 'discord.js';
import { logger } from '../../../lib/logger.js';
import { getRooms } from '../state/session.js';

interface BroadcastResult {
	success: boolean;
	sent: string[];
	failed: string[];
	message: string;
}

interface ChannelMessageResult {
	success: boolean;
	message: string;
}

/**
 * Broadcasts a message to all breakout rooms
 * @param guildId The ID of the guild
 * @param message The message to broadcast
 * @returns Result with list of successful and failed sends
 */
export async function broadcastToBreakoutRooms(
	guildId: string,
	message: string,
): Promise<BroadcastResult> {
	logger.info({ guildId }, `📢 Broadcasting message to breakout rooms`);
	const rooms = getRooms(guildId);

	if (!rooms || rooms.length === 0) {
		logger.warn({ guildId }, '❌ No breakout rooms found for broadcasting');
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
				logger.debug({ room: room.name }, `✅ Message sent`);
			} else {
				logger.warn(
					{ room: room.name },
					`⚠️ Channel does not support sending messages`,
				);
				results.failed.push(room.name);
			}
		} catch (error: unknown) {
			logger.error(
				{ err: error, room: room.name },
				`❌ Failed to send message`,
			);
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
export async function sendMessageToChannel(
	channel: VoiceChannel,
	message: string,
): Promise<ChannelMessageResult> {
	logger.debug(
		{ channel: channel.name },
		`📨 Attempting to send message to channel`,
	);

	try {
		// Type guard to check if channel supports sending messages
		if ('send' in channel && typeof channel.send === 'function') {
			await channel.send(message);
			logger.info({ channel: channel.name }, `✅ Message sent successfully`);
			return {
				success: true,
				message: `Message sent successfully to ${channel.name}`,
			};
		} else {
			logger.warn(
				{ channel: channel.name },
				`⚠️ Channel does not support sending messages`,
			);
			return {
				success: false,
				message: `Channel ${channel.name} does not support sending messages`,
			};
		}
	} catch (error: unknown) {
		logger.error(
			{ err: error, channel: channel.name },
			`❌ Failed to send message`,
		);
		const errorMsg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: `Failed to send message to ${channel.name}: ${errorMsg}`,
		};
	}
}
