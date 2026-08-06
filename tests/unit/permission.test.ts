import type {
	CategoryChannel,
	Guild,
	GuildMember,
	VoiceChannel,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
	canBotManageChannels,
	canBotMoveMembers,
	canBotSendMessage,
	canInvokeBreakout,
	canMemberMoveMembers,
	isBotManager,
	preflightBreakout,
	reloadPermissionConfig,
} from '@/lib/discord/permission.js';

describe('Discord Permission Utilities (permission.ts)', () => {
	it('allows access when member is the guild owner (owner bypass)', () => {
		const member = {
			id: 'owner-123',
			guild: { id: 'guild-1', ownerId: 'owner-123' },
			roles: { cache: { has: () => false } },
		} as unknown as GuildMember;

		expect(isBotManager(member, {})).toBe(true);
		expect(canInvokeBreakout(member, {})).toBe(true);
	});

	it('allows access when the guild has a matching manager role', () => {
		const member = {
			id: 'user-1',
			guild: { id: 'guild-1', ownerId: 'owner-999' },
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
			id: 'user-2',
			guild: { id: 'guild-2', ownerId: 'owner-999' },
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
			id: 'user-3',
			guild: { id: 'guild-3', ownerId: 'owner-999' },
			roles: {
				cache: {
					has: () => false,
				},
			},
		} as unknown as GuildMember;

		expect(isBotManager(member, {})).toBe(false);
	});

	it('allows force-reloading permission config', () => {
		expect(() => reloadPermissionConfig()).not.toThrow();
	});

	describe('Bot capability checks', () => {
		it('canBotManageChannels checks bot permissions on category', () => {
			const me = { id: 'bot-1' };
			const category = {
				permissionsFor: (target: unknown) =>
					target === me ? { has: () => true } : null,
			} as unknown as CategoryChannel;

			const guild = {
				members: { me },
			} as unknown as Guild;

			expect(canBotManageChannels(guild, category)).toBe(true);
		});

		it('canBotMoveMembers returns false if bot is missing perms', () => {
			const me = { id: 'bot-1' };
			const voiceChannel = {
				permissionsFor: () => ({ has: () => false }),
			} as unknown as VoiceChannel;

			const guild = {
				members: { me },
			} as unknown as Guild;

			expect(canBotMoveMembers(guild, voiceChannel)).toBe(false);
		});

		it('canBotSendMessage returns true if bot has send permissions', () => {
			const me = { id: 'bot-1' };
			const textChannel = {
				permissionsFor: () => ({ has: () => true }),
			} as unknown as CategoryChannel;

			const guild = {
				members: { me },
			} as unknown as Guild;

			expect(canBotSendMessage(guild, textChannel)).toBe(true);
		});

		it('returns false when guild.members.me is null', () => {
			const guild = { members: { me: null } } as unknown as Guild;
			expect(canBotManageChannels(guild)).toBe(false);
			expect(canBotMoveMembers(guild)).toBe(false);
			expect(canBotSendMessage(guild)).toBe(false);
		});
	});

	describe('User capability checks', () => {
		it('canMemberMoveMembers checks member permissions', () => {
			const member = {
				permissions: { has: () => true },
			} as unknown as GuildMember;

			expect(canMemberMoveMembers(member)).toBe(true);
		});
	});

	describe('preflightBreakout composite check', () => {
		it('reports missing guildConfig.json when file is absent', () => {
			const member = {
				id: 'user-1',
				guild: { id: 'guild-1', ownerId: 'owner-999' },
				roles: { cache: { has: () => false } },
			} as unknown as GuildMember;

			const result = preflightBreakout({ member });
			expect(result.ok).toBe(false);
			expect(result.reason).toContain('guildConfig.json');
		});

		it('fails if member does not have manager role when guild is configured', () => {
			const member = {
				id: 'user-1',
				guild: { id: 'guild-1', ownerId: 'owner-999' },
				roles: { cache: { has: () => false } },
			} as unknown as GuildMember;

			const result = preflightBreakout(
				{ member },
				{ 'guild-1': { managerRoleId: 'role-99' } },
			);
			expect(result.ok).toBe(false);
			expect(result.reason).toContain('manager role');
		});

		it('succeeds for owner bypass', () => {
			const me = { permissions: { has: () => true } };
			const member = {
				id: 'owner-999',
				guild: { id: 'guild-1', ownerId: 'owner-999', members: { me } },
				roles: { cache: { has: () => false } },
				permissions: { has: () => true },
			} as unknown as GuildMember;

			const result = preflightBreakout({ member });
			expect(result.ok).toBe(true);
		});
	});
});
