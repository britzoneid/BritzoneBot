import { logger } from '@/lib/logger.js';

export interface EnvConfig {
	TOKEN: string;
	BOT_ID?: string;
	LOG_LEVEL?: string;
	NODE_ENV?: string;
}

/**
 * Validates mandatory environment variables.
 * Throws a descriptive error if critical environment variables are missing.
 */
export function validateEnv(): EnvConfig {
	const token = process.env.TOKEN;
	if (!token || token.trim() === '') {
		const errorMsg =
			'TOKEN environment variable is not defined or empty. Please create a .env file based on .env.example with your bot token.';
		logger.fatal(errorMsg);
		throw new Error(errorMsg);
	}

	return {
		TOKEN: token,
		BOT_ID: process.env.BOT_ID,
		LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
		NODE_ENV: process.env.NODE_ENV ?? 'development',
	};
}
