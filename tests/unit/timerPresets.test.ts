import { describe, expect, it } from 'vitest';
import {
	FGD_TIMER_PRESETS,
	formatReminderMessage,
	formatScheduleSummary,
	getTimerSchedule,
} from '@/modules/breakout/constants/timerPresets.js';

describe('timerPresets', () => {
	describe('FGD_TIMER_PRESETS lookup table', () => {
		it('contains defined reminder thresholds for 30, 45, 60, and 90 minute presets', () => {
			expect(FGD_TIMER_PRESETS[30]).toEqual([15, 5]);
			expect(FGD_TIMER_PRESETS[45]).toEqual([22, 10, 3]);
			expect(FGD_TIMER_PRESETS[60]).toEqual([30, 15, 5]);
			expect(FGD_TIMER_PRESETS[90]).toEqual([45, 20, 5]);
		});
	});

	describe('formatReminderMessage', () => {
		it('generates concise reminder messages for participants', () => {
			expect(formatReminderMessage(15)).toBe(
				'⏱️ **15 minutes remaining** in this breakout session.',
			);
			expect(formatReminderMessage(1)).toBe(
				'⏱️ **1 minute remaining** in this breakout session.',
			);
		});
	});

	describe('getTimerSchedule', () => {
		it('returns exact preset schedule when totalMinutes matches preset', () => {
			const schedule45 = getTimerSchedule(45);
			expect(schedule45).toEqual(FGD_TIMER_PRESETS[45]);
		});

		it('calculates clean dynamic thresholds for custom durations', () => {
			// For a custom 40 minute session: 20m, 10m, 5m
			const schedule40 = getTimerSchedule(40);
			expect(schedule40).toEqual([20, 10, 5]);

			// For a custom 15 minute session: 8m, 5m
			const schedule15 = getTimerSchedule(15);
			expect(schedule15).toEqual([8, 5]);
		});
	});

	describe('formatScheduleSummary', () => {
		it('formats reminder schedule summary correctly', () => {
			const schedule = getTimerSchedule(45);
			const summary = formatScheduleSummary(schedule);
			expect(summary).toBe('Reminders scheduled at 22m, 10m, 3m remaining.');
		});

		it('handles empty schedules gracefully', () => {
			expect(formatScheduleSummary([])).toBe(
				'No intermediate reminders scheduled.',
			);
		});
	});
});
