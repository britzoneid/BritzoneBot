import { Events } from 'discord.js';
import type { Interaction } from 'discord.js';
import type { Event, BritzoneClient } from '../types/index.js';

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
      console.error(`No command matching ${interaction.commandName} was found.`);
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

    console.log(
      `🔵 Command executed: ${interaction.commandName} ${options.join(' ')} by ${interaction.user.tag}`,
    );

    try {
      // At this point, interaction is ChatInputCommandInteraction (narrowed by isChatInputCommand())
      // The command must be a SlashCommand since we're handling a chat input command
      if ('execute' in command) {
        // Use a type assertion here because Collections don't have strong value typing
        // We've already verified the command has execute via the 'in' check
        await (command as any).execute(interaction);
      }
    } catch (error) {

      console.error(`❌ Error executing command ${interaction.commandName}:`, error);

      // Handle different interaction states (replied, deferred, or untouched)
      const errorReply = {
        content: '❌ An error occurred while executing this command.',
        ephemeral: true,
      };

      try {
        if (interaction.replied) {
          // Already replied, send a followup
          await interaction.followUp(errorReply);
        } else if (interaction.deferred) {
          // Already deferred, edit the reply
          await interaction.editReply({
            content: errorReply.content,
          });
        } else {
          // No interaction yet, send a new reply
          await interaction.reply(errorReply);
        }
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
  },
};

export default event;
