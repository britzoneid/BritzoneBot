import type { GuildMember } from 'discord.js';

export function isBotManager(member: GuildMember): boolean {
	const BOT_MANAGER_ID = '1534717213456597122';
	const roles = member.roles.cache;
	return roles.some((role) => role.id === BOT_MANAGER_ID);
}
