import { describe, expect, it } from 'vitest';
import { formatNextDueLabel, getNextReviewInterval } from './format';

const now = new Date(2026, 7, 16, 12, 0); // Aug 16 2026, noon

describe('formatNextDueLabel', () => {
  it('uses Intl.RelativeTimeFormat when available (browsers, Node)', () => {
    const label = formatNextDueLabel(new Date(2026, 7, 17, 9, 30).getTime(), 'en', now);
    expect(label).toContain('tomorrow');
  });

  it('falls back to a manual label without Intl.RelativeTimeFormat (Hermes)', () => {
    const saved = (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat;
    (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = undefined;
    try {
      const tomorrow = formatNextDueLabel(new Date(2026, 7, 17, 9, 30).getTime(), 'en', now);
      expect(tomorrow).toBe('tomorrow 9:30 AM');
      const today = formatNextDueLabel(new Date(2026, 7, 16, 15, 0).getTime(), 'en', now);
      expect(today).toBe('today 3:00 PM');
      const yesterday = formatNextDueLabel(new Date(2026, 7, 15, 23, 0).getTime(), 'en', now);
      expect(yesterday).toBe('yesterday 11:00 PM');
    } finally {
      (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = saved;
    }
  });

  it('never throws — the Hermes regression this guards', () => {
    const saved = (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat;
    (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = undefined;
    try {
      expect(() => formatNextDueLabel(new Date(2026, 7, 17, 9, 30).getTime(), 'en', now)).not.toThrow();
    } finally {
      (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = saved;
    }
  });

  it('returns empty string for invalid input (empty deck can pass undefined)', () => {
    expect(formatNextDueLabel(undefined as unknown as number, 'en', now)).toBe('');
    expect(formatNextDueLabel(NaN, 'en', now)).toBe('');
  });

  it('falls back to a plain date for far dates', () => {
    const label = formatNextDueLabel(new Date(2026, 9, 1, 9, 0).getTime(), 'en', now);
    expect(label).toMatch(/\d/);
  });
});

describe('getNextReviewInterval', () => {
  const base = new Date(2026, 7, 16, 12, 0).getTime();

  it('rounds short intervals up to minutes', () => {
    expect(getNextReviewInterval(base + 1, base)).toEqual({ value: 1, unit: 'minutes' });
    expect(getNextReviewInterval(base + 59 * 60_000, base)).toEqual({ value: 59, unit: 'minutes' });
  });

  it('switches to hours and days at the unit boundaries', () => {
    expect(getNextReviewInterval(base + 60 * 60_000, base)).toEqual({ value: 1, unit: 'hours' });
    expect(getNextReviewInterval(base + 23 * 60 * 60_000, base)).toEqual({ value: 23, unit: 'hours' });
    expect(getNextReviewInterval(base + 24 * 60 * 60_000, base)).toEqual({ value: 1, unit: 'days' });
  });

  it('never reports zero for an already-due timestamp', () => {
    expect(getNextReviewInterval(base - 1, base)).toEqual({ value: 1, unit: 'minutes' });
  });
});
