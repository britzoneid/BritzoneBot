import {
	ChannelType,
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from 'discord.js';
import { replyOrEdit } from '../../lib/discord/response.js';
import { logger } from '../../lib/logger.js';
import {
	handleBroadcastCommand,
	handleCreateCommand,
	handleDistributeCommand,
	handleEndCommand,
	handleSendMessageCommand,
	handleTimerCommand,
} from '../../modules/breakout/handlers/index.js';
import {
	type BreakoutSubcommand,
	getCurrentOperation,
	hasOperationInProgress,
} from '../../modules/breakout/state/state.js';
import type { Command } from '../../types/index.js';

const subcommandHandlers: Record<
	BreakoutSubcommand,
	(interaction: ChatInputCommandInteraction) => Promise<void>
> = {
	create: handleCreateCommand,
	distribute: handleDistributeCommand,
	end: handleEndCommand,
	timer: handleTimerCommand,
	broadcast: handleBroadcastCommand,
	'send-message': handleSendMessageCommand,
};

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('breakout')
		.setDescription('Manage breakout rooms for your voice channels')
		.setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
		// Create subcommand
		.addSubcommand((subcommand) =>
			subcommand
				.setName('create')
				.setDescription('Creates multiple breakout voice channels')
				.addIntegerOption((option) =>
					option
						.setName('number')
						.setDescription('Number of breakout rooms to create')
						.setMinValue(1)
						.setRequired(true),
				)
				.addBooleanOption((option) =>
					option
						.setName('force')
						.setDescription('Force creation even if rooms already exist')
						.setRequired(false),
				),
		)
		// Distribute subcommand
		.addSubcommand((subcommand) =>
			subcommand
				.setName('distribute')
				.setDescription('Split members from a main room into breakout rooms')
				.addChannelOption((option) =>
					option
						.setName('mainroom')
						.setDescription(
							'The main voice channel where members are currently located',
						)
						.setRequired(true)
						.addChannelTypes(
							ChannelType.GuildVoice,
							ChannelType.GuildStageVoice,
						),
				)
				.addStringOption((option) =>
					option
						.setName('exclude')
						.setDescription(
							'Users to keep in the main room (mention them with @)',
						)
						.setRequired(false),
				)
				.addBooleanOption((option) =>
					option
						.setName('force')
						.setDescription(
							'Force redistribution even if users are already distributed',
						)
						.setRequired(false),
				),
		)
		// End subcommand
		.addSubcommand((subcommand) =>
			subcommand
				.setName('end')
				.setDescription(
					'Moves users back to the main voice channel and deletes breakout rooms',
				)
				.addChannelOption((option) =>
					option
						.setName('mainroom')
						.setDescription(
							'The main voice channel where users should be moved back',
						)
						.addChannelTypes(ChannelType.GuildVoice)
						.setRequired(false),
				)
				.addBooleanOption((option) =>
					option
						.setName('force')
						.setDescription(
							'Force deletion even if no users are in breakout rooms',
						)
						.setRequired(false),
				),
		)
		// Timer subcommand
		.addSubcommand((subcommand) =>
			subcommand
				.setName('timer')
				.setDescription('Sets a timer for the breakout session')
				.addIntegerOption((option) =>
					option
						.setName('minutes')
						.setDescription('Duration of the breakout session in minutes')
						.setMinValue(1)
						.setRequired(true),
				),
		)
		// Broadcast subcommand
		.addSubcommand((subcommand) =>
			subcommand
				.setName('broadcast')
				.setDescription('Broadcasts a message to all breakout rooms')
				.addStringOption((option) =>
					option
						.setName('message')
						.setDescription('The message to broadcast')
						.setRequired(true),
				),
		)
		// Send-message subcommand
		.addSubcommand((subcommand) =>
			subcommand
				.setName('send-message')
				.setDescription('Sends a message to a specific voice channel')
				.addChannelOption((option) =>
					option
						.setName('channel')
						.setDescription('The voice channel to send the message to')
						.addChannelTypes(ChannelType.GuildVoice)
						.setRequired(true),
				)
				.addStringOption((option) =>
					option
						.setName('message')
						.setDescription('The message to send')
						.setRequired(true),
				),
		),

	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		const log = logger.child({
			command: 'breakout',
			interactionId: interaction.id,
			guildId: interaction.guildId,
			user: interaction.user,
		});

		log.info('🚀 Breakout command initiated');

		if (!interaction.guildId || !interaction.member) {
			await replyOrEdit(interaction, {
				content: 'This command can only be used in a server.',
				ephemeral: true,
			});
			return;
		}

		const subcommand = interaction.options.getSubcommand();

		// Check for interrupted operations
		const inProgress = await hasOperationInProgress(interaction.guildId);
		if (inProgress) {
			const currentOp = await getCurrentOperation(interaction.guildId);

			if (currentOp && currentOp.type !== subcommand) {
				log.warn(
					{ currentType: currentOp.type, requestedType: subcommand },
					'⚠️ Found interrupted operation, but user requested different type',
				);
				await replyOrEdit(interaction, {
					content: `There is an interrupted '${currentOp.type}' operation in progress. Please finish it or clear it before starting a '${subcommand}' operation.`,
					ephemeral: true,
				});
				return;
			}
			if (currentOp && currentOp.type === subcommand) {
				log.info(`Note: Resuming ${subcommand} operation.`);
			}
		}

		const handler = subcommandHandlers[subcommand as BreakoutSubcommand];
		if (!handler) {
			log.error({ subcommand }, '❌ No handler registered for subcommand');
			await replyOrEdit(interaction, {
				content: 'This subcommand is not supported.',
				ephemeral: true,
			});
			return;
		}

		await handler(interaction);
	},
};

export default command;
