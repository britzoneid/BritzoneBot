import {
	type ChatInputCommandInteraction,
	GuildMember,
	PermissionsBitField,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import command from '@/commands/main/moveAllAudience.js';
import { confirmAction } from '@/lib/discord/confirm.js';
import { moveUser } from '@/lib/discord/member.js';
import type { SlashCommand } from '@/types/command.js';

vi.mock('@/lib/discord/confirm.js', () => ({ confirmAction: vi.fn() }));
vi.mock('@/lib/discord/member.js', () => ({ moveUser: vi.fn() }));

function setup() {
	const members = ['Alice', 'Bob'].map((name) => ({
		id: name,
		user: { id: name, tag: name },
	}));
	const source = {
		id: 'source',
		name: 'Source',
		members: new Map(members.map((member) => [member.id, member])),
		isVoiceBased: () => true,
		permissionsFor: vi.fn(() => ({ has: (_perm: bigint): boolean => true })),
	};
	const destination = {
		...source,
		id: 'destination',
		name: 'Destination',
		permissionsFor: vi.fn(() => ({ has: (_perm: bigint): boolean => true })),
	};
	const guild = { ownerId: 'owner', members: { me: {} } };
	const member = {
		id: 'owner',
		guild,
		permissions: { has: () => true },
	};
	Object.setPrototypeOf(member, GuildMember.prototype);
	const interaction = {
		id: 'move-interaction',
		guildId: 'guild',
		guild,
		member,
		replied: false,
		deferred: false,
		options: {
			getChannel: (name: string) => (name === 'source' ? source : destination),
		},
		deferReply: vi.fn(async () => {
			interaction.deferred = true;
		}),
		editReply: vi.fn().mockResolvedValue({}),
	};
	return { source, destination, interaction };
}

async function execute(interaction: ReturnType<typeof setup>['interaction']) {
	await (command as SlashCommand).execute(
		interaction as unknown as ChatInputCommandInteraction,
	);
}

describe('/move-all-audience permission and failure reporting', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(confirmAction).mockImplementation(async ({ onConfirm }) => {
			await onConfirm();
			return true;
		});
	});

	it('reports both endpoint permission failures before asking for confirmation', async () => {
		const { source, destination, interaction } = setup();
		source.permissionsFor.mockReturnValue({
			has: (perm) => perm !== PermissionsBitField.Flags.MoveMembers,
		});
		destination.permissionsFor.mockReturnValue({
			has: (perm) => perm !== PermissionsBitField.Flags.Connect,
		});

		await execute(interaction);

		const reply = interaction.editReply.mock.calls[0]?.[0];
		const content = typeof reply === 'string' ? reply : reply.content;
		expect(content).toContain('**Move Members** in voice channel Source');
		expect(content).toContain('**Connect** in voice channel Destination');
		expect(confirmAction).not.toHaveBeenCalled();
		expect(moveUser).not.toHaveBeenCalled();
	});

	it('continues after a failed move and includes its reason in the summary', async () => {
		const { interaction, destination } = setup();
		vi.mocked(moveUser).mockRejectedValueOnce(new Error('Missing Permissions'));

		await execute(interaction);

		expect(moveUser).toHaveBeenCalledTimes(2);
		expect(moveUser).toHaveBeenLastCalledWith(
			expect.objectContaining({ id: 'Bob' }),
			destination,
		);
		const content = interaction.editReply.mock.calls[0]?.[0].content;
		expect(content).toContain('Moved 1/2 member(s)');
		expect(content).toContain('Alice: Missing Permissions');
	});

	it('bounds long failure details while preserving the result count', async () => {
		const { interaction } = setup();
		vi.mocked(moveUser).mockRejectedValue(
			new Error('Missing Permissions '.repeat(200)),
		);

		await execute(interaction);

		const content = interaction.editReply.mock.calls[0]?.[0].content;
		expect(content.length).toBeLessThanOrEqual(2000);
		expect(content).toContain('Moved 0/2 member(s)');
		expect(content).toContain('Alice: Missing Permissions');
		expect(content).toContain('Additional failure details omitted.');
	});
});
