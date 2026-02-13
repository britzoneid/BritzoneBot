import { SlashCommandBuilder, type CommandInteraction } from 'discord.js';
import type { Command } from '../../types/index.js';
import safeReply, { replyOrEdit } from '../../lib/discord/response.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Provides information about the server.'),
  async execute(interaction: CommandInteraction): Promise<void> {
    await safeReply(interaction, async () => {
      if (!interaction.guild) {
        await replyOrEdit(interaction, 'This command can only be used in a server.');
        return;
      }

      const response = `This server is ${interaction.guild.name} and has ${interaction.guild.memberCount} members.`;
      await replyOrEdit(interaction, response);
    });
  },
};

export default command;
