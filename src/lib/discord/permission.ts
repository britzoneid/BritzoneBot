import fs from 'node:fs';
import path from 'node:path';
import type { GuildMember } from 'discord.js';

interface GuildRoleConfig {
	managerRoleId: string;
}

type GuildRoleConfigMap = Record<string, GuildRoleConfig>;

const __dirname = import.meta.dirname;
const guildConfigPath = path.join(__dirname, '../../../guildConfig.json');

let cachedGuildConfig: GuildRoleConfigMap | null = null;

function loadGuildConfig(): GuildRoleConfigMap {
	if (cachedGuildConfig) {
		return cachedGuildConfig;
	}

	if (!fs.existsSync(guildConfigPath)) {
		cachedGuildConfig = {};
		return cachedGuildConfig;
	}

	const parsedConfig = JSON.parse(fs.readFileSync(guildConfigPath, 'utf-8')) as
		| GuildRoleConfigMap
		| undefined;

	cachedGuildConfig = parsedConfig ?? {};
	return cachedGuildConfig;
}

export function isBotManager(
	member: GuildMember,
	guildConfig: GuildRoleConfigMap = loadGuildConfig(),
): boolean {
	const config = guildConfig[member.guild.id];
	return Boolean(
		config?.managerRoleId && member.roles.cache.has(config.managerRoleId),
	);
}
