/**
 * Per-user, per-UTC-day review counter helpers (SPEC-066 Phase 4).
 *
 * The counter key must roll over at UTC midnight even when the app stays
 * open, so pages schedule a refresh with `msUntilNextUtcDay()`.
 */

/** Storage key for the free SRS review counter. */
export function dailyReviewCounterKey(
  userId: string,
  now: number = Date.now(),
): string {
  const day = new Date(now).toISOString().slice(0, 10);
  return `lpSrsReviewsDone:${userId}:${day}`;
}

/** Milliseconds from `now` until the next UTC day boundary. */
export function msUntilNextUtcDay(now: number = Date.now()): number {
  const d = new Date(now);
  const nextBoundary = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
  );
  return Math.max(1, nextBoundary - now);
}
