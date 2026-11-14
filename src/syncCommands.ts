import 'dotenv/config';
import { REST } from 'discord.js';
import {
	parseSyncArgs,
	selectSyncGuilds,
	syncCommands,
	syncUsage,
} from '@/lib/commandSync.js';

try {
	const target = parseSyncArgs(process.argv.slice(2));
	if (target === 'help') {
		console.log(syncUsage);
	} else {
		const { BOT_ID, TOKEN } = process.env;
		if (!BOT_ID || !/^\d+$/.test(BOT_ID) || !TOKEN?.trim()) {
			throw new Error(
				'Set BOT_ID (application ID) and TOKEN in .env before syncing commands.',
			);
		}
		const { loadGuildConfig } = await import('@/lib/guildConfig.js');
		const guilds = selectSyncGuilds(target, loadGuildConfig());
		const { loadCommands } = await import('@/lib/loadCommands.js');
		const commands = await loadCommands();
		const failures = await syncCommands(
			new REST().setToken(TOKEN),
			BOT_ID,
			guilds,
			commands,
			console.log,
		);
		if (failures > 0) process.exitCode = 1;
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
