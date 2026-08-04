import { Events } from 'discord.js';
import { logger } from '@/lib/logger.js';
import { monitorBreakoutTimer } from '@/modules/breakout/services/timer.js';
import { getAllGuildStates } from '@/modules/breakout/state/state.js';
import type { Event } from '@/types/index.js';

/**
 * Ready event - fires once when the bot is ready
 */
const event: Event<typeof Events.ClientReady> = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		logger.info(
			{ user: client.user },
			`✅ Ready! Logged in as ${client.user?.tag}`,
		);

		// Resume active timers after bot is ready and client cache is available
		try {
			const states = await getAllGuildStates();
			const entries = Object.entries(states);
			let resumedCount = 0;

			for (const [guildId, guildState] of entries) {
				if (guildState.timerData) {
					logger.info({ guildId }, '🔄 Resuming breakout timer from state');
					resumedCount++;
					monitorBreakoutTimer(guildState.timerData, client).catch((err) => {
						logger.error({ err, guildId }, '❌ Error resuming breakout timer');
					});
				}
			}

			if (resumedCount > 0) {
				logger.info(
					{ count: resumedCount },
					'⏱️ Resumed active breakout timers',
				);
			}
		} catch (error) {
			logger.error({ err: error }, '❌ Error re-attaching timers on startup');
		}
	},
};

export default event;
