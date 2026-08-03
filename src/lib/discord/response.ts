import type {
	CommandInteraction,
	InteractionEditReplyOptions,
	InteractionReplyOptions,
	Message,
	MessagePayload,
	RepliableInteraction,
} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { logger } from '../logger.js';

/**
 * Options for handleInteraction function
 */
interface InteractionHandlerOptions {
	deferReply?: boolean;
	ephemeral?: boolean;
	deferTimeoutMs?: number;
	handlerTimeoutMs?: number;
}

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
 * Handles Discord interactions with built-in error handling for expired interactions
 *
 * Wraps interaction handlers with deferReply support, timeout protection, and error handling.
 *
 * @param interaction The Discord interaction to handle
 * @param handler Async function that handles the interaction
 * @param options Options for handling the interaction
 * @returns boolean indicating success
 */
export async function handleInteraction(
	interaction: RepliableInteraction | CommandInteraction,
	handler: () => Promise<void>,
	options: InteractionHandlerOptions = {},
): Promise<boolean> {
	const {
		deferReply = false,
		ephemeral = false,
		deferTimeoutMs = 2500,
		handlerTimeoutMs = 15000,
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

		// Execute the handler function with timeout protection
		let handlerTimeoutId: ReturnType<typeof setTimeout> | undefined;
		try {
			const handlerPromise = handler();
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
	content:
		| string
		| InteractionReplyOptions
		| InteractionEditReplyOptions
		| MessagePayload,
): Promise<Message> {
	if (interaction.replied || interaction.deferred) {
		return interaction.editReply(content as InteractionEditReplyOptions);
	}

	const options: InteractionReplyOptions =
		typeof content === 'string'
			? { content, withResponse: true }
			: { ...(content as InteractionReplyOptions), withResponse: true };

	return interaction.reply(options) as unknown as Promise<Message>;
}
