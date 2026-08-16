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

		// Truncate room list if it would exceed Discord's character limit
		// Reserve ~500 chars for header/footer, leave ~1500 for room details
		const MAX_ROOM_DETAILS_LENGTH = 1500;
		let roomListText = roomDetails.join(', ');
		let truncated = false;

		if (roomListText.length > MAX_ROOM_DETAILS_LENGTH) {
			// Iteratively include rooms until we exceed the limit
			const truncatedDetails: string[] = [];
			let currentLength = 0;
			for (const detail of roomDetails) {
				const newLength = currentLength + detail.length + (truncatedDetails.length > 0 ? 2 : 0); // +2 for ", "
				if (newLength > MAX_ROOM_DETAILS_LENGTH) {
					truncated = true;
					break;
				}
				truncatedDetails.push(detail);
				currentLength = newLength;
			}
			roomListText = truncatedDetails.join(', ');
		}

		const summaryLine = `• **Total Rooms:** ${breakoutRooms.length} (${totalMembers} ${totalMembers === 1 ? 'member' : 'members'} total)`;
		const truncationNote = truncated ? ` *(showing ${roomListText.split(',').length}/${breakoutRooms.length} rooms)*` : '';
		roomsText = `${roomListText}${truncationNote}\n${summaryLine}`;
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
