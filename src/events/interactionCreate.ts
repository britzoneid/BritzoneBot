import type { Interaction } from 'discord.js';
import { Events } from 'discord.js';
import { replyOrEdit } from '../lib/discord/response.js';
import { logger } from '../lib/logger.js';
import type { BritzoneClient, Event } from '../types/index.js';

/**
 * InteractionCreate event - handles all interactions (commands, buttons, etc.)
 *
 * This is a fully typed version showing:
 * - Proper event typing
 * - Type guards for interactions
 * - Error handling for command execution
 */
const event: Event<typeof Events.InteractionCreate> = {
	name: Events.InteractionCreate,
	async execute(interaction: Interaction) {
		// Type guard: check if this is a slash command
		if (!interaction.isChatInputCommand()) return;

		// Cast client to our extended BritzoneClient type
		const client = interaction.client as BritzoneClient;

		// Get the command from the collection
		const command = client.commands.get(interaction.commandName);

		if (!command) {
			logger.warn(
				{ commandName: interaction.commandName, user: interaction.user },
				`No command matching ${interaction.commandName} was found.`,
			);
			return;
		}

		// Log command execution with details
		const options = interaction.options.data.map((opt) => {
			const value = opt.value;
			// Handle subcommands and subcommand groups
			if (opt.type === 1 || opt.type === 2) {
				return `${opt.name}[${opt.options?.map((o) => `${o.name}=${o.value}`).join(', ')}]`;
			}
			return `${opt.name}=${value}`;
		});

		// Create a child logger with context for this interaction
		const commandLogger = logger.child({
			interactionId: interaction.id,
			guildId: interaction.guildId,
			user: interaction.user,
			command: interaction.commandName,
			options: options,
		});

		commandLogger.info(`🔵 Command executed: ${interaction.commandName}`);

		try {
			// At this point, interaction is ChatInputCommandInteraction (narrowed by isChatInputCommand())
			// The command must be a SlashCommand since we're handling a chat input command
			if ('execute' in command) {
				// Use a type assertion here because Collections don't have strong value typing
				// We've already verified the command has execute via the 'in' check
				await (command as any).execute(interaction);
			}
		} catch (error) {
			commandLogger.error(
				{ err: error },
				`❌ Error executing command ${interaction.commandName}`,
			);

			// Handle different interaction states (replied, deferred, or untouched)
			const errorReply = {
				content: '❌ An error occurred while executing this command.',
				ephemeral: true,
			};

			try {
				await replyOrEdit(interaction, errorReply);
			} catch (replyError) {
				commandLogger.error(
					{ err: replyError },
					'Failed to send error message',
				);
			}
		}
	},
};

export default event;
