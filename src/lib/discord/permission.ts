import type { GuildMember } from 'discord.js';

export function isBotManager(member: GuildMember): boolean {
	const { ROLE_ID } = process.env;
	const roles = member.roles.cache;
	return roles.some((role) => role.id === ROLE_ID);
}
