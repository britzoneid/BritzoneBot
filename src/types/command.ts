import type {
	ContextMenuCommandBuilder,
	SlashCommandBuilder,
	SlashCommandSubcommandsOnlyBuilder,
} from '@discordjs/builders';
import type {
	CommandInteraction,
	ContextMenuCommandInteraction,
} from 'discord.js';

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
 * Structure of a successful member move result
 */
export interface MoveResult {
	userId: string;
	userTag: string;
	roomId: string;
	roomName: string;
}

/**
 * Structure of a failed member move result
 */
export interface MoveFailure {
	userId?: string;
	userTag?: string;
	reason: string;
}

/**
 * Result from command operations
 * Used in breakout commands and other operation handlers
 */
export interface OperationResult {
	success: boolean;
	message: string;
	moveResults?: {
		success: (MoveResult | string)[];
		failed: (MoveFailure | string)[];
	};
}
