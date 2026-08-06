import type { Interaction, InteractionReplyOptions } from 'discord.js';
import { Events, MessageFlags } from 'discord.js';
import { replyOrEdit } from '@/lib/discord/response.js';
import { logger } from '@/lib/logger.js';
import type {
	BritzoneClient,
	Command,
	Event,
	SlashCommand,
} from '@/types/index.js';

/**
 * Type guard for slash commands
 */
function isSlashCommand(cmd: Command): cmd is SlashCommand {
	return (
		'execute' in cmd &&
		typeof cmd.execute === 'function' &&
		cmd.type !== 'context-menu'
	);
}

/**
 * InteractionCreate event - handles all interactions (commands, buttons, etc.)
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
			if (isSlashCommand(command)) {
				await command.execute(interaction);
			} else {
				commandLogger.error(
					{ commandName: interaction.commandName },
					'❌ Command object is missing an execute method',
				);
				await replyOrEdit(interaction, {
					content: '❌ Command execution failed (missing execute handler).',
					flags: MessageFlags.Ephemeral,
				});
			}
		} catch (error) {
			commandLogger.error(
				{ err: error },
				`❌ Error executing command ${interaction.commandName}`,
			);

			// Handle different interaction states (replied, deferred, or untouched)
			const errorReply: InteractionReplyOptions = {
				content: '❌ An error occurred while executing this command.',
				flags: MessageFlags.Ephemeral,
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
