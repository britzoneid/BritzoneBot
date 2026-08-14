import {
	type CommandInteraction,
	type GuildMember,
	SlashCommandBuilder,
} from 'discord.js';
import { handleInteraction } from '@/lib/discord/response.js';
import type { Command } from '@/types/index.js';

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('user')
		.setDescription('Provides information about the user.'),
	async execute(interaction: CommandInteraction): Promise<void> {
		await handleInteraction(interaction, async (ctx) => {
			const member = ctx.interaction.member as GuildMember | null;
			if (!member) {
				await ctx.reply('Could not retrieve member information.');
				return;
			}

			const joinedAt = member.joinedAt || 'Unknown';
			const response = `This command was run by ${ctx.interaction.user.username}, who joined on ${joinedAt}.`;
			await ctx.reply(response);
		});
	},
};

export default command;
