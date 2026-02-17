import { type CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { handleInteraction, replyOrEdit } from '../../lib/discord/response.js';
import type { Command } from '../../types/index.js';

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('server')
		.setDescription('Provides information about the server.'),
	async execute(interaction: CommandInteraction): Promise<void> {
		await handleInteraction(interaction, async () => {
			if (!interaction.guild) {
				await replyOrEdit(
					interaction,
					'This command can only be used in a server.',
				);
				return;
			}

			const response = `This server is ${interaction.guild.name} and has ${interaction.guild.memberCount} members.`;
			await replyOrEdit(interaction, response);
		});
	},
};

export default command;
