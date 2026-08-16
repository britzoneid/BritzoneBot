import type {
	CommandInteraction,
	RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import versionCommand from '@/commands/utility/version.js';
import type { BuildInfo } from '@/lib/buildInfo.generated.js';
import {
	buildVersionEmbed,
	formatBuildTime,
	formatDuration,
	getSystemDiagnostics,
} from '@/lib/version.js';
import type { SlashCommand } from '@/types/index.js';

describe('Version Utilities & Diagnostics', () => {
	describe('formatDuration', () => {
		it('formats seconds correctly', () => {
			expect(formatDuration(0)).toBe('0s');
			expect(formatDuration(45)).toBe('45s');
		});

		it('formats minutes and seconds correctly', () => {
			expect(formatDuration(90)).toBe('1m 30s');
			expect(formatDuration(600)).toBe('10m');
			expect(formatDuration(605)).toBe('10m 5s');
		});

		it('formats hours, minutes, and seconds correctly', () => {
			expect(formatDuration(3665)).toBe('1h 1m 5s');
		});

		it('formats days, hours, minutes, and seconds correctly', () => {
			expect(formatDuration(90061)).toBe('1d 1h 1m 1s');
		});
	});

	describe('formatBuildTime', () => {
		it('formats a valid ISO timestamp into Discord relative timestamp format', () => {
			const iso = '2026-08-16T12:00:00.000Z';
			const formatted = formatBuildTime(iso);
			const expectedTimestamp = Math.floor(new Date(iso).getTime() / 1000);
			expect(formatted).toBe(
				`<t:${expectedTimestamp}:f> (<t:${expectedTimestamp}:R>)`,
			);
		});

		it('returns raw text wrapped in backticks when timestamp is invalid', () => {
			expect(formatBuildTime('invalid-date')).toBe('`invalid-date`');
		});
	});

	describe('getSystemDiagnostics', () => {
		it('collects expected diagnostic metrics', () => {
			const diag = getSystemDiagnostics();
			expect(diag.uptime).toBeDefined();
			expect(diag.discordJsVersion).toBeDefined();
			expect(diag.environment).toBeDefined();
			expect(diag.platform).toBeDefined();
			expect(typeof diag.heapUsedMB).toBe('string');
			expect(typeof diag.rssMB).toBe('string');
		});
	});

	describe('buildVersionEmbed', () => {
		const mockBuildInfo: BuildInfo = {
			version: '3.1.0',
			commit: 'abcdef1234567890',
			commitShort: 'abcdef1',
			branch: 'feat/test-branch',
			dirty: false,
			builtAt: '2026-08-16T12:00:00.000Z',
		};

		it('builds an embed with correct fields and title', () => {
			const embed = buildVersionEmbed(mockBuildInfo);
			const json = embed.toJSON();

			expect(json.title).toBe('🤖 BritzoneBot Information');
			expect(json.color).toBe(0x5865f2);

			const fields = json.fields ?? [];
			expect(fields.length).toBe(5);

			const appField = fields.find((f) => f.name === '📦 Application');
			expect(appField?.value).toContain('v3.1.0');

			const gitField = fields.find((f) => f.name === '🌿 Git Metadata');
			expect(gitField?.value).toContain('abcdef1');
			expect(gitField?.value).toContain('feat/test-branch');
			expect(gitField?.value).not.toContain('(dirty)');

			const timingField = fields.find((f) => f.name === '⏱️ Timing & Lifecycle');
			expect(timingField?.value).toContain('Built At:');
			expect(timingField?.value).toContain('Uptime:');
		});

		it('appends dirty indicator when working tree was dirty at build time', () => {
			const dirtyBuildInfo: BuildInfo = {
				...mockBuildInfo,
				dirty: true,
			};
			const embed = buildVersionEmbed(dirtyBuildInfo);
			const json = embed.toJSON();

			const gitField = json.fields?.find((f) => f.name === '🌿 Git Metadata');
			expect(gitField?.value).toContain('(dirty)');
		});
	});
});

describe('Version Command (/version)', () => {
	it('defines the slash command data properly', () => {
		const json =
			versionCommand.data.toJSON() as RESTPostAPIChatInputApplicationCommandsJSONBody;
		expect(json.name).toBe('version');
		expect(json.description).toBe(
			'Displays bot version, build metadata, and runtime diagnostics',
		);
	});

	it('sends an ephemeral reply with the version embed upon execution', async () => {
		const replyMock = vi.fn().mockResolvedValue({});
		const mockInteraction = {
			id: 'interaction-version-1',
			replied: false,
			deferred: false,
			reply: replyMock,
		} as unknown as CommandInteraction;

		const slashCmd = versionCommand as SlashCommand;
		await slashCmd.execute(mockInteraction);

		expect(replyMock).toHaveBeenCalledTimes(1);
		const callArgs = replyMock.mock.calls[0][0];
		expect(callArgs.flags).toBe(MessageFlags.Ephemeral);
		expect(callArgs.withResponse).toBe(true);
		expect(callArgs.embeds).toBeDefined();
		expect(callArgs.embeds.length).toBe(1);
	});
});
