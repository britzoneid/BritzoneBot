import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCommands } from '@/lib/loadCommands.js';

const { files } = vi.hoisted(() => ({ files: vi.fn() }));
vi.mock('node:fs', () => ({ default: { readdirSync: () => ['utility'] } }));
vi.mock('@/lib/moduleFiles.js', () => ({
	moduleExtensionOf: () => '.ts',
	listModuleFiles: files,
}));

describe('shared command loader', () => {
	beforeEach(() => files.mockReset());

	it('loads command definitions and handlers', async () => {
		files.mockReturnValue(['ping.ts']);
		const commands = await loadCommands();
		expect(commands.map((command) => command.data.name)).toEqual(['ping']);
		expect(commands[0]?.execute).toBeTypeOf('function');
	});

	it('rejects a partial load by default', async () => {
		files.mockReturnValue(['ping.ts', 'missing-command.ts']);
		await expect(loadCommands()).rejects.toThrow();
	});

	it('allows startup to report errors and keep valid commands', async () => {
		files.mockReturnValue(['ping.ts', 'missing-command.ts']);
		const onError = vi.fn();
		expect(
			(await loadCommands(onError)).map((command) => command.data.name),
		).toEqual(['ping']);
		expect(onError).toHaveBeenCalledOnce();
	});

	it('rejects duplicate command names', async () => {
		files.mockReturnValue(['ping.ts', 'ping.ts']);
		await expect(loadCommands()).rejects.toThrow('Duplicate command name');
	});
});
