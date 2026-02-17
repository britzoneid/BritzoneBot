import type { CommandInteraction, RepliableInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';

/**
 * Options for handleInteraction function
 */
interface InteractionHandlerOptions {
	deferReply?: boolean;
	ephemeral?: boolean;
}

/**
 * Safely extract error code from an Error object
 * @param error The error to extract code from
 * @returns The error code if present, otherwise undefined
 */
function getErrorCode(error: Error): string | number | undefined {
	const errorObj = error as any; // Errors from different sources have code properties
	return errorObj.code;
}

/**
 * Handles Discord interactions with built-in error handling for expired interactions
 *
 * Wraps interaction handlers with deferReply support, timeout protection, and error handling.
 * It demonstrates proper TypeScript patterns for your codebase.
 *
 * @param interaction The Discord interaction to handle
 * @param handler Async function that handles the interaction
 * @param options Options for handling the interaction
 * @returns boolean indicating success
 *
 * @example
 * ```typescript
 * await handleInteraction(
 *   interaction,
 *   async () => {
 *     await interaction.reply('Pong!');
 *   },
 *   { deferReply: true, ephemeral: true }
 * );
 * ```
 */
async function handleInteraction(
	interaction: RepliableInteraction | CommandInteraction,
	handler: () => Promise<void>,
	options: InteractionHandlerOptions = {},
): Promise<boolean> {
	const { deferReply = false, ephemeral = false } = options;

	try {
		// If deferReply is true, try to defer the reply first
		if (deferReply && !interaction.replied && !interaction.deferred) {
			try {
				// Set a timeout to avoid getting stuck on network issues
				const deferPromise = interaction.deferReply(
					ephemeral ? { flags: MessageFlags.Ephemeral } : undefined,
				);
				const timeoutPromise = new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('Defer reply timeout')), 2500),
				);

				await Promise.race([deferPromise, timeoutPromise]);
				console.log(`🔄 Successfully deferred interaction ${interaction.id}`);
			} catch (deferError) {
				const error =
					deferError instanceof Error
						? deferError
						: new Error(String(deferError));
				const errorCode = getErrorCode(error);

				// If we can't defer, the interaction likely expired
				if (errorCode === 10062) {
					console.log(
						`⏱️ Interaction ${interaction.id} expired before deferring`,
					);
					return false;
				}

				// Handle network errors gracefully
				if (
					errorCode === 'EAI_AGAIN' ||
					error.message === 'Defer reply timeout'
				) {
					console.log(
						`🌐 Network issue while deferring interaction ${interaction.id}: ${error.message}`,
					);
					return false;
				}

				console.log(
					`❓ Unknown error while deferring interaction: ${error.message}`,
				);
				return false;
			}
		}

		// Execute the handler function with timeout protection
		try {
			const handlerPromise = handler();
			const timeoutPromise = new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Handler execution timeout')), 8000),
			);

			await Promise.race([handlerPromise, timeoutPromise]);
			return true;
		} catch (handlerError) {
			const error =
				handlerError instanceof Error
					? handlerError
					: new Error(String(handlerError));
			console.log(
				`❌ Handler error for interaction ${interaction.id}: ${error.message}`,
			);
			return false;
		}
	} catch (error) {
		console.log(
			`❌ Unexpected error in handleInteraction for interaction ${interaction.id}`,
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
	content: string | any,
): Promise<any> {
	return interaction.replied || interaction.deferred
		? interaction.editReply(content)
		: interaction.reply(content);
}

export default handleInteraction;
