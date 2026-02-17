import type { ClientEvents } from 'discord.js';

/**
 * Event names from Discord.js
 */
export type EventName = keyof ClientEvents;

/**
 * Base interface for all event handlers
 * Auto-types the execute arguments based on the event name
 */
export interface Event<T extends EventName = EventName> {
	name: T;
	once?: boolean;
	execute(...args: ClientEvents[T]): Awaitable<void>;
}

/**
 * Utility type for any awaitable value (Promise or plain value)
 */
export type Awaitable<T> = T | Promise<T>;
