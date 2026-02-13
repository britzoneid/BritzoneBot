import type { Collection, Client } from 'discord.js';
import type { Command } from './command.js';

/**
 * Environment variables with proper typing
 * Extend NodeJS.ProcessEnv to add custom variables
 */
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      TOKEN: string;
      NODE_ENV?: 'development' | 'production';
      LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
    }
  }
}

/**
 * Extended Client with custom properties
 * This is the type you'll use throughout your bot (cast as BritzoneClient)
 */
export interface BritzoneClient extends Client {
  commands: Collection<string, Command>;
}
