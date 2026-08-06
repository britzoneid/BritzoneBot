import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateEnv } from '@/lib/env.js';
import { getGuildConfigStatus } from '@/lib/guildConfig.js';

describe('Environment and GuildConfig Validation', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it('throws error when TOKEN is missing', () => {
		delete (process.env as Record<string, string | undefined>).TOKEN;
		expect(() => validateEnv()).toThrow(
			'TOKEN environment variable is not defined',
		);
	});

	it('returns validated env when TOKEN is set', () => {
		process.env.TOKEN = 'test-token-123';
		const env = validateEnv();
		expect(env.TOKEN).toBe('test-token-123');
	});

	it('getGuildConfigStatus accurately detects config statuses', () => {
		const emptyConfigMap = {};
		expect(getGuildConfigStatus('guild-1', emptyConfigMap)).toBe(
			'FILE_MISSING',
		);

		const unconfiguredGuildMap = {
			'guild-1': { name: 'Test Guild' },
		};
		expect(getGuildConfigStatus('guild-1', unconfiguredGuildMap)).toBe(
			'GUILD_NOT_CONFIGURED',
		);

		const configuredGuildMap = {
			'guild-1': { name: 'Test Guild', managerRoleId: 'role-123' },
		};
		expect(getGuildConfigStatus('guild-1', configuredGuildMap)).toBe(
			'CONFIGURED',
		);
	});
});
