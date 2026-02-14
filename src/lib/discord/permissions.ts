import type { GuildMember } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';

/**
 * Checks if a user has admin permissions
 * 
 * @param member The guild member to check
 * @returns True if the user has the Administrator permission
 */
export default function isAdmin(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}
