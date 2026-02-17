import type { BaseInteraction, Guild, User } from 'discord.js';
import pino from 'pino';

// Custom serializers to safely log Discord structures
// These prevent circular reference errors and keep logs concise
const serializers = {
	guild: (guild: Guild) => ({
		id: guild.id,
		name: guild.name,
		memberCount: guild.memberCount ?? 'unknown',
	}),
	user: (user: User) => ({
		id: user.id,
		tag: user.tag,
		bot: user.bot,
	}),
	interaction: (interaction: BaseInteraction) => ({
		id: interaction.id,
		type: interaction.type,
		commandName: interaction.isCommand() ? interaction.commandName : undefined,
		userId: interaction.user.id,
		guildId: interaction.guildId,
	}),
	// Use standard error serializer
	err: pino.stdSerializers.err,
};

/**
 * Main application logger instance.
 * Configured with:
 * - Pretty printing for readability in development
 * - Custom serializers for Discord.js objects
 * - Timestamp translation
 * - Redaction for sensitive keys
 */
export const logger = pino({
	level: process.env.LOG_LEVEL || 'info',
	base: {
		env: process.env.NODE_ENV,
	},
	serializers,
	redact: {
		paths: ['token', 'password', 'secret', 'key', '*.token', '*.password'],
		remove: true,
	},
	// Use pino-pretty transport. In high-load production, you might want to log JSON directly
	// and pipe to pino-pretty externally, but the built-in transport uses a worker thread
	// so it doesn't block the main event loop.
	transport: {
		targets: [
			{
				target: 'pino-pretty',
				level: process.env.LOG_LEVEL || 'info',
				options: {
					colorize: true,
					translateTime: 'yyyy-mm-dd HH:MM:ss',
					ignore: 'pid,hostname', // Remove pid/hostname for cleaner console output
					messageFormat: '{msg}', // Just show the message, let metadata be shown as object fields
				},
			},
			{
				target: 'pino-roll',
				level: process.env.LOG_LEVEL || 'info',
				options: {
					file: './log/app.log',
					frequency: 'daily',
					dateFormat: 'yyyy-MM-dd',
					mkdir: true,
					limit: {
						count: 7,
					},
				},
			},
		],
	},
});

// Create a child logger for a specific context
export const createChildLogger = (bindings: pino.Bindings) => {
	return logger.child(bindings);
};
