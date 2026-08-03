/**
 * BritzoneBot - Discord Bot with TypeScript
 *
 * This is the migrated TypeScript version of your bot entry point.
 * It demonstrates proper TypeScript patterns for discord.js v14.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { logger } from './lib/logger.js';
import { initializeState } from './modules/breakout/state/state.js';
import type { BritzoneClient, Command, Event } from './types/index.js';

const __dirname = import.meta.dirname;

// ============================================================================
// LOGGING SETUP
// ============================================================================

logger.info('🚀 Starting the bot...');
await initializeState();

// ============================================================================
// BOT INITIALIZATION
// ============================================================================

const token = process.env.TOKEN;
if (!token) {
	throw new Error(
		'TOKEN environment variable is not defined. Please create a .env file with your bot token.',
	);
}

// Create client with proper typing
const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
}) as BritzoneClient;

// Initialize commands collection with proper typing
client.commands = new Collection<string, Command>();

// ============================================================================
// COMMAND LOADING
// ============================================================================

logger.info('📂 Loading commands...');

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs
		.readdirSync(commandsPath)
		.filter((file) => file.endsWith('.js'));

	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);

		try {
			// Dynamic import with type casting
			const module = (await import(filePath)) as { default: Command };
			const command = module.default;

			// Type guard: ensure command has required properties
			if ('data' in command && 'execute' in command) {
				client.commands.set(command.data.name, command);
				logger.info({ command: command.data.name }, `✅ Command loaded`);
			} else {
				logger.warn(
					{ filePath },
					`⚠️ [WARNING] Command is missing required "data" or "execute" property.`,
				);
			}
		} catch (error) {
			logger.error({ err: error, filePath }, `❌ Error loading command`);
		}
	}
}

// ============================================================================
// EVENT LOADING
// ============================================================================

logger.info('🎉 Loading events...');

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs
	.readdirSync(eventsPath)
	.filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);

	try {
		// Dynamic import with type casting
		const module = (await import(filePath)) as { default: Event };
		const event = module.default;

		// Type guard: check if event has required properties
		if (event.once) {
			client.once(event.name, (...args) => event.execute(...args));
			logger.info(
				{ event: event.name },
				`🔄 One-time event loaded: ${event.name}`,
			);
		} else {
			client.on(event.name, (...args) => event.execute(...args));
			logger.info({ event: event.name }, `🔁 Event loaded: ${event.name}`);
		}
	} catch (error) {
		logger.error(
			{ err: error, filePath },
			`❌ Error loading event from ${filePath}:`,
		);
	}
}

// ============================================================================
// BOT LOGIN
// ============================================================================

logger.info('🔑 Logging in...');
client
	.login(token)
	.then(() => {
		logger.info('✅ Bot logged in successfully!');
	})
	.catch((err: Error) => {
		logger.fatal({ err }, `❌ Failed to log in: ${err.message}`);
		process.exit(1);
	});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Handle unhandled promise rejections
process.on(
	'unhandledRejection',
	(reason: unknown, _promise: Promise<unknown>) => {
		logger.error({ err: reason }, '❌ Unhandled Promise Rejection:');
	},
);

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
	logger.fatal({ err: error }, '❌ Uncaught Exception:');
	process.exit(1);
});
