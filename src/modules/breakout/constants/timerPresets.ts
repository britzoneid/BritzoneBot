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
 * Otherwise, dynamic points (halfway, wrapup, final call) are calculated.
 */
export function getTimerSchedule(totalMinutes: number): number[] {
	if (totalMinutes in FGD_TIMER_PRESETS) {
		return FGD_TIMER_PRESETS[totalMinutes as PresetDuration];
	}

	const thresholds = new Set<number>();

	// 1. Halfway mark (~50% elapsed)
	const halfway = Math.round(totalMinutes * 0.5);
	if (halfway > 0 && halfway < totalMinutes) {
		thresholds.add(halfway);
	}

	// 2. Wrap-up mark (~25% remaining) if totalMinutes >= 20
	if (totalMinutes >= 20) {
		const wrapup = Math.round(totalMinutes * 0.25);
		if (wrapup > 0 && wrapup < totalMinutes) {
			thresholds.add(wrapup);
		}
	}

	// 3. Final call (~10% remaining or 3-5 min)
	let finalCall = 5;
	if (totalMinutes <= 10 && totalMinutes > 5) {
		finalCall = 3;
	} else if (totalMinutes <= 5) {
		finalCall = Math.max(1, Math.floor(totalMinutes / 2));
	}
	if (finalCall > 0 && finalCall < totalMinutes) {
		thresholds.add(finalCall);
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
