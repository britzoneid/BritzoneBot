import type {
	Collection,
	GuildMember,
	Role,
	StageChannel,
	VoiceChannel,
} from 'discord.js';

/**
 * Move a user to a specified voice channel
 * @param member The guild member to move
 * @param channel The destination channel
 * @returns Promise that resolves when the user is moved
 */
export async function moveUser(
	member: GuildMember,
	channel: VoiceChannel | StageChannel,
): Promise<GuildMember> {
	try {
		console.log(
			`🚚 Attempting to move ${member.user.tag} to channel: ${channel.name}`,
		);

		// Check if member is currently in a voice channel
		if (!member.voice.channel) {
			console.log(
				`❌ Failed move: ${member.user.tag} is not in a voice channel`,
			);
			throw new Error(`${member.user.tag} is not in a voice channel.`);
		}

		const movedMember = await member.voice.setChannel(channel);
		console.log(`✅ Successfully moved ${member.user.tag} to ${channel.name}`);
		return movedMember;
	} catch (error) {
		console.error(
			`❌ Failed to move ${member.user.tag} to ${channel.name}:`,
			error,
		);
		throw error;
	}
}

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
