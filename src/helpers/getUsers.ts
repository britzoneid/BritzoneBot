import type { VoiceChannel, StageChannel, Collection, GuildMember } from 'discord.js';

/**
 * Get all users in a voice channel
 * @param voiceChannel The voice channel
 * @returns Collection of members in the voice channel
 */
function getUsers(voiceChannel: VoiceChannel | StageChannel): Collection<string, GuildMember> {
  console.log(`👥 Getting users from voice channel: ${voiceChannel.name}`);
  const users = voiceChannel.members;
  console.log(`📊 Found ${users.size} users in ${voiceChannel.name}`);
  return users;
}

export default getUsers;
