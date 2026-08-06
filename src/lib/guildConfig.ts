import fs from 'node:fs';
import path from 'node:path';
import { logger } from '@/lib/logger.js';

export interface GuildConfig {
	name?: string;
	managerRoleId?: string;
}

export type GuildConfigMap = Record<string, GuildConfig>;

const guildConfigPath = path.resolve(process.cwd(), 'guildConfig.json');

let cachedGuildConfig: GuildConfigMap | null = null;

export function loadGuildConfig(): GuildConfigMap {
	if (cachedGuildConfig) {
		return cachedGuildConfig;
	}

	try {
		if (!fs.existsSync(guildConfigPath)) {
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

export function reloadGuildConfig(): void {
	cachedGuildConfig = null;
	loadGuildConfig();
	logger.info('Guild configuration reloaded');
}
