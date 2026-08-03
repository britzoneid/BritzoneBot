import type { GuildMember, VoiceBasedChannel, VoiceChannel } from 'discord.js';
import { describe, expect, it } from 'vitest';
import type { UserDistribution } from '@/modules/breakout/utils/distribution.js';
import { buildDistributionEmbed } from '@/modules/breakout/utils/embeds.js';

const fakeMainRoom = {
	id: 'main-1',
	name: 'Main Lounge',
} as unknown as VoiceBasedChannel;

const fakeRoom = (id: string, name: string): VoiceChannel =>
	({
		id,
		name,
	}) as unknown as VoiceChannel;

const fakeMember = (id: string, tag: string): GuildMember =>
	({
		id,
		user: { id, tag },
	}) as unknown as GuildMember;

describe('buildDistributionEmbed', () => {
	it('builds standard distribution embed with title, color, and description', () => {
		const rooms = [fakeRoom('r1', 'Room 1'), fakeRoom('r2', 'Room 2')];
		const distribution: UserDistribution = {
			r1: [fakeMember('u1', 'Alice#0001')],
			r2: [fakeMember('u2', 'Bob#0002')],
		};

		const embed = buildDistributionEmbed({
			mainRoom: fakeMainRoom,
			breakoutRooms: rooms,
			distribution,
			isPreview: false,
		});

		const json = embed.toJSON();
		expect(json.title).toBe('Breakout Room Assignment');
		expect(json.color).toBe(0x00ff00); // Green
		expect(json.description).toContain('Main Lounge');
		expect(json.fields).toHaveLength(2);
		expect(json.fields?.[0]?.name).toBe('Room 1');
		expect(json.fields?.[0]?.value).toBe('Alice#0001');
	});

	it('builds preview embed with blue color and preview title', () => {
		const rooms = [fakeRoom('r1', 'Room 1')];

		const embed = buildDistributionEmbed({
			mainRoom: fakeMainRoom,
			breakoutRooms: rooms,
			isPreview: true,
		});

		const json = embed.toJSON();
		expect(json.title).toBe('📋 Breakout Room Assignment (Preview)');
		expect(json.color).toBe(0x3b82f6); // Blue
		expect(json.description).toContain('Preview of user distribution');
	});

	it('enforces Discord max 25 field limit when breakout rooms exceed limit', () => {
		const rooms = Array.from({ length: 30 }, (_, i) =>
			fakeRoom(`r${i}`, `Breakout Room ${i + 1}`),
		);

		const embed = buildDistributionEmbed({
			mainRoom: fakeMainRoom,
			breakoutRooms: rooms,
		});

		const json = embed.toJSON();
		expect(json.fields?.length).toBeLessThanOrEqual(25);
		expect(json.fields).toHaveLength(25);
	});

	it('prefixes facilitators with 🗣️ icon in room field list', () => {
		const rooms = [fakeRoom('r1', 'Room 1')];
		const facilitators = new Set(['f1']);
		const distribution: UserDistribution = {
			r1: [fakeMember('f1', 'Facil#0001'), fakeMember('u1', 'User#0001')],
		};

		const embed = buildDistributionEmbed({
			mainRoom: fakeMainRoom,
			breakoutRooms: rooms,
			facilitators,
			distribution,
		});

		const json = embed.toJSON();
		expect(json.fields?.[0]?.value).toContain('🗣️ Facil#0001');
		expect(json.fields?.[0]?.value).toContain('User#0001');
	});

	it('includes excluded users section when excludedUsers is provided', () => {
		const rooms = [fakeRoom('r1', 'Room 1')];
		const excludedUsers = new Set(['u2']);
		const usersInMainRoom = new Map<string, GuildMember>([
			['u1', fakeMember('u1', 'Alice#0001')],
			['u2', fakeMember('u2', 'Bob#0002')],
		]);

		const embed = buildDistributionEmbed({
			mainRoom: fakeMainRoom,
			breakoutRooms: rooms,
			excludedUsers,
			usersInMainRoom,
		});

		const json = embed.toJSON();
		const excludedField = json.fields?.find(
			(f) => f.name === '🚫 Excluded Users',
		);
		expect(excludedField).toBeDefined();
		expect(excludedField?.value).toContain('Bob#0002');
	});

	it('renders failed moves field when moveResults contains failures', () => {
		const rooms = [fakeRoom('r1', 'Room 1')];
		const moveResults = {
			success: [
				{
					userId: 'u1',
					userTag: 'Alice#0001',
					roomId: 'r1',
					roomName: 'Room 1',
				},
			],
			failed: [
				{ userId: 'u2', userTag: 'Bob#0002', reason: 'User left voice' },
			],
		};

		const embed = buildDistributionEmbed({
			mainRoom: fakeMainRoom,
			breakoutRooms: rooms,
			moveResults,
		});

		const json = embed.toJSON();
		const failedField = json.fields?.find((f) => f.name === 'Failed Moves');
		expect(failedField).toBeDefined();
		expect(failedField?.value).toContain('Bob#0002 (User left voice)');
	});

	it('reserves 1 field slot for Failed Moves at 25-field boundary', () => {
		const rooms = Array.from({ length: 30 }, (_, i) =>
			fakeRoom(`r${i}`, `Breakout Room ${i + 1}`),
		);
		const moveResults = {
			success: [],
			failed: [
				{ userId: 'u99', userTag: 'FailedUser#0001', reason: 'Disconnected' },
			],
		};

		const embed = buildDistributionEmbed({
			mainRoom: fakeMainRoom,
			breakoutRooms: rooms,
			moveResults,
		});

		const json = embed.toJSON();
		expect(json.fields).toHaveLength(25);
		const failedField = json.fields?.find((f) => f.name === 'Failed Moves');
		expect(failedField).toBeDefined();
		const roomFields = json.fields?.filter((f) => f.name !== 'Failed Moves');
		expect(roomFields).toHaveLength(24);
	});

	it('truncates room member field values that exceed 1000 characters', () => {
		const rooms = [fakeRoom('r1', 'Room 1')];

		// Create a large number of members so string exceeds 1000 chars
		const distribution: UserDistribution = {
			r1: Array.from({ length: 50 }, (_, i) =>
				fakeMember(`u${i}`, `VeryLongUsernameThatRepeats_${i}#${1000 + i}`),
			),
		};

		const embed = buildDistributionEmbed({
			mainRoom: fakeMainRoom,
			breakoutRooms: rooms,
			distribution,
		});

		const json = embed.toJSON();
		const roomFieldValue = json.fields?.[0]?.value ?? '';
		expect(roomFieldValue.length).toBeLessThanOrEqual(1004);
		expect(roomFieldValue).toContain('...');
	});
});
