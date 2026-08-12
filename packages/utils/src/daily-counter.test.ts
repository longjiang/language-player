import { describe, it, expect } from 'vitest';
import { dailyReviewCounterKey, msUntilNextUtcDay } from './daily-counter';

describe('daily-counter', () => {
  it('keys the counter by user id and UTC date', () => {
    const now = Date.parse('2026-08-11T23:59:59Z');
    expect(dailyReviewCounterKey('u1', now)).toBe('lpSrsReviewsDone:u1:2026-08-11');
    expect(dailyReviewCounterKey('u2', Date.parse('2026-08-12T00:00:00Z')))
      .toBe('lpSrsReviewsDone:u2:2026-08-12');
  });

  it('computes time to the next UTC boundary', () => {
    const now = Date.parse('2026-08-11T23:59:59Z');
    expect(msUntilNextUtcDay(now)).toBe(1000);
    const noon = Date.parse('2026-08-11T12:00:00Z');
    expect(msUntilNextUtcDay(noon)).toBe(12 * 60 * 60 * 1000);
    const boundary = Date.parse('2026-08-12T00:00:00Z');
    expect(msUntilNextUtcDay(boundary)).toBe(86_400_000);
  });
});
