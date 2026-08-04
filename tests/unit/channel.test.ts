import {
	type CategoryChannel,
	ChannelType,
	type Guild,
	type VoiceChannel,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createChannel } from '@/lib/discord/channel.js';

describe('Discord Channel Utilities (channel.ts)', () => {
	it('creates voice channel via parent.children when parent is a CategoryChannel', async () => {
		const createChildMock = vi.fn().mockResolvedValue({
			id: 'ch-1',
			name: 'breakout-1',
		} as VoiceChannel);

		const fakeCategory = {
			name: 'Breakout Category',
			children: {
				create: createChildMock,
			},
		} as unknown as CategoryChannel;

		const channel = await createChannel(fakeCategory, 'breakout-1');

		expect(createChildMock).toHaveBeenCalledWith({
			name: 'breakout-1',
			type: ChannelType.GuildVoice,
		});
		expect(channel.id).toBe('ch-1');
	});

	it('creates voice channel via parent.channels when parent is a Guild', async () => {
		const createChannelMock = vi.fn().mockResolvedValue({
			id: 'ch-2',
			name: 'breakout-2',
		} as VoiceChannel);

		const fakeGuild = {
			name: 'Test Guild',
			channels: {
				create: createChannelMock,
			},
		} as unknown as Guild;

		const channel = await createChannel(fakeGuild, 'breakout-2');

		expect(createChannelMock).toHaveBeenCalledWith({
			name: 'breakout-2',
			type: ChannelType.GuildVoice,
		});
		expect(channel.id).toBe('ch-2');
	});

	it('re-throws error if channel creation fails', async () => {
		const fakeGuild = {
			name: 'Test Guild',
			channels: {
				create: vi.fn().mockRejectedValue(new Error('Missing Permissions')),
			},
		} as unknown as Guild;

		await expect(createChannel(fakeGuild, 'breakout-err')).rejects.toThrow(
			'Missing Permissions',
		);
	});
});
