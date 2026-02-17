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
import consoleStamp from 'console-stamp';
import type { BritzoneClient, Command, Event } from './types/index.js';

const __dirname = import.meta.dirname;

// Configure console-stamp for better log formatting
consoleStamp(console, { format: ':date(HH:MM:ss)' });

// ============================================================================
// LOGGING SETUP
// ============================================================================



console.log('🚀 Starting the bot...');

// ============================================================================
// BOT INITIALIZATION
// ============================================================================

const token = process.env.TOKEN;
if (!token) {
  throw new Error('TOKEN environment variable is not defined. Please create a .env file with your bot token.');
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

console.log('📂 Loading commands...');

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);

    try {
      // Dynamic import with type casting
      const module = (await import(filePath)) as { default: Command };
      const command = module.default;

      // Type guard: ensure command has required properties
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`✅ Command loaded: ${command.data.name}`);
      } else {
        console.log(
          `⚠️ [WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
        );
      }
    } catch (error) {
      console.error(`❌ Error loading command from ${filePath}:`, error);
    }
  }
}

// ============================================================================
// EVENT LOADING
// ============================================================================

console.log('🎉 Loading events...');

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);

  try {
    // Dynamic import with type casting
    const module = (await import(filePath)) as { default: Event };
    const event = module.default;

    // Type guard: check if event has required properties
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
      console.log(`🔄 One-time event loaded: ${event.name}`);
    } else {
      client.on(event.name, (...args) => event.execute(...args));
      console.log(`🔁 Event loaded: ${event.name}`);
    }
  } catch (error) {
    console.error(`❌ Error loading event from ${filePath}:`, error);
  }
}

// ============================================================================
// BOT LOGIN
// ============================================================================

console.log('🔑 Logging in...');
client
  .login(token)
  .then(() => {
    console.log('✅ Bot logged in successfully!');
  })
  .catch((err: Error) => {
    console.error(`❌ Failed to log in: ${err.message}`);
    console.error('Full error:', err);
    console.error('Error stack:', err.stack);
    process.exit(1);
  });

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Handle unhandled promise rejections
process.on('unhandledRejection', (error: Error) => {
  console.error('❌ Unhandled Promise Rejection:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});
