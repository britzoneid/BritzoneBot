import {
	ChannelType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type GuildMember,
	PermissionFlagsBits,
	SlashCommandBuilder,
	type StageChannel,
	type VoiceBasedChannel,
	type VoiceChannel,
} from 'discord.js';
import isAdmin from '../../lib/discord/permissions.js';
import { replyOrEdit } from '../../lib/discord/response.js';
import createOperation from '../../modules/breakout/operations/CreateOperation.js';
import distributeOperation from '../../modules/breakout/operations/DistributeOperation.js';
import endOperation from '../../modules/breakout/operations/EndOperation.js';
import {
	broadcastToBreakoutRooms,
	sendMessageToChannel,
} from '../../modules/breakout/services/message.js';
import { monitorBreakoutTimer } from '../../modules/breakout/services/timer.js';
import sessionManager from '../../modules/breakout/state/SessionManager.js';
import stateManager from '../../modules/breakout/state/StateManager.js';
import { distributeUsers } from '../../modules/breakout/utils/distribution.js';
import type { Command } from '../../types/index.js';

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
						.setName('facilitators')
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
						.setName('main_room')
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
		console.log(`🚀 Breakout command initiated by ${interaction.user.tag}`);

		if (!interaction.guildId || !interaction.member) {
			await interaction.reply({
				content: 'This command can only be used in a server.',
				ephemeral: true,
			});
			return;
		}

		// Check if user has permission to use this command
		const member = interaction.member as GuildMember;
		if (
			!isAdmin(member) &&
			!member.permissions.has(PermissionFlagsBits.MoveMembers)
		) {
			console.log(
				`🔒 Permission denied to ${interaction.user.tag} for breakout command`,
			);
			await replyOrEdit(interaction, {
				content: 'You do not have permission to use this command.',
				ephemeral: true,
			});
			return;
		}

		const subcommand = interaction.options.getSubcommand();

		// Check for interrupted operations
		const inProgress = await stateManager.hasOperationInProgress(
			interaction.guildId,
		);
		if (inProgress) {
			const currentOp = await stateManager.getCurrentOperation(
				interaction.guildId,
			);

			if (currentOp && currentOp.type !== subcommand) {
				// If a different operation is in progress, warn the user
				console.log(
					`⚠️ Found interrupted ${currentOp.type} operation, but user requested ${subcommand}`,
				);
				await replyOrEdit(interaction, {
					content: `There is an interrupted '${currentOp.type}' operation in progress. Please finish it or clear it before starting a '${subcommand}' operation.`,
					ephemeral: true,
				});
				// We allow them to proceed if they use force? No, force is not available on top level.
				// They should run the same command to resume, or maybe we provide a way to clear.
				// For now, we block.
				return;
			} else if (currentOp && currentOp.type === subcommand) {
				console.log(`Note: Resuming ${subcommand} operation.`);
				// We let it proceed to the handler, which will check stateManager and resume.
			}
		}

		if (subcommand === 'create') {
			await handleCreateCommand(interaction);
		} else if (subcommand === 'distribute') {
			await handleDistributeCommand(interaction);
		} else if (subcommand === 'end') {
			await handleEndCommand(interaction);
		} else if (subcommand === 'timer') {
			await handleTimerCommand(interaction);
		} else if (subcommand === 'broadcast') {
			await handleBroadcastCommand(interaction);
		} else if (subcommand === 'send-message') {
			await handleSendMessageCommand(interaction);
		}
	},
};

/**
 * Handles the create subcommand for breakout rooms
 */
async function handleCreateCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	const numRooms = interaction.options.getInteger('number', true);
	const force = interaction.options.getBoolean('force') || false;
	console.log(
		`🔢 Number of breakout rooms to create: ${numRooms} (force: ${force})`,
	);

	try {
		const result = await createOperation.execute(interaction, numRooms, force);

		if (result.success) {
			await replyOrEdit(interaction, result.message);
		} else {
			console.error(`❌ Error creating breakout rooms:`, result);
			await replyOrEdit(interaction, result.message);
		}
	} catch (error) {
		console.error(`❌ Error in handleCreateCommand:`, error);
		await replyOrEdit(
			interaction,
			'An unexpected error occurred while creating breakout rooms. Please try again later.',
		);
	}
}

/**
 * Handles the distribute subcommand for breakout rooms
 */
async function handleDistributeCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId) return;

	const mainRoom = interaction.options.getChannel('mainroom', true) as
		| VoiceChannel
		| StageChannel;
	const facilitatorsInput = interaction.options.getString('facilitators');
	const force = interaction.options.getBoolean('force') || false;
	console.log(`🎯 Main room selected: ${mainRoom.name} (force: ${force})`);

	// Process facilitators if provided
	const facilitators = new Set<string>();
	if (facilitatorsInput) {
		const mentionPattern = /<@!?(\d+)>/g;
		const matches = facilitatorsInput.matchAll(mentionPattern);
		for (const match of matches) {
			facilitators.add(match[1]);
		}
		console.log(`👥 Facilitators identified: ${facilitators.size}`);
	}

	const breakoutRooms = sessionManager.getRooms(interaction.guildId);

	if (breakoutRooms.length === 0) {
		console.log(`❌ Error: No breakout rooms found`);
		await replyOrEdit(
			interaction,
			'No breakout rooms found! Please create breakout rooms first with `/breakout create`.',
		);
		return;
	}

	const usersInMainRoom = mainRoom.members;

	if (usersInMainRoom.size === 0) {
		console.log(`⚠️ No users found in ${mainRoom.name}`);
		await replyOrEdit(interaction, `There are no users in ${mainRoom.name}.`);
		return;
	}

	// Filter out facilitators before distribution
	const usersToDistribute = Array.from(usersInMainRoom.values()).filter(
		(member) => !facilitators.has(member.user.id),
	);

	console.log(
		`🧩 Distributing ${usersToDistribute.length} users among ${breakoutRooms.length} breakout rooms (excluding ${facilitators.size} facilitators)`,
	);

	// Calculate distribution
	// Note: if resuming, DistributeOperation will ignore this distribution plan and use stored one.
	// But we still need to pass something matching the type.
	const distribution = distributeUsers(usersToDistribute, breakoutRooms);

	const result = await distributeOperation.execute(
		interaction,
		mainRoom,
		distribution,
		force,
	);

	if (!result.success) {
		await replyOrEdit(interaction, result.message);
		return;
	}

	// Create embed for nice formatting
	console.log(`📝 Creating response embed`);
	const embed = new EmbedBuilder()
		.setTitle('Breakout Room Assignment')
		.setColor('#00FF00')
		.setDescription(
			`Split users from ${mainRoom.name} into ${breakoutRooms.length} breakout rooms.`,
		)
		.setTimestamp();

	// Add facilitators field if any exist
	if (facilitators.size > 0) {
		const facilitatorUsers = Array.from(usersInMainRoom.values())
			.filter((member) => facilitators.has(member.user.id))
			.map((member) => member.user.tag)
			.join('\n');

		embed.addFields({
			name: '👥 Facilitators',
			value: facilitatorUsers || 'None',
			inline: false,
		});
		console.log(`📊 Added ${facilitators.size} facilitators to embed`);
	}

	// Add fields for each breakout room
	breakoutRooms.forEach((room) => {
		// Note: distribution object here might not reflect actual moves if operation failed partially or we resumed.
		// Ideally we should use result.moveResults to build the embed, or use the distribution plan.
		// For now we use the planned distribution.
		const usersInRoom =
			distribution[room.id]?.map((u) => u.user.tag).join('\n') ||
			'No users assigned';
		embed.addFields({
			name: room.name,
			value: usersInRoom,
			inline: true,
		});
		console.log(
			`📊 Added ${room.name} stats to embed: ${distribution[room.id]?.length || 0} users`,
		);
	});

	// Add error field if any
	if (
		result.moveResults &&
		result.moveResults.failed &&
		result.moveResults.failed.length > 0
	) {
		embed.addFields({
			name: 'Failed Moves',
			value: result.moveResults.failed.join('\n'),
			inline: false,
		});
		console.log(
			`⚠️ Added ${result.moveResults.failed.length} failed moves to embed`,
		);
	}

	console.log(`📤 Sending breakout room results to Discord`);
	await replyOrEdit(interaction, { embeds: [embed] });
}

/**
 * Handles the end subcommand for breakout rooms
 */
async function handleEndCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId) return;

	// Get the main voice channel from user input or from the manager
	let mainChannel = interaction.options.getChannel(
		'main_room',
	) as VoiceBasedChannel | null;
	const force = interaction.options.getBoolean('force') || false;

	// If no main channel is specified, try to get it from the manager
	if (!mainChannel) {
		const storedMainChannel = sessionManager.getMainRoom(interaction.guildId);
		if (storedMainChannel) {
			mainChannel = storedMainChannel;
		} else {
			await replyOrEdit(
				interaction,
				'Please specify a main voice channel where users should be moved back.',
			);
			return;
		}
	}

	console.log(
		`🎯 Target main voice channel: ${mainChannel.name} (${mainChannel.id}) (force: ${force})`,
	);

	const result = await endOperation.execute(interaction, mainChannel, force);

	if (result.success) {
		await replyOrEdit(interaction, result.message);
	} else {
		await replyOrEdit(
			interaction,
			result.message || 'Failed to end breakout session.',
		);
	}
}

/**
 * Handles the timer subcommand for breakout rooms
 */
async function handleTimerCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId) return;

	const minutes = interaction.options.getInteger('minutes', true);
	console.log(`⏱️ Setting breakout timer for ${minutes} minutes`);

	const breakoutRooms = sessionManager.getRooms(interaction.guildId);

	if (breakoutRooms.length === 0) {
		console.log(`❌ Error: No breakout rooms found`);
		await replyOrEdit(
			interaction,
			'No breakout rooms found! Please create breakout rooms first with `/breakout create`.',
		);
		return;
	}

	// Calculate reminder time
	const fiveMinWarningTime = minutes - 5;
	// Set up the timer data (converting minutes to milliseconds)
	const timerData = {
		totalMinutes: minutes,
		startTime: Date.now(),
		guildId: interaction.guildId,
		breakoutRooms: breakoutRooms.map((room) => room.id),
		fiveMinSent: fiveMinWarningTime <= 0, // Skip if total time is less than 5 minutes
	};

	// Store timer data in state manager
	await stateManager.setTimerData(interaction.guildId, timerData);
	// Start the timer monitoring process
	monitorBreakoutTimer(timerData, interaction);

	await replyOrEdit(
		interaction,
		`⏱️ Breakout timer set for ${minutes} minutes. Reminder will be sent at 5 minute mark.`,
	);
}

/**
 * Handles the broadcast subcommand
 */
async function handleBroadcastCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId) return;

	const message = interaction.options.getString('message', true);
	console.log(`📢 Broadcasting message: "${message}"`);

	const result = await broadcastToBreakoutRooms(interaction.guildId, message);

	if (result.success) {
		const embed = new EmbedBuilder()
			.setTitle('Broadcast Results')
			.setColor('#00FF00')
			.setDescription('Message broadcast complete')
			.addFields({
				name: 'Successfully Sent To',
				value: result.sent.join('\n') || 'None',
				inline: true,
			});

		if (result.failed.length > 0) {
			embed.addFields({
				name: 'Failed To Send To',
				value: result.failed.join('\n'),
				inline: true,
			});
		}

		await replyOrEdit(interaction, { embeds: [embed] });
	} else {
		await replyOrEdit(interaction, result.message);
	}
}

/**
 * Handles the send-message subcommand
 */
async function handleSendMessageCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	const channel = interaction.options.getChannel(
		'channel',
		true,
	) as VoiceChannel;
	const message = interaction.options.getString('message', true);

	console.log(`📨 Sending message to ${channel.name}: "${message}"`);

	const result = await sendMessageToChannel(channel, message);

	await replyOrEdit(interaction, {
		content: result.message,
		ephemeral: !result.success,
	});
}

export default command;
