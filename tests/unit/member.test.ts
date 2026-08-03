import type { GuildMember, VoiceChannel } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { moveUser } from '@/lib/discord/member.js';

describe('Discord Member Utilities (member.ts)', () => {
	it('throws error if target member is not in a voice channel', async () => {
		const fakeMember = {
			user: { tag: 'TestUser#0001' },
			voice: { channel: null },
		} as unknown as GuildMember;

		const fakeChannel = { name: 'Target Room' } as unknown as VoiceChannel;

		await expect(moveUser(fakeMember, fakeChannel)).rejects.toThrow(
			'TestUser#0001 is not in a voice channel.',
		);
	});

	it('calls setChannel on member.voice when member is in voice channel', async () => {
		const setChannelMock = vi.fn().mockResolvedValue({ id: 'moved-member' });

		const fakeMember = {
			user: { tag: 'TestUser#0001' },
			voice: {
				channel: { id: 'old-room' },
				setChannel: setChannelMock,
			},
		} as unknown as GuildMember;

		const fakeChannel = { name: 'Target Room' } as unknown as VoiceChannel;

		const result = await moveUser(fakeMember, fakeChannel);

		expect(setChannelMock).toHaveBeenCalledWith(fakeChannel);
		expect(result).toBeDefined();
	});

	it('re-throws error if setChannel API operation fails', async () => {
		const apiError = new Error('Discord API Error 50035');
		const fakeMember = {
			user: { tag: 'TestUser#0001' },
			voice: {
				channel: { id: 'old-room' },
				setChannel: vi.fn().mockRejectedValue(apiError),
			},
		} as unknown as GuildMember;

		const fakeChannel = { name: 'Target Room' } as unknown as VoiceChannel;

		await expect(moveUser(fakeMember, fakeChannel)).rejects.toThrow(
			'Discord API Error 50035',
		);
	});
});
