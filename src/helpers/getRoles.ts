import type { GuildMember, Collection, Role } from 'discord.js';

/**
 * Get all roles for a user
 * @param member The guild member
 * @returns Collection of roles
 */
function getRoles(member: GuildMember): Collection<string, Role> {
  console.log(`🏷️ Getting roles for user: ${member.user.tag}`);
  const roles = member.roles.cache;
  console.log(`🔖 Found ${roles.size} roles for ${member.user.tag}`);
  return roles;
}

export default getRoles;
