import { type REST, Routes } from 'discord.js';
import type { GuildConfigMap } from '@/lib/guildConfig.js';
import type { Command } from '@/types/command.js';

export const syncUsage = `Usage:
  bun run commands:sync --guild <id>
  bun run commands:sync --all
  bun run commands:sync --help

Replaces this application's guild commands with the current source definitions.
Targets must be configured in guildConfig.json. Global commands are unaffected.`;

export type SyncTarget = { guildId: string } | 'all' | 'help';

export function parseSyncArgs(args: string[]): SyncTarget {
	if (args.length === 1 && args[0] === '--help') return 'help';
	if (args.length === 1 && args[0] === '--all') return 'all';
	if (
		args.length === 2 &&
		args[0] === '--guild' &&
		/^\d+$/.test(args[1] ?? '')
	) {
		return { guildId: args[1] as string };
	}
	throw new Error(
		`Choose exactly one target: --guild <id> or --all.\n\n${syncUsage}`,
	);
}

export function selectSyncGuilds(
	target: Exclude<SyncTarget, 'help'>,
	config: GuildConfigMap,
): [string, string][] {
	const ids = target === 'all' ? Object.keys(config) : [target.guildId];
	if (ids.length === 0)
		throw new Error(
			'No guilds configured. Configure guildConfig.json using guildConfig.json.example.',
		);
	return ids.map((id) => {
		if (
			!Object.hasOwn(config, id) ||
			!/^\d+$/.test(id) ||
			!config[id] ||
			typeof config[id] !== 'object'
		) {
			throw new Error(`Guild ${id} is missing or invalid in guildConfig.json.`);
		}
		return [id, config[id].name || id];
	});
}

export async function syncCommands(
	rest: Pick<REST, 'put'>,
	botId: string,
	guilds: [string, string][],
	commands: Command[],
	report: (message: string) => void,
): Promise<number> {
	if (commands.length === 0)
		throw new Error('No commands loaded; refusing to clear guild commands.');
	// Serialize everything before the first write so a bad definition cannot cause a partial deployment.
	const body = commands.map((command) => command.data.toJSON());
	report(
		`Application: ${botId}\nSource: current checkout\nReplacing guild command sets with ${body.length} commands: ${commands.map((command) => command.data.name).join(', ')}`,
	);
	report(
		`Targets: ${guilds.map(([id, name]) => `${name} (${id})`).join(', ')}`,
	);
	let failures = 0;
	for (const [id, name] of guilds) {
		try {
			await rest.put(Routes.applicationGuildCommands(botId, id), { body });
			report(`OK ${name} (${id}): ${body.length} commands registered`);
		} catch (error) {
			failures++;
			report(
				`FAILED ${name} (${id}): ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	report(
		`Sync complete: ${guilds.length - failures} succeeded, ${failures} failed.`,
	);
	return failures;
}
