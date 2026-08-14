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
 * Options for handleInteraction function
 */
export interface InteractionHandlerOptions {
	deferReply?: boolean;
	ephemeral?: boolean;
	deferTimeoutMs?: number;
	handlerTimeoutMs?: number;
	errorMessage?: string;
	notifyOnError?: boolean;
}

/**
 * Payload formats acceptable when sending replies or editing responses
 */
export type ResponsePayload =
	| string
	| InteractionReplyOptions
	| InteractionEditReplyOptions
	| MessagePayload;

/**
 * Unified context passed to interaction handlers providing ergonomic response methods
 * and preserving interaction lifecycle metadata.
 */
export interface InteractionContext<
	T extends RepliableInteraction | CommandInteraction =
		| RepliableInteraction
		| CommandInteraction,
> {
	/** The underlying Discord interaction instance */
	readonly interaction: T;
	/** Whether the interaction has been deferred */
	readonly isDeferred: boolean;
	/** Whether ephemeral responses are configured for this interaction */
	readonly isEphemeral: boolean;

	/**
	 * Replies to or edits the interaction response appropriately based on its state.
	 * Automatically applies the ephemeral setting if configured and not yet deferred.
	 */
	reply: (content: ResponsePayload) => Promise<Message>;

	/**
	 * Directly edits the original interaction response.
	 */
	editReply: (
		content: InteractionEditReplyOptions | MessagePayload | string,
	) => Promise<Message>;

	/**
	 * Sends a public message to the channel where the interaction occurred.
	 */
	sendPublic: (
		options: string | MessagePayload | InteractionReplyOptions,
	) => Promise<Message | null>;
}

/**
 * Handler callback receiving a unified interaction context
 */
export type InteractionHandler<
	T extends RepliableInteraction | CommandInteraction =
		| RepliableInteraction
		| CommandInteraction,
> = (ctx: InteractionContext<T>) => Promise<void>;

/**
 * Safely extract error code from an Error object
 * @param error The error to extract code from
 * @returns The error code if present, otherwise undefined
 */
function getErrorCode(error: Error): string | number | undefined {
	return 'code' in error
		? (error as Error & { code?: string | number }).code
		: undefined;
}

/**
 * Handles Discord interactions with built-in deferral, timeout protection, error handling,
 * and passes a unified InteractionContext to the handler.
 *
 * @param interaction The Discord interaction to handle
 * @param handler Async function that handles the interaction
 * @param options Options for handling the interaction
 * @returns boolean indicating success
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
 * Replies to an interaction appropriately based on its state (deferred or replied)
 * @param interaction The Discord interaction
 * @param content Content to send
 * @returns Promise resolving to the message or interaction response
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

	const options: InteractionReplyOptions =
		typeof content === 'string'
			? { content, withResponse: true }
			: { ...(content as InteractionReplyOptions), withResponse: true };

	return interaction.reply(options) as unknown as Promise<Message>;
}

/**
 * Sends a public message to the text channel where the interaction occurred.
 * Fails gracefully without throwing errors if the channel doesn't support sending messages or lacks permissions.
 *
 * @param interaction The Discord interaction
 * @param options Content or message options to send
 * @returns Promise resolving to the sent Message or null if failed/unsupported
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
