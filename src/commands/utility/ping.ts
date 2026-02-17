/**
 * Example: SimpleCommand
 *
 * This is a template for migrating your commands to TypeScript.
 * Use this as a reference when converting your existing commands.
 */

import type { CommandInteraction } from 'discord.js';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/index.js';

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Replies with Pong!')
		.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

	async execute(interaction: CommandInteraction): Promise<void> {
		// TypeScript knows interaction type and all available methods
		await interaction.reply({
			content: `🏓 Pong! Bot latency is ${Math.round(interaction.client.ws.ping)}ms.`,
			ephemeral: true,
		});
	},
};

export default command;
