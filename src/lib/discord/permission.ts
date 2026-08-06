import {
	type CategoryChannel,
	type Guild,
	type GuildBasedChannel,
	type GuildMember,
	type GuildTextBasedChannel,
	PermissionsBitField,
	type StageChannel,
	type TextChannel,
	type VoiceChannel,
} from 'discord.js';
import {
	type GuildConfigMap as GuildRoleConfigMap,
	loadGuildConfig,
	reloadGuildConfig as reloadPermissionConfig,
} from '@/lib/guildConfig.js';

export { reloadPermissionConfig };

/**
 * Returns true if the member holds the per-guild manager role.
 * Also allows the guild owner as an implicit bypass.
 */
export function isBotManager(
	member: GuildMember,
	guildConfig: GuildRoleConfigMap = loadGuildConfig(),
): boolean {
	// Guild owner always passes
	if (member.id === member.guild.ownerId) {
		return true;
	}

	const config = guildConfig[member.guild.id];
	if (!config?.managerRoleId) {
		return false;
	}

	return member.roles.cache.has(config.managerRoleId);
}

/**
 * Alias for isBotManager to check breakout invocation permission.
 */
export function canInvokeBreakout(
	member: GuildMember,
	guildConfig?: GuildRoleConfigMap,
): boolean {
	return isBotManager(member, guildConfig);
}

/**
 * Checks if bot has ManageChannels permission in target category or guild.
 */
export function canBotManageChannels(
	guild: Guild,
	category?: CategoryChannel | GuildBasedChannel | null,
): boolean {
	const me = guild.members.me;
	if (!me) return false;

	if (category && 'permissionsFor' in category) {
		const perms = category.permissionsFor(me);
		return perms?.has(PermissionsBitField.Flags.ManageChannels) ?? false;
	}

	return me.permissions.has(PermissionsBitField.Flags.ManageChannels);
}

/**
 * Checks if bot has Connect, MoveMembers, and ViewChannel permissions on a voice/stage channel.
 */
export function canBotMoveMembers(
	guild: Guild,
	voiceChannel?: VoiceChannel | StageChannel | GuildBasedChannel | null,
): boolean {
	const me = guild.members.me;
	if (!me) return false;

	const requiredPerms = [
		PermissionsBitField.Flags.Connect,
		PermissionsBitField.Flags.MoveMembers,
		PermissionsBitField.Flags.ViewChannel,
	];

	if (voiceChannel && 'permissionsFor' in voiceChannel) {
		const perms = voiceChannel.permissionsFor(me);
		return perms?.has(requiredPerms) ?? false;
	}

	return me.permissions.has(requiredPerms);
}

/**
 * Checks if bot has ViewChannel and SendMessages permissions in a text/voice channel.
 */
export function canBotSendMessage(
	guild: Guild,
	textChannel?: TextChannel | GuildTextBasedChannel | GuildBasedChannel | null,
): boolean {
	const me = guild.members.me;
	if (!me) return false;

	const requiredPerms = [
		PermissionsBitField.Flags.ViewChannel,
		PermissionsBitField.Flags.SendMessages,
	];

	if (textChannel && 'permissionsFor' in textChannel) {
		const perms = textChannel.permissionsFor(me);
		return perms?.has(requiredPerms) ?? false;
	}

	return me.permissions.has(requiredPerms);
}

/**
 * Checks if member has MoveMembers permission directly.
 */
export function canMemberMoveMembers(member: GuildMember): boolean {
	return member.permissions.has(PermissionsBitField.Flags.MoveMembers);
}

export interface BreakoutPreflightOptions {
	member: GuildMember;
	category?: CategoryChannel | GuildBasedChannel | null;
	voiceChannel?: VoiceChannel | StageChannel | GuildBasedChannel | null;
	textChannel?: TextChannel | GuildTextBasedChannel | GuildBasedChannel | null;
	requireUserMove?: boolean;
}

export interface BreakoutPreflightResult {
	ok: boolean;
	reason?: string;
}

/**
 * Composite preflight permission check for breakout room operations.
 */
export function preflightBreakout(
	opts: BreakoutPreflightOptions,
): BreakoutPreflightResult {
	const { member, category, voiceChannel, textChannel, requireUserMove } = opts;
	const guild = member.guild;

	// 1. Role gate
	if (!canInvokeBreakout(member)) {
		return {
			ok: false,
			reason: 'You do not have the required manager role for this server.',
		};
	}

	// 2. User move members permission check (optional)
	if (requireUserMove && !canMemberMoveMembers(member)) {
		return {
			ok: false,
			reason: 'You need the **Move Members** permission to use this command.',
		};
	}

	// 3. Bot capability checks
	if (category && !canBotManageChannels(guild, category)) {
		return {
			ok: false,
			reason:
				"I don't have **Manage Channels** permission in the target category. Ask an admin to grant it.",
		};
	}

	if (voiceChannel && !canBotMoveMembers(guild, voiceChannel)) {
		return {
			ok: false,
			reason:
				"I don't have **Connect**, **View Channel**, and **Move Members** permissions in that voice channel.",
		};
	}

	if (textChannel && !canBotSendMessage(guild, textChannel)) {
		return {
			ok: false,
			reason:
				"I don't have **View Channel** and **Send Messages** permissions in that channel.",
		};
	}

	return { ok: true };
}
