/**
 * Per-user, per-local-day review counter helpers (SPEC-066 Phase 4).
 *
 * The counter key must roll over at the local day boundary (Anki "next day
 * starts at", default 4 AM) even when the app stays open, so pages schedule
 * a refresh with `msUntilNextDay()`.
 */

import { dayKey } from './day-boundary';
export { msUntilNextDay } from './day-boundary';

/** Storage key for the free SRS review counter. */
export function dailyReviewCounterKey(
  userId: string,
  now: number = Date.now(),
  dayStartHour: number = 4,
): string {
  return `lpSrsReviewsDone:${userId}:${dayKey(now, dayStartHour)}`;
}
