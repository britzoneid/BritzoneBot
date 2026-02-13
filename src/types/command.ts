import type { SlashCommandBuilder, ContextMenuCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from '@discordjs/builders';
import type { CommandInteraction, ContextMenuCommandInteraction } from 'discord.js';

/**
 * Represents a slash command in your bot
 */
export interface SlashCommand {
  type?: 'slash';
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: CommandInteraction): Promise<void>;
  cooldown?: number;
}

/**
 * Represents a context menu command (right-click menu)
 */
export interface ContextMenuCommand {
  type: 'context-menu';
  data: ContextMenuCommandBuilder;
  execute(interaction: ContextMenuCommandInteraction): Promise<void>;
  cooldown?: number;
}

/**
 * Union type for any command
 */
export type Command = SlashCommand | ContextMenuCommand;

/**
 * Result from command operations
 * Used in your breakout command and other helpers
 */
export interface OperationResult {
  success: boolean;
  message: string;
  moveResults?: {
    failed: string[];
  };
  [key: string]: any;
}
