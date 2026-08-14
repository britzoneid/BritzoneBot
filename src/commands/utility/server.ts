import { type CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { handleInteraction } from '@/lib/discord/response.js';
import type { Command } from '@/types/index.js';

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('server')
		.setDescription('Provides information about the server.'),
	async execute(interaction: CommandInteraction): Promise<void> {
		await handleInteraction(interaction, async (ctx) => {
			if (!ctx.interaction.guild) {
				await ctx.reply('This command can only be used in a server.');
				return;
			}

			const response = `This server is ${ctx.interaction.guild.name} and has ${ctx.interaction.guild.memberCount} members.`;
			await ctx.reply(response);
		});
	},
};

export default command;
