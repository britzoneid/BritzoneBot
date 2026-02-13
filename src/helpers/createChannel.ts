import { ChannelType, type Guild, type CategoryChannel, type VoiceChannel } from 'discord.js';

/**
 * Creates a new voice channel
 * @param parent Guild or category to create channel in
 * @param name Name of the channel
 * @returns The created channel
 */
async function createChannel(
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
      console.log(`✅ Created channel in category ${parent.name}: ${channel.name}`);
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

export default createChannel;
