import fs from 'node:fs';
import path from 'node:path';
import { logger } from '@/lib/logger.js';

export interface GuildConfig {
	name?: string;
	managerRoleId?: string;
}

export type GuildConfigMap = Record<string, GuildConfig>;

export type GuildConfigStatus =
	| 'FILE_MISSING'
	| 'GUILD_NOT_CONFIGURED'
	| 'CONFIGURED';

const guildConfigPath = path.resolve(process.cwd(), 'guildConfig.json');

let cachedGuildConfig: GuildConfigMap | null = null;

export function guildConfigExists(): boolean {
	return fs.existsSync(guildConfigPath);
}

export function loadGuildConfig(): GuildConfigMap {
	if (cachedGuildConfig) {
		return cachedGuildConfig;
	}

	try {
		if (!guildConfigExists()) {
			cachedGuildConfig = {};
			return cachedGuildConfig;
		}

		const raw = fs.readFileSync(guildConfigPath, 'utf-8');
		cachedGuildConfig = (JSON.parse(raw) as GuildConfigMap) ?? {};
		return cachedGuildConfig;
	} catch (err) {
		logger.warn(
			{ err, path: guildConfigPath },
			'Failed to load guildConfig.json',
		);
		cachedGuildConfig = {};
		return cachedGuildConfig;
	}
}

export function getGuildConfigStatus(
	guildId?: string,
	configMap: GuildConfigMap = loadGuildConfig(),
): GuildConfigStatus {
	if (Object.keys(configMap).length === 0) {
		return 'FILE_MISSING';
	}

	if (!guildId) {
		return 'GUILD_NOT_CONFIGURED';
	}

	const guildConfig = configMap[guildId];
	if (!guildConfig || !guildConfig.managerRoleId) {
		return 'GUILD_NOT_CONFIGURED';
	}

	return 'CONFIGURED';
}

export function reloadGuildConfig(): void {
	cachedGuildConfig = null;
	loadGuildConfig();
	logger.info('Guild configuration reloaded');
}
