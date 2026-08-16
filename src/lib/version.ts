import { version as discordJsVersion, EmbedBuilder } from 'discord.js';
import { BUILD_INFO, type BuildInfo } from './buildInfo.generated.js';

export interface SystemDiagnostics {
	uptime: string;
	uptimeSeconds: number;
	bunVersion: string | null;
	nodeVersion: string;
	discordJsVersion: string;
	environment: string;
	platform: string;
	heapUsedMB: string;
	rssMB: string;
}

/**
 * Formats a duration in seconds into a human-readable string (e.g., "2d 4h 12m 30s").
 */
export function formatDuration(totalSeconds: number): string {
	const seconds = Math.floor(totalSeconds % 60);
	const minutes = Math.floor((totalSeconds / 60) % 60);
	const hours = Math.floor((totalSeconds / 3600) % 24);
	const days = Math.floor(totalSeconds / 86400);

	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

	return parts.join(' ');
}

/**
 * Collects dynamic runtime diagnostics from the active process.
 */
export function getSystemDiagnostics(): SystemDiagnostics {
	const mem = process.memoryUsage();
	const bunVer =
		(process.versions as Record<string, string | undefined>).bun ?? null;

	return {
		uptime: formatDuration(process.uptime()),
		uptimeSeconds: process.uptime(),
		bunVersion: bunVer,
		nodeVersion: process.version,
		discordJsVersion,
		environment: process.env.NODE_ENV || 'development',
		platform: `${process.platform} (${process.arch})`,
		heapUsedMB: (mem.heapUsed / (1024 * 1024)).toFixed(1),
		rssMB: (mem.rss / (1024 * 1024)).toFixed(1),
	};
}

/**
 * Formats an ISO 8601 build timestamp into Discord timestamp markdown format (<t:TIMESTAMP:f>).
 */
export function formatBuildTime(isoDateString: string): string {
	const timestamp = Date.parse(isoDateString);
	if (Number.isNaN(timestamp)) {
		return `\`${isoDateString}\``;
	}
	const unixSeconds = Math.floor(timestamp / 1000);
	return `<t:${unixSeconds}:f> (<t:${unixSeconds}:R>)`;
}

/**
 * Builds a structured Discord embed displaying bot version, build metadata, and runtime diagnostics.
 */
export function buildVersionEmbed(
	buildInfo: BuildInfo = BUILD_INFO,
): EmbedBuilder {
	const diag = getSystemDiagnostics();
	const runtimeLabel = diag.bunVersion
		? `Bun v${diag.bunVersion}`
		: `Node ${diag.nodeVersion}`;

	const dirtyBadge = buildInfo.dirty ? ' *(dirty)*' : '';
	const gitValue =
		buildInfo.commitShort !== 'unknown'
			? `\`${buildInfo.commitShort}\` (${buildInfo.branch})${dirtyBadge}`
			: '`unknown`';

	return new EmbedBuilder()
		.setTitle('🤖 BritzoneBot Information')
		.setColor('#5865F2')
		.addFields(
			{
				name: '📦 Application',
				value: `**Version:** \`v${buildInfo.version}\`\n**Environment:** \`${diag.environment}\``,
				inline: true,
			},
			{
				name: '🌿 Git Metadata',
				value: `**Commit:** ${gitValue}\n**Branch:** \`${buildInfo.branch}\``,
				inline: true,
			},
			{
				name: '⏱️ Timing & Lifecycle',
				value: `**Built At:** ${formatBuildTime(buildInfo.builtAt)}\n**Uptime:** \`${diag.uptime}\``,
				inline: false,
			},
			{
				name: '⚙️ Runtime & Platform',
				value: `**Runtime:** \`${runtimeLabel}\`\n**Discord.js:** \`v${diag.discordJsVersion}\`\n**Platform:** \`${diag.platform}\``,
				inline: true,
			},
			{
				name: '📊 Memory Usage',
				value: `**Heap:** \`${diag.heapUsedMB} MB\`\n**RSS:** \`${diag.rssMB} MB\``,
				inline: true,
			},
		)
		.setFooter({ text: 'BritzoneBot Diagnostics' })
		.setTimestamp();
}
