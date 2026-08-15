export type PresetDuration = 0.05 | 30 | 45 | 60 | 90;

/**
 * Single source of truth lookup table for FGD session timer reminder presets.
 * Maps session duration in minutes to an array of remaining minute thresholds.
 */
export const FGD_TIMER_PRESETS: Record<PresetDuration, number[]> = {
	0.05: [0.03, 0.015],
	30: [15, 5],
	45: [22, 10, 3],
	60: [30, 15, 5],
	90: [45, 20, 5],
};

/**
 * Generates a concise reminder message for participants.
 */
export function formatReminderMessage(remainingMinutes: number): string {
	const unit = remainingMinutes === 1 ? 'minute' : 'minutes';
	return `⏱️ **${remainingMinutes} ${unit} remaining** in this breakout session.`;
}

/**
 * Get reminder schedule thresholds for a given duration (in minutes).
 * If totalMinutes matches a preset, the exact tuned lookup schedule is returned.
 * For custom durations >= 30 minutes, reminders are scheduled at [min(30, 2/3 D), 10, 5].
 * Durations under 30 minutes (non-preset) return an empty schedule.
 */
export function getTimerSchedule(totalMinutes: number): number[] {
	if (totalMinutes in FGD_TIMER_PRESETS) {
		return FGD_TIMER_PRESETS[totalMinutes as PresetDuration];
	}

	if (totalMinutes < 30) {
		return [];
	}

	const thresholds = new Set<number>();
	const firstReminder = Math.min(30, Math.round((2 / 3) * totalMinutes));
	if (firstReminder > 0 && firstReminder < totalMinutes) {
		thresholds.add(firstReminder);
	}
	if (10 < totalMinutes) {
		thresholds.add(10);
	}
	if (5 < totalMinutes) {
		thresholds.add(5);
	}

	// Return sorted descending (earliest reminder first)
	return Array.from(thresholds).sort((a, b) => b - a);
}

/**
 * Format schedule human readable summary for interaction responses
 */
export function formatScheduleSummary(schedule: number[]): string {
	if (schedule.length === 0) return 'No intermediate reminders scheduled.';
	const parts = schedule.map((m) => `${m}m`);
	return `Reminders scheduled at ${parts.join(', ')} remaining.`;
}
