export interface ReminderThreshold {
	/** Remaining time in minutes when this reminder should trigger */
	remainingMinutes: number;
	/** Label or tag for log/display purposes */
	label: 'halfway' | 'wrapup' | 'final' | 'custom';
	/** Custom message string */
	message: string;
}

export type PresetDuration = 30 | 45 | 60 | 90;

/**
 * Single source of truth lookup table for FGD session timer reminder presets.
 * Easy to inspect and modify as needed.
 */
export const FGD_TIMER_PRESETS: Record<PresetDuration, ReminderThreshold[]> = {
	30: [
		{
			remainingMinutes: 15,
			label: 'halfway',
			message:
				'⏱️ **15 minutes remaining** (Halfway mark) in this breakout session.',
		},
		{
			remainingMinutes: 5,
			label: 'final',
			message: '⏱️ **5 minutes remaining** in this breakout session.',
		},
	],
	45: [
		{
			remainingMinutes: 22,
			label: 'halfway',
			message:
				'⏱️ **22 minutes remaining** (Halfway mark) in this breakout session.',
		},
		{
			remainingMinutes: 10,
			label: 'wrapup',
			message: '⏱️ **10 minutes remaining** in this breakout session.',
		},
		{
			remainingMinutes: 3,
			label: 'final',
			message: '⏱️ **3 minutes remaining** in this breakout session.',
		},
	],
	60: [
		{
			remainingMinutes: 30,
			label: 'halfway',
			message:
				'⏱️ **30 minutes remaining** (Halfway mark) in this breakout session.',
		},
		{
			remainingMinutes: 15,
			label: 'wrapup',
			message: '⏱️ **15 minutes remaining** in this breakout session.',
		},
		{
			remainingMinutes: 5,
			label: 'final',
			message: '⏱️ **5 minutes remaining** in this breakout session.',
		},
	],
	90: [
		{
			remainingMinutes: 45,
			label: 'halfway',
			message:
				'⏱️ **45 minutes remaining** (Halfway mark) in this breakout session.',
		},
		{
			remainingMinutes: 20,
			label: 'wrapup',
			message: '⏱️ **20 minutes remaining** in this breakout session.',
		},
		{
			remainingMinutes: 5,
			label: 'final',
			message: '⏱️ **5 minutes remaining** in this breakout session.',
		},
	],
};

/**
 * Get reminder schedule for a given duration (in minutes).
 * If totalMinutes matches a preset, the exact tuned lookup schedule is returned.
 * Otherwise, dynamic points (halfway, wrapup, final) are calculated and rounded to clean minutes.
 */
export function getTimerSchedule(totalMinutes: number): ReminderThreshold[] {
	if (totalMinutes in FGD_TIMER_PRESETS) {
		return FGD_TIMER_PRESETS[totalMinutes as PresetDuration];
	}

	// Dynamic calculation for custom durations
	const reminders: ReminderThreshold[] = [];

	// 1. Halfway mark (~50% elapsed)
	const halfway = Math.round(totalMinutes * 0.5);
	if (halfway > 0 && halfway < totalMinutes) {
		reminders.push({
			remainingMinutes: halfway,
			label: 'halfway',
			message: `⏱️ **${halfway} minutes remaining** (Halfway mark) in this breakout session.`,
		});
	}

	// 2. Wrap-up mark (~25% remaining) if totalMinutes >= 20
	if (totalMinutes >= 20) {
		const wrapup = Math.round(totalMinutes * 0.25);
		if (
			wrapup > 0 &&
			wrapup < totalMinutes &&
			!reminders.some((r) => r.remainingMinutes === wrapup)
		) {
			reminders.push({
				remainingMinutes: wrapup,
				label: 'wrapup',
				message: `⏱️ **${wrapup} minutes remaining** in this breakout session.`,
			});
		}
	}

	// 3. Final call (~10% remaining or 3-5 min)
	let finalCall = 5;
	if (totalMinutes <= 10 && totalMinutes > 5) {
		finalCall = 3;
	} else if (totalMinutes <= 5) {
		finalCall = Math.max(1, Math.floor(totalMinutes / 2));
	}
	if (
		finalCall > 0 &&
		finalCall < totalMinutes &&
		!reminders.some((r) => r.remainingMinutes === finalCall)
	) {
		reminders.push({
			remainingMinutes: finalCall,
			label: 'final',
			message: `⏱️ **${finalCall} minutes remaining** in this breakout session.`,
		});
	}

	// Sort descending by remainingMinutes (earliest reminder first)
	return reminders.sort((a, b) => b.remainingMinutes - a.remainingMinutes);
}

/**
 * Format schedule human readable summary for interaction responses
 */
export function formatScheduleSummary(schedule: ReminderThreshold[]): string {
	if (schedule.length === 0) return 'No intermediate reminders scheduled.';

	const parts = schedule.map((r) => {
		if (r.label === 'halfway') return `${r.remainingMinutes}m (Halfway)`;
		return `${r.remainingMinutes}m`;
	});

	return `Reminders scheduled at ${parts.join(', ')} remaining.`;
}
