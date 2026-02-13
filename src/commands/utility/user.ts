import { SlashCommandBuilder, type CommandInteraction, type GuildMember } from 'discord.js';
import type { Command } from '../../types/index.js';
import safeReply, { replyOrEdit } from '../../lib/discord/response.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Provides information about the user.'),
  async execute(interaction: CommandInteraction): Promise<void> {
    await safeReply(interaction, async () => {
      const member = interaction.member as GuildMember | null;
      if (!member) {
        await replyOrEdit(interaction, 'Could not retrieve member information.');
        return;
      }

      const joinedAt = member.joinedAt || 'Unknown';
      const response = `This command was run by ${interaction.user.username}, who joined on ${joinedAt}.`;
      await replyOrEdit(interaction, response);
    });
  },
};

export default command;
