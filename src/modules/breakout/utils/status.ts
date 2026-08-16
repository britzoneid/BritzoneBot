import type { VoiceBasedChannel, VoiceChannel } from 'discord.js';
import { formatTimerStatus } from '@/modules/breakout/constants/timerPresets.js';
import type { TimerData } from '@/modules/breakout/state/state.js';

export interface BreakoutStatusParams {
	mainRoom?: VoiceBasedChannel;
	breakoutRooms: VoiceChannel[];
	timerData: TimerData | null;
	currentOperationType?: string;
	now?: number;
}

/**
 * Formats full breakout session status into a readable markdown response.
 */
export function formatBreakoutStatus({
	mainRoom,
	breakoutRooms,
	timerData,
	currentOperationType,
	now = Date.now(),
}: BreakoutStatusParams): string {
	const mainRoomText = mainRoom
		? `<#${mainRoom.id}> (${mainRoom.members?.size ?? 0} ${mainRoom.members?.size === 1 ? 'member' : 'members'})`
		: '*None configured*';

	let roomsText = '*No breakout rooms created*';
	if (breakoutRooms.length > 0) {
		let totalMembers = 0;
		const roomDetails = breakoutRooms.map((room) => {
			const memberCount = room.members?.size ?? 0;
			totalMembers += memberCount;
			return `<#${room.id}> (${memberCount})`;
		});
		roomsText = `${roomDetails.join(', ')}\n• **Total Rooms:** ${breakoutRooms.length} (${totalMembers} ${totalMembers === 1 ? 'member' : 'members'} total)`;
	}

	const lines: string[] = [
		'📊 **Breakout Session Status**',
		'',
		'🏢 **Rooms Configuration**',
		`• **Main Room:** ${mainRoomText}`,
		`• **Breakout Rooms:** ${roomsText}`,
	];

	if (currentOperationType) {
		lines.push(`• **Operation in Progress:** ⚠️ \`${currentOperationType}\``);
	}

	lines.push('');

	if (timerData) {
		lines.push(formatTimerStatus(timerData, now));
	} else {
		lines.push('⏱️ **Timer Status**', '• **Status:** ⚪ No active timer');
	}

	return lines.join('\n');
}
