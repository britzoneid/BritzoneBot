import type { CommandInteraction, RepliableInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { handleInteraction, replyOrEdit } from '@/lib/discord/response.js';

describe('Discord Response Utilities (response.ts)', () => {
	describe('handleInteraction', () => {
		it('executes handler successfully when deferReply is false', async () => {
			const mockInteraction = {
				id: 'int-1',
				replied: false,
				deferred: false,
			} as unknown as RepliableInteraction;

			const mockHandler = vi.fn().mockResolvedValue(undefined);

			const success = await handleInteraction(mockInteraction, mockHandler);

			expect(success).toBe(true);
			expect(mockHandler).toHaveBeenCalledOnce();
		});

		it('defers reply when deferReply option is true', async () => {
			const deferReplyMock = vi.fn().mockResolvedValue(undefined);
			const mockInteraction = {
				id: 'int-1',
				replied: false,
				deferred: false,
				deferReply: deferReplyMock,
			} as unknown as RepliableInteraction;

			const mockHandler = vi.fn().mockResolvedValue(undefined);

			const success = await handleInteraction(mockInteraction, mockHandler, {
				deferReply: true,
			});

			expect(deferReplyMock).toHaveBeenCalledOnce();
			expect(mockHandler).toHaveBeenCalledOnce();
			expect(success).toBe(true);
		});

		it('handles expired interaction error (code 10062) gracefully', async () => {
			const expiredError = new Error('Unknown Interaction');
			(expiredError as Error & { code: number }).code = 10062;

			const mockInteraction = {
				id: 'int-1',
				replied: false,
				deferred: false,
				deferReply: vi.fn().mockRejectedValue(expiredError),
			} as unknown as RepliableInteraction;

			const mockHandler = vi.fn();

			const success = await handleInteraction(mockInteraction, mockHandler, {
				deferReply: true,
			});

			expect(success).toBe(false);
			expect(mockHandler).not.toHaveBeenCalled();
		});

		it('returns false when handler throws an uncaught error', async () => {
			const mockInteraction = {
				id: 'int-1',
				replied: false,
				deferred: false,
			} as unknown as RepliableInteraction;

			const mockHandler = vi
				.fn()
				.mockRejectedValue(new Error('Handler failed'));

			const success = await handleInteraction(mockInteraction, mockHandler);

			expect(success).toBe(false);
		});
	});

	describe('replyOrEdit', () => {
		it('calls editReply when interaction is already replied', async () => {
			const editReplyMock = vi.fn().mockResolvedValue({ id: 'msg-1' });
			const replyMock = vi.fn();

			const mockInteraction = {
				replied: true,
				deferred: false,
				editReply: editReplyMock,
				reply: replyMock,
			} as unknown as CommandInteraction;

			await replyOrEdit(mockInteraction, 'Hello World');

			expect(editReplyMock).toHaveBeenCalledWith('Hello World');
			expect(replyMock).not.toHaveBeenCalled();
		});

		it('calls editReply when interaction is deferred', async () => {
			const editReplyMock = vi.fn().mockResolvedValue({ id: 'msg-1' });
			const replyMock = vi.fn();

			const mockInteraction = {
				replied: false,
				deferred: true,
				editReply: editReplyMock,
				reply: replyMock,
			} as unknown as CommandInteraction;

			await replyOrEdit(mockInteraction, { content: 'Deferred response' });

			expect(editReplyMock).toHaveBeenCalledWith({
				content: 'Deferred response',
			});
			expect(replyMock).not.toHaveBeenCalled();
		});

		it('calls reply with withResponse: true when interaction is fresh', async () => {
			const replyMock = vi.fn().mockResolvedValue({ id: 'msg-1' });
			const editReplyMock = vi.fn();

			const mockInteraction = {
				replied: false,
				deferred: false,
				reply: replyMock,
				editReply: editReplyMock,
			} as unknown as CommandInteraction;

			await replyOrEdit(mockInteraction, 'Fresh response');

			expect(replyMock).toHaveBeenCalledWith({
				content: 'Fresh response',
				withResponse: true,
			});
			expect(editReplyMock).not.toHaveBeenCalled();
		});
	});
});
