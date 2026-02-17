import {
	type CategoryChannel,
	ChannelType,
	type Collection,
	type Guild,
	type GuildMember,
	type StageChannel,
	type VoiceChannel,
} from 'discord.js';

/**
 * Creates a new voice channel
 * @param parent Guild or category to create channel in
 * @param name Name of the channel
 * @returns The created channel
 */
export async function createChannel(
	parent: Guild | CategoryChannel,
	name: string,
): Promise<VoiceChannel> {
	try {
		console.log(`📂 Creating voice channel: ${name}`);

		// If parent is a category, use its children.create method
		if ('children' in parent) {
			const channel = await parent.children.create({
				name,
				type: ChannelType.GuildVoice,
			});
			console.log(
				`✅ Created channel in category ${parent.name}: ${channel.name}`,
			);
			return channel as VoiceChannel;
		}

		// Otherwise, create in guild
		const channel = await parent.channels.create({
			name,
			type: ChannelType.GuildVoice,
		});
		console.log(`✅ Created channel in guild: ${channel.name}`);
		return channel as VoiceChannel;
	} catch (error) {
		console.error(`❌ Failed to create channel ${name}:`, error);
		throw error;
	}
}

/**
 * Safely deletes a voice channel
 * @param channel The channel to delete
 * @param reason Reason for deletion
 */
export async function deleteChannel(
	channel: VoiceChannel,
	reason: string = 'Channel cleanup',
): Promise<void> {
	try {
		console.log(`🗑️ Attempting to delete channel: ${channel.name}`);
		await channel.delete(reason);
		console.log(`✅ Successfully deleted channel: ${channel.name}`);
	} catch (error) {
		console.error(`❌ Failed to delete channel ${channel.name}:`, error);
		throw error;
	}
}

/**
 * Get all users in a voice channel
 * @param voiceChannel The voice channel
 * @returns Collection of members in the voice channel
 */
export function getUsers(
	voiceChannel: VoiceChannel | StageChannel,
): Collection<string, GuildMember> {
	console.log(`👥 Getting users from voice channel: ${voiceChannel.name}`);
	const users = voiceChannel.members;
	console.log(`📊 Found ${users.size} users in ${voiceChannel.name}`);
	return users;
}
