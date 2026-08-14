import { describe, it, expect } from 'vitest';
import {
  clampDayStartHour,
  localDayStartMs,
  dayKey,
  msUntilNextDay,
  deviceTimezone,
} from './day-boundary';

describe('day-boundary', () => {
  const now = Date.parse('2026-06-15T12:00:00Z');

  it('clamps day-start hours into 0..23 (default 4)', () => {
    expect(clampDayStartHour(4)).toBe(4);
    expect(clampDayStartHour(24)).toBe(0);
    expect(clampDayStartHour(-1)).toBe(23);
    expect(clampDayStartHour(25)).toBe(1);
    expect(clampDayStartHour(NaN)).toBe(4);
  });

  it('returns a boundary at or before now', () => {
    expect(localDayStartMs(now, 0)).toBeLessThanOrEqual(now);
    expect(localDayStartMs(now, 4)).toBeLessThanOrEqual(now);
    expect(localDayStartMs(now, 23)).toBeLessThanOrEqual(now);
  });

  it('keys the local day containing now', () => {
    const start = localDayStartMs(now, 4);
    expect(dayKey(now, 4)).toBe(dayKey(start + 1, 4));
    expect(dayKey(start + 1, 4)).not.toBe(dayKey(start - 1, 4));
  });

  it('schedules the next local boundary', () => {
    const start = localDayStartMs(now, 4);
    const until = msUntilNextDay(start, 4);
    // A full day, allowing for DST transitions (23–25h).
    expect(until).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000 - 1000);
    expect(until).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    expect(msUntilNextDay(start - 1, 4)).toBe(1);
  });

  it('resolves a device timezone id', () => {
    expect(typeof deviceTimezone()).toBe('string');
    expect(deviceTimezone().length).toBeGreaterThan(0);
  });
});
