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
	getGuildConfigStatus,
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
 * Generic helper to find missing permissions for the bot in a guild channel or guild level.
 */
export function getMissingBotPermissions(
	guild: Guild,
	channel: GuildBasedChannel | null | undefined,
	requiredPermissions: bigint[],
): bigint[] {
	const me = guild.members.me;
	if (!me) return requiredPermissions;

	const perms =
		channel && 'permissionsFor' in channel
			? channel.permissionsFor(me)
			: me.permissions;

	if (!perms) return requiredPermissions;

	const effectiveRequired = [...requiredPermissions];
	if (
		channel &&
		!effectiveRequired.includes(PermissionsBitField.Flags.ViewChannel)
	) {
		effectiveRequired.unshift(PermissionsBitField.Flags.ViewChannel);
	}

	const missing = effectiveRequired.filter((perm) => !perms.has(perm));

	// Inspect category permission overwrites for voice flags ignored by Discord.js CategoryChannel.permissionsFor
	if (channel && 'permissionOverwrites' in channel) {
		for (const reqPerm of effectiveRequired) {
			if (missing.includes(reqPerm)) continue;

			const overwrites = channel.permissionOverwrites.cache;

			const isDeniedInOverwrites = Array.from(overwrites.values()).some(
				(ov) =>
					(ov.id === guild.id ||
						ov.id === me.id ||
						me.roles.cache.has(ov.id)) &&
					ov.deny.has(reqPerm),
			);

			if (isDeniedInOverwrites) {
				const hasExplicitAllow = Array.from(overwrites.values()).some(
					(ov) =>
						(ov.id === me.id || me.roles.cache.has(ov.id)) &&
						ov.allow.has(reqPerm),
				);

				if (!hasExplicitAllow) {
					missing.push(reqPerm);
				}
			}
		}
	}

	return missing;
}

/**
 * Utility to convert permission bitfield flags into human-readable labels.
 */
export function formatPermissionNames(permissions: bigint[]): string {
	if (permissions.length === 0) return '';
	const bitField = new PermissionsBitField(permissions);
	const names = bitField.toArray();
	return names
		.map((name) => name.replace(/([a-z])([A-Z])/g, '$1 $2'))
		.join(', ');
}

/**
 * Checks if bot has ManageChannels permission in target category or guild.
 */
export function canBotManageChannels(
	guild: Guild,
	category?: CategoryChannel | GuildBasedChannel | null,
): boolean {
	return (
		getMissingBotPermissions(guild, category, [
			PermissionsBitField.Flags.ManageChannels,
		]).length === 0
	);
}

/**
 * Checks if bot has Connect, MoveMembers, and ViewChannel permissions on a voice/stage channel.
 */
export function canBotMoveMembers(
	guild: Guild,
	voiceChannel?: VoiceChannel | StageChannel | GuildBasedChannel | null,
): boolean {
	return (
		getMissingBotPermissions(guild, voiceChannel, [
			PermissionsBitField.Flags.Connect,
			PermissionsBitField.Flags.MoveMembers,
			PermissionsBitField.Flags.ViewChannel,
		]).length === 0
	);
}

/**
 * Checks if bot has ViewChannel and SendMessages permissions in a text/voice channel.
 */
export function canBotSendMessage(
	guild: Guild,
	textChannel?: TextChannel | GuildTextBasedChannel | GuildBasedChannel | null,
): boolean {
	return (
		getMissingBotPermissions(guild, textChannel, [
			PermissionsBitField.Flags.ViewChannel,
			PermissionsBitField.Flags.SendMessages,
		]).length === 0
	);
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
	channels?: (GuildBasedChannel | null | undefined)[];
	requireUserMove?: boolean;
	requireManageChannels?: boolean;
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
	guildConfigMap: GuildRoleConfigMap = loadGuildConfig(),
): BreakoutPreflightResult {
	const {
		member,
		category,
		voiceChannel,
		textChannel,
		channels,
		requireUserMove,
		requireManageChannels,
	} = opts;
	const guild = member.guild;

	// 1. Role gate (Owner bypass or manager role)
	if (!canInvokeBreakout(member, guildConfigMap)) {
		const configStatus = getGuildConfigStatus(guild.id, guildConfigMap);
		if (configStatus === 'FILE_MISSING') {
			return {
				ok: false,
				reason:
					'⚠️ Server configuration file (`guildConfig.json`) was not found. Please set up `guildConfig.json` before using this command.',
			};
		}

		if (configStatus === 'GUILD_NOT_CONFIGURED') {
			return {
				ok: false,
				reason:
					'⚠️ Bot configuration (`managerRoleId`) for this server is not set in `guildConfig.json`.',
			};
		}

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
	if (category) {
		const missing = getMissingBotPermissions(guild, category, [
			PermissionsBitField.Flags.ManageChannels,
			PermissionsBitField.Flags.ViewChannel,
			PermissionsBitField.Flags.Connect,
		]);
		if (missing.length > 0) {
			return {
				ok: false,
				reason: `I don't have **${formatPermissionNames(missing)}** permission in the target category. Ask an admin to grant it.`,
			};
		}
	}

	if (
		requireManageChannels &&
		!category &&
		(!channels || channels.length === 0)
	) {
		const missing = getMissingBotPermissions(guild, null, [
			PermissionsBitField.Flags.ManageChannels,
			PermissionsBitField.Flags.ViewChannel,
			PermissionsBitField.Flags.Connect,
		]);
		if (missing.length > 0) {
			return {
				ok: false,
				reason: `I don't have **${formatPermissionNames(missing)}** permission in this server. Ask an admin to grant it.`,
			};
		}
	}

	if (channels && channels.length > 0) {
		for (const ch of channels) {
			if (!ch) continue;

			// Check parent category if channel has a parent
			const parentCategory =
				'parent' in ch && ch.parent
					? ch.parent
					: ch.parentId
						? guild.channels.cache.get(ch.parentId)
						: null;

			if (parentCategory) {
				const missingCategory = getMissingBotPermissions(
					guild,
					parentCategory,
					[
						PermissionsBitField.Flags.ManageChannels,
						PermissionsBitField.Flags.ViewChannel,
						PermissionsBitField.Flags.Connect,
					],
				);

				if (missingCategory.length > 0) {
					return {
						ok: false,
						reason: `I don't have **${formatPermissionNames(
							missingCategory,
						)}** permission(s) on parent category (${
							parentCategory.name
						}). Ask an admin to grant it.`,
					};
				}
			}

			const missing = getMissingBotPermissions(guild, ch, [
				PermissionsBitField.Flags.ManageChannels,
				PermissionsBitField.Flags.ViewChannel,
				PermissionsBitField.Flags.Connect,
			]);

			if (missing.length > 0) {
				return {
					ok: false,
					reason: `I don't have **${formatPermissionNames(
						missing,
					)}** permission(s) on breakout room channel (${
						ch.name
					}). Ask an admin to grant it.`,
				};
			}
		}
	}

	if (voiceChannel) {
		const missing = getMissingBotPermissions(guild, voiceChannel, [
			PermissionsBitField.Flags.Connect,
			PermissionsBitField.Flags.MoveMembers,
			PermissionsBitField.Flags.ViewChannel,
		]);
		if (missing.length > 0) {
			return {
				ok: false,
				reason: `I don't have **${formatPermissionNames(missing)}** permission(s) in that voice channel.`,
			};
		}
	}

	if (textChannel) {
		const missing = getMissingBotPermissions(guild, textChannel, [
			PermissionsBitField.Flags.ViewChannel,
			PermissionsBitField.Flags.SendMessages,
		]);
		if (missing.length > 0) {
			return {
				ok: false,
				reason: `I don't have **${formatPermissionNames(missing)}** permission(s) in that channel.`,
			};
		}
	}

	return { ok: true };
}
