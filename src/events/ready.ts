import { Events } from 'discord.js';
import { logger } from '../lib/logger.js';
import type { Event } from '../types/index.js';

/**
 * Ready event - fires once when the bot is ready
 * This example shows proper TypeScript event typing
 */
const event: Event<typeof Events.ClientReady> = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		// TypeScript automatically knows that:
		// - client is of type Client
		// - client.user is defined (not null)
		// - client.user.tag is a string
		logger.info(
			{ user: client.user },
			`✅ Ready! Logged in as ${client.user?.tag}`,
		);
	},
};

export default event;
