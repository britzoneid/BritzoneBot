import { type CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { handleInteraction } from '@/lib/discord/response.js';
import { buildVersionEmbed } from '@/lib/version.js';
import type { Command } from '@/types/index.js';

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('version')
		.setDescription(
			'Displays bot version, build metadata, and runtime diagnostics',
		),

	async execute(interaction: CommandInteraction): Promise<void> {
		await handleInteraction(
			interaction,
			async (ctx) => {
				const embed = buildVersionEmbed();
				await ctx.reply({ embeds: [embed] });
			},
			{ ephemeral: true },
		);
	},
};

export default command;
