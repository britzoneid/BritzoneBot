import type { GuildMember } from 'discord.js';

export function isBotManager(member: GuildMember): boolean {
	const { BOT_MANAGER_ROLE_ID } = process.env;
	const roles = member.roles.cache;
	return roles.some((role) => role.id === BOT_MANAGER_ROLE_ID);
}
