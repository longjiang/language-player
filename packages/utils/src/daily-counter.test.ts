import { describe, it, expect } from 'vitest';
import { dailyReviewCounterKey, msUntilNextDay } from './daily-counter';
import { dayKey, localDayStartMs } from './day-boundary';

describe('daily-counter', () => {
  it('keys the counter by user id and local day', () => {
    const now = Date.parse('2026-06-15T12:00:00Z');
    const key = dailyReviewCounterKey('u1', now, 4);
    expect(key).toBe(`lpSrsReviewsDone:u1:${dayKey(now, 4)}`);
    const start = localDayStartMs(now, 4);
    expect(dailyReviewCounterKey('u1', start + 1, 4)).toBe(key);
    expect(dailyReviewCounterKey('u1', start - 1, 4)).not.toBe(key);
  });

  it('computes time to the next local boundary', () => {
    const start = localDayStartMs(Date.now(), 4);
    const until = msUntilNextDay(start, 4);
    expect(until).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000 - 1000);
    expect(until).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    expect(msUntilNextDay(start - 1, 4)).toBe(1);
  });
});
