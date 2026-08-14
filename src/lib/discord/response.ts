/**
 * @fileoverview Discord interaction response and lifecycle management.
 *
 * ## Architecture Overview
 * This module provides a 2-tier abstraction for responding to Discord interactions:
 *
 * 1. **High-Level Context (`handleInteraction` + `InteractionContext`):**
 *    Preferred for all command and subcommand handlers. It wraps the execution inside a
 *    safe timeout race, manages interaction deferrals (`deferReply`), handles automatic error
 *    reporting if the handler fails, and provides an ergonomic `ctx` object with intent-based
 *    helpers (`ctx.reply()`, `ctx.editReply()`, `ctx.sendPublic()`).
 *
 * 2. **Low-Level State Dispatch (`replyOrEdit`):**
 *    A stateless utility that dynamically branches between `interaction.reply()` and
 *    `interaction.editReply()` based on the interaction's current state (`.replied` / `.deferred`).
 *    Used internally by `ctx.reply()` and externally in standalone contexts (e.g. event listeners,
 *    confirmation prompts, preflight permission guards).
 */

import type {
	CommandInteraction,
	InteractionEditReplyOptions,
	InteractionReplyOptions,
	Message,
	MessagePayload,
	RepliableInteraction,
} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { logger } from '@/lib/logger.js';

/**
 * Configuration options for the `handleInteraction` lifecycle wrapper.
 */
export interface InteractionHandlerOptions {
	/**
	 * Whether to automatically defer the reply before executing the handler.
	 * Recommended for long-running operations or commands with interactive prompts.
	 * @default false
	 */
	deferReply?: boolean;

	/**
	 * Whether the interaction response should only be visible to the user who invoked it.
	 * Automatically applied to `deferReply` if deferred, or to the initial `ctx.reply()` if not.
	 * @default false
	 */
	ephemeral?: boolean;

	/**
	 * Maximum time in milliseconds to wait for `deferReply()` before timing out.
	 * Discord requires an initial acknowledgement within 3000ms.
	 * @default 2500
	 */
	deferTimeoutMs?: number;

	/**
	 * Maximum time in milliseconds to allow the handler to execute before timing out.
	 * @default 15000 (15 seconds)
	 */
	handlerTimeoutMs?: number;

	/**
	 * Fallback user-facing error message sent if the handler throws an uncaught error or times out.
	 * @default '❌ An error occurred while processing this command.'
	 */
	errorMessage?: string;

	/**
	 * Whether to automatically send an error message to the user when the handler throws or times out.
	 * Set to `false` if the handler performs its own complete error reporting.
	 * @default true
	 */
	notifyOnError?: boolean;
}

/**
 * Options that extend Discord's InteractionReplyOptions to support a friendly `ephemeral` boolean directive.
 */
export interface ExtendedInteractionReplyOptions
	extends Omit<InteractionReplyOptions, 'flags'> {
	flags?: InteractionReplyOptions['flags'];
	ephemeral?: boolean;
}

/**
 * Valid payload formats acceptable when sending replies or editing responses.
 */
export type ResponsePayload =
	| string
	| ExtendedInteractionReplyOptions
	| InteractionEditReplyOptions
	| MessagePayload;

/**
 * Unified context passed into interaction handlers, providing intent-based response methods
 * and encapsulating Discord's internal reply/deferral state machine.
 */
export interface InteractionContext<
	T extends RepliableInteraction | CommandInteraction =
		| RepliableInteraction
		| CommandInteraction,
> {
	/**
	 * The raw Discord interaction instance.
	 */
	readonly interaction: T;

	/**
	 * Whether the interaction has been acknowledged via `deferReply()`.
	 */
	readonly isDeferred: boolean;

	/**
	 * Whether ephemeral responses were requested in `handleInteraction` options.
	 */
	readonly isEphemeral: boolean;

	/**
	 * Responds to the interaction with automatic state management.
	 *
	 * - **Fresh Interaction:** Calls `interaction.reply()`, automatically applying the configured
	 *   `ephemeral` flag if set in `handleInteraction` options.
	 * - **Deferred / Replied Interaction:** Calls `interaction.editReply()`.
	 * - **Idempotent Updates:** Can be called repeatedly within a handler to update a progress message
	 *   (e.g., `await ctx.reply('⏳ Working...')` followed by `await ctx.reply('✅ Done!')`).
	 *
	 * @param content The response message content, embeds, or options to send.
	 * @returns Promise resolving to the sent or edited Discord `Message`.
	 */
	reply: (content: ResponsePayload) => Promise<Message>;

	/**
	 * Directly edits the original interaction response.
	 * Useful when explicitly modifying components (e.g. disabling buttons) or clearing embeds.
	 *
	 * @param content The updated content or options.
	 * @returns Promise resolving to the edited Discord `Message`.
	 */
	editReply: (
		content: InteractionEditReplyOptions | MessagePayload | string,
	) => Promise<Message>;

	/**
	 * Sends a public announcement to the text channel where the interaction occurred.
	 * Fails gracefully without throwing errors if the channel lacks permissions or is non-text.
	 *
	 * @param options Content or message options to send to the channel.
	 * @returns Promise resolving to the sent Message or null if failed/unsupported.
	 */
	sendPublic: (
		options: string | MessagePayload | InteractionReplyOptions,
	) => Promise<Message | null>;
}

/**
 * Async handler callback receiving a unified `InteractionContext`.
 */
export type InteractionHandler<
	T extends RepliableInteraction | CommandInteraction =
		| RepliableInteraction
		| CommandInteraction,
> = (ctx: InteractionContext<T>) => Promise<void>;

/**
 * Safely extracts an error code from an Error object if present.
 * @param error The error to extract code from.
 * @returns The error code if present, otherwise undefined.
 */
function getErrorCode(error: Error): string | number | undefined {
	return 'code' in error
		? (error as Error & { code?: string | number }).code
		: undefined;
}

/**
 * Orchestrates interaction execution with built-in lifecycle management, deferrals,
 * timeout races, uncaught error containment, and automatic failure notification.
 *
 * @param interaction The Discord interaction to handle.
 * @param handler Async function receiving a unified `InteractionContext`.
 * @param options Lifecycle, timeout, and notification options.
 * @returns Promise resolving to `true` on successful completion, or `false` if an error/timeout occurred.
 */
export async function handleInteraction<
	T extends RepliableInteraction | CommandInteraction =
		| RepliableInteraction
		| CommandInteraction,
>(
	interaction: T,
	handler: InteractionHandler<T>,
	options: InteractionHandlerOptions = {},
): Promise<boolean> {
	const {
		deferReply = false,
		ephemeral = false,
		deferTimeoutMs = 2500,
		handlerTimeoutMs = 15000,
		errorMessage = '❌ An error occurred while processing this command.',
		notifyOnError = true,
	} = options;

	try {
		// If deferReply is true, try to defer the reply first
		if (deferReply && !interaction.replied && !interaction.deferred) {
			let deferTimeoutId: ReturnType<typeof setTimeout> | undefined;
			try {
				const deferPromise = interaction.deferReply(
					ephemeral ? { flags: MessageFlags.Ephemeral } : undefined,
				);
				const timeoutPromise = new Promise<never>((_, reject) => {
					deferTimeoutId = setTimeout(
						() => reject(new Error('Defer reply timeout')),
						deferTimeoutMs,
					);
				});

				await Promise.race([deferPromise, timeoutPromise]);
				logger.debug(
					{ interactionId: interaction.id },
					'🔄 Successfully deferred interaction',
				);
			} catch (deferError) {
				const error =
					deferError instanceof Error
						? deferError
						: new Error(String(deferError));
				const errorCode = getErrorCode(error);

				if (errorCode === 10062) {
					logger.warn(
						{ interactionId: interaction.id },
						'⏱️ Interaction expired before deferring',
					);
					return false;
				}

				if (
					errorCode === 'EAI_AGAIN' ||
					error.message === 'Defer reply timeout'
				) {
					logger.warn(
						{ interactionId: interaction.id, err: error },
						'🌐 Network issue while deferring interaction',
					);
					return false;
				}

				logger.error(
					{ interactionId: interaction.id, err: error },
					'❓ Unknown error while deferring interaction',
				);
				return false;
			} finally {
				if (deferTimeoutId) clearTimeout(deferTimeoutId);
			}
		}

		// Create the unified context for the handler
		const ctx: InteractionContext<T> = {
			interaction,
			get isDeferred() {
				return interaction.deferred;
			},
			isEphemeral: ephemeral,
			reply: (content: ResponsePayload) => {
				if (!interaction.replied && !interaction.deferred && ephemeral) {
					const payload: InteractionReplyOptions =
						typeof content === 'string'
							? { content, flags: MessageFlags.Ephemeral }
							: {
									flags: MessageFlags.Ephemeral,
									...(content as InteractionReplyOptions),
								};
					return replyOrEdit(interaction, payload);
				}
				return replyOrEdit(interaction, content);
			},
			editReply: (content) => {
				return interaction.editReply(
					content as InteractionEditReplyOptions,
				) as Promise<Message>;
			},
			sendPublic: (content) => {
				return sendPublicAnnouncement(interaction, content);
			},
		};

		// Execute the handler function with timeout protection
		let handlerTimeoutId: ReturnType<typeof setTimeout> | undefined;
		try {
			const handlerPromise = handler(ctx);
			const timeoutPromise = new Promise<never>((_, reject) => {
				handlerTimeoutId = setTimeout(
					() => reject(new Error('Handler execution timeout')),
					handlerTimeoutMs,
				);
			});

			await Promise.race([handlerPromise, timeoutPromise]);
			return true;
		} catch (handlerError) {
			const error =
				handlerError instanceof Error
					? handlerError
					: new Error(String(handlerError));
			logger.error(
				{ interactionId: interaction.id, err: error },
				'❌ Handler error for interaction',
			);

			if (notifyOnError) {
				try {
					await replyOrEdit(interaction, {
						content: errorMessage,
						flags: ephemeral ? MessageFlags.Ephemeral : undefined,
					});
				} catch (notifyErr) {
					logger.warn(
						{ interactionId: interaction.id, err: notifyErr },
						'⚠️ Failed to send error notification to interaction',
					);
				}
			}

			return false;
		} finally {
			if (handlerTimeoutId) clearTimeout(handlerTimeoutId);
		}
	} catch (error) {
		logger.error(
			{ interactionId: interaction.id, err: error },
			'❌ Unexpected error in handleInteraction',
		);
		return false;
	}
}

/**
 * Low-level polymorphic dispatch utility for sending interaction replies.
 *
 * Automatically inspects `interaction.replied` and `interaction.deferred`:
 * - If already replied or deferred: executes `interaction.editReply(...)`.
 * - If untouched: executes `interaction.reply({ ..., withResponse: true })`.
 *
 * Use this helper in standalone contexts outside `handleInteraction` (e.g. event listeners,
 * confirmation collectors, or preflight permission guards).
 *
 * @param interaction The Discord interaction to respond to.
 * @param content The response content, embeds, or options.
 * @returns Promise resolving to the sent or edited Discord `Message`.
 */
export function replyOrEdit(
	interaction: RepliableInteraction | CommandInteraction,
	content: ResponsePayload,
): Promise<Message> {
	if (interaction.replied || interaction.deferred) {
		return interaction.editReply(
			content as InteractionEditReplyOptions,
		) as Promise<Message>;
	}

	if (typeof content === 'string') {
		return interaction.reply({
			content,
			withResponse: true,
		}) as unknown as Promise<Message>;
	}

	const rawOptions = content as ExtendedInteractionReplyOptions;
	const options: InteractionReplyOptions = {
		...rawOptions,
		withResponse: true,
	};

	if (rawOptions.ephemeral && !options.flags) {
		options.flags = MessageFlags.Ephemeral;
	}

	return interaction.reply(options) as unknown as Promise<Message>;
}

/**
 * Sends a public message to the text channel where the interaction occurred.
 * Fails gracefully without throwing errors if the channel doesn't support sending messages or lacks permissions.
 *
 * @param interaction The Discord interaction.
 * @param options Content or message options to send.
 * @returns Promise resolving to the sent Message or null if failed/unsupported.
 */
export async function sendPublicAnnouncement(
	interaction: RepliableInteraction | CommandInteraction,
	options: string | MessagePayload | InteractionReplyOptions,
): Promise<Message | null> {
	try {
		const channel = interaction.channel;
		if (channel && 'send' in channel && typeof channel.send === 'function') {
			return await channel.send(options as Parameters<typeof channel.send>[0]);
		}
	} catch (err) {
		logger.warn(
			{ interactionId: interaction.id, err },
			'⚠️ Failed to send public announcement to channel',
		);
	}
	return null;
}
