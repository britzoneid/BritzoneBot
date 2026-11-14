import { REST, SlashCommandBuilder } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
	parseSyncArgs,
	selectSyncGuilds,
	syncCommands,
} from '@/lib/commandSync.js';
import type { Command } from '@/types/command.js';

const commands: Command[] = [
	{
		data: new SlashCommandBuilder().setName('ping').setDescription('Ping'),
		execute: async () => {},
	},
];
const guilds: [string, string][] = [
	['123', 'Testing'],
	['456', 'Production'],
];

describe('command synchronization', () => {
	it('requires exactly one explicit target', () => {
		expect(parseSyncArgs(['--guild', '123'])).toEqual({ guildId: '123' });
		expect(parseSyncArgs(['--all'])).toBe('all');
		expect(parseSyncArgs(['--help'])).toBe('help');
		for (const args of [
			[],
			['--guild'],
			['--guild', 'abc'],
			['--all', '--guild', '123'],
			['--unknown'],
			['--all', '--all'],
		]) {
			expect(() => parseSyncArgs(args)).toThrow('Choose exactly one target');
		}
	});

	it('restricts targets to configured guilds', () => {
		const config = {
			'123': { name: 'Testing' },
			'456': { name: 'Production' },
		};
		expect(selectSyncGuilds({ guildId: '123' }, config)).toEqual([guilds[0]]);
		expect(selectSyncGuilds('all', config)).toEqual(guilds);
		expect(() => selectSyncGuilds({ guildId: '789' }, config)).toThrow(
			'missing or invalid',
		);
		expect(() => selectSyncGuilds('all', {})).toThrow('No guilds configured');
	});

	it('reports partial failure, continues, and returns a failure count', async () => {
		const rest = new REST();
		const put = vi
			.spyOn(rest, 'put')
			.mockRejectedValueOnce(new Error('Missing access'))
			.mockResolvedValueOnce([]);
		const report = vi.fn();
		expect(await syncCommands(rest, '999', guilds, commands, report)).toBe(1);
		expect(put).toHaveBeenNthCalledWith(
			1,
			'/applications/999/guilds/123/commands',
			{ body: [commands[0]?.data.toJSON()] },
		);
		expect(put).toHaveBeenNthCalledWith(
			2,
			'/applications/999/guilds/456/commands',
			{ body: [commands[0]?.data.toJSON()] },
		);
		expect(report).toHaveBeenCalledWith('FAILED Testing (123): Missing access');
		expect(report).toHaveBeenLastCalledWith(
			'Sync complete: 1 succeeded, 1 failed.',
		);
	});

	it('returns success when every guild is registered', async () => {
		const rest = new REST();
		vi.spyOn(rest, 'put').mockResolvedValue([]);
		expect(await syncCommands(rest, '999', guilds, commands, vi.fn())).toBe(0);
	});

	it('does not write an empty or unserializable command set', async () => {
		const rest = new REST();
		const put = vi.spyOn(rest, 'put').mockResolvedValue([]);
		await expect(
			syncCommands(rest, '999', guilds, [], vi.fn()),
		).rejects.toThrow('No commands loaded');
		const invalid = {
			data: new SlashCommandBuilder().setName('invalid'),
			execute: async () => {},
		};
		await expect(
			syncCommands(rest, '999', guilds, [...commands, invalid], vi.fn()),
		).rejects.toThrow();
		expect(put).not.toHaveBeenCalled();
	});
});
