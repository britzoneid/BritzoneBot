import type {
	CommandInteraction,
	RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import helpCommand, { HELP_GUIDE_TEXT } from '@/commands/utility/help.js';
import type { SlashCommand } from '@/types/index.js';

describe('Help Command (/help)', () => {
	it('defines the slash command data properly', () => {
		const json =
			helpCommand.data.toJSON() as RESTPostAPIChatInputApplicationCommandsJSONBody;
		expect(json.name).toBe('help');
		expect(json.description).toBe('Displays the quick guide for Bot Managers');
	});

	it('provides a guide that fits within Discord message limits (2000 chars)', () => {
		expect(HELP_GUIDE_TEXT.length).toBeGreaterThan(0);
		expect(HELP_GUIDE_TEXT.length).toBeLessThanOrEqual(2000);
		expect(HELP_GUIDE_TEXT).toContain('/breakout create');
		expect(HELP_GUIDE_TEXT).toContain('/breakout distribute');
		expect(HELP_GUIDE_TEXT).toContain('/breakout timer');
		expect(HELP_GUIDE_TEXT).toContain('/breakout broadcast');
		expect(HELP_GUIDE_TEXT).toContain('/breakout recall');
	});

	it('sends an ephemeral reply with the help guide text upon execution', async () => {
		const replyMock = vi.fn().mockResolvedValue({});
		const mockInteraction = {
			id: 'interaction-help-1',
			replied: false,
			deferred: false,
			reply: replyMock,
		} as unknown as CommandInteraction;

		const slashCmd = helpCommand as SlashCommand;
		await slashCmd.execute(mockInteraction);

		expect(replyMock).toHaveBeenCalledWith({
			content: HELP_GUIDE_TEXT,
			flags: MessageFlags.Ephemeral,
			withResponse: true,
		});
	});
});
