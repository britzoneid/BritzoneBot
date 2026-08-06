import type { GuildMember } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { isBotManager } from '@/lib/discord/permission.js';

describe('Discord Permission Utilities (permission.ts)', () => {
	it('allows access when the guild has a matching manager role', () => {
		const member = {
			guild: { id: 'guild-1' },
			roles: {
				cache: {
					has: (roleId: string) => roleId === 'role-1',
				},
			},
		} as unknown as GuildMember;

		expect(
			isBotManager(member, {
				'guild-1': { managerRoleId: 'role-1' },
			}),
		).toBe(true);
	});

	it('denies access when the guild config does not match the member role', () => {
		const member = {
			guild: { id: 'guild-2' },
			roles: {
				cache: {
					has: (roleId: string) => roleId === 'role-1',
				},
			},
		} as unknown as GuildMember;

		expect(
			isBotManager(member, {
				'guild-2': { managerRoleId: 'role-2' },
			}),
		).toBe(false);
	});

	it('denies access when no guild config exists', () => {
		const member = {
			guild: { id: 'guild-3' },
			roles: {
				cache: {
					has: () => false,
				},
			},
		} as unknown as GuildMember;

		expect(isBotManager(member, {})).toBe(false);
	});
});
