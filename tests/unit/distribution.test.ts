import type { GuildMember, VoiceChannel } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { distributeUsers } from '@/modules/breakout/utils/distribution.js';

// Minimal stubs for testing pure logic without live Discord client
const fakeMember = (id: string, tag?: string): GuildMember =>
	({
		id,
		user: { id, tag: tag ?? `user#${id}` },
		voice: { channel: null },
	}) as unknown as GuildMember;

const fakeRoom = (id: string, name: string): VoiceChannel =>
	({
		id,
		name,
		guild: { id: 'guild-1' },
	}) as unknown as VoiceChannel;

describe('distributeUsers', () => {
	it('distributes regular users evenly across breakout rooms', () => {
		const users = Array.from({ length: 6 }, (_, i) => fakeMember(`u${i}`));
		const rooms = [fakeRoom('r1', 'room-1'), fakeRoom('r2', 'room-2')];

		const result = distributeUsers(users, rooms);

		expect(result.r1).toHaveLength(3);
		expect(result.r2).toHaveLength(3);

		// Assert that every input member is included exactly once
		const allDistributedIds = Object.values(result)
			.flat()
			.map((u) => u.id)
			.sort();
		expect(allDistributedIds).toEqual(['u0', 'u1', 'u2', 'u3', 'u4', 'u5']);
	});

	it('places facilitators first round-robin in each room', () => {
		const users = [fakeMember('u1'), fakeMember('u2')];
		const facilitators = [fakeMember('f1'), fakeMember('f2')];
		const rooms = [fakeRoom('r1', 'room-1'), fakeRoom('r2', 'room-2')];

		const result = distributeUsers(users, rooms, facilitators);

		expect(result.r1).toHaveLength(2);
		expect(result.r2).toHaveLength(2);

		// Each room should contain 1 facilitator at the first position
		const firstInR1 = result.r1?.[0]?.id;
		const firstInR2 = result.r2?.[0]?.id;
		expect(['f1', 'f2']).toContain(firstInR1);
		expect(['f1', 'f2']).toContain(firstInR2);
		expect(firstInR1).not.toBe(firstInR2);
	});

	it('accepts Map inputs for users and facilitators', () => {
		const userMap = new Map<string, GuildMember>([
			['u1', fakeMember('u1')],
			['u2', fakeMember('u2')],
		]);
		const facilMap = new Map<string, GuildMember>([['f1', fakeMember('f1')]]);
		const rooms = [fakeRoom('r1', 'room-1')];

		const result = distributeUsers(userMap, rooms, facilMap);

		expect(result.r1).toHaveLength(3);
		expect(result.r1?.[0]?.id).toBe('f1');
	});

	it('does not mutate input user arrays or maps', () => {
		const users = [fakeMember('u1'), fakeMember('u2'), fakeMember('u3')];
		const originalUsers = [...users];
		const rooms = [fakeRoom('r1', 'room-1')];

		const userMap = new Map([
			['u1', fakeMember('u1')],
			['u2', fakeMember('u2')],
		]);
		const facilMap = new Map([['f1', fakeMember('f1')]]);
		const originalUserMapKeys = Array.from(userMap.keys());
		const originalFacilMapKeys = Array.from(facilMap.keys());

		distributeUsers(users, rooms);
		distributeUsers(userMap, rooms, facilMap);

		expect(users).toEqual(originalUsers);
		expect(Array.from(userMap.keys())).toEqual(originalUserMapKeys);
		expect(Array.from(facilMap.keys())).toEqual(originalFacilMapKeys);
	});

	it('throws an error when no breakout rooms are provided', () => {
		const users = [fakeMember('u1')];

		expect(() => distributeUsers(users, [])).toThrow(
			'No breakout rooms provided.',
		);
	});

	it('handles zero regular users gracefully', () => {
		const rooms = [fakeRoom('r1', 'room-1'), fakeRoom('r2', 'room-2')];

		const result = distributeUsers([], rooms);

		expect(result.r1).toEqual([]);
		expect(result.r2).toEqual([]);
	});

	it('handles uneven user distribution when count is not divisible by rooms', () => {
		const users = Array.from({ length: 5 }, (_, i) => fakeMember(`u${i}`));
		const rooms = [fakeRoom('r1', 'room-1'), fakeRoom('r2', 'room-2')];

		const result = distributeUsers(users, rooms);

		const counts = [result.r1?.length ?? 0, result.r2?.length ?? 0].sort();
		expect(counts).toEqual([2, 3]);

		const allDistributedIds = Object.values(result)
			.flat()
			.map((u) => u.id)
			.sort();
		expect(allDistributedIds).toEqual(['u0', 'u1', 'u2', 'u3', 'u4']);
	});
});
