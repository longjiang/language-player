/**
 * Anki-style local day boundary helpers (SPEC-066).
 *
 * Anki's daily limits reset at "next day starts at" (default 4 AM) in the
 * user's local timezone, not at UTC midnight. These helpers compute the
 * same boundary for the new-card budget, the free-review counter, and the
 * page rollover timer.
 */

/** Clamp a day-start hour to an integer 0–23 (default 4, like Anki). */
export function clampDayStartHour(hour: number): number {
  const n = Math.floor(hour);
  if (!Number.isFinite(n)) return 4;
  return ((n % 24) + 24) % 24;
}

/**
 * Millisecond timestamp of the start of the local "day" containing `now`.
 *
 * The day starts at `dayStartHour` local wall time (default 4, like Anki).
 * A session from 11 PM to 1 AM therefore belongs to a single day, and the
 * boundary is computed with the device's local timezone (DST included).
 */
export function localDayStartMs(now: number, dayStartHour: number = 4): number {
  const hour = clampDayStartHour(dayStartHour);
  const d = new Date(now);
  const candidate = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    hour,
    0,
    0,
    0,
  ).getTime();
  return candidate > now
    ? new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() - 1,
        hour,
        0,
        0,
        0,
      ).getTime()
    : candidate;
}

/** Local `YYYY-MM-DD` label of the day containing `now`. */
export function dayKey(now: number, dayStartHour: number = 4): string {
  const d = new Date(localDayStartMs(now, dayStartHour));
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${date}`;
}

/** Milliseconds from `now` until the next local day boundary. */
export function msUntilNextDay(now: number, dayStartHour: number = 4): number {
  const hour = clampDayStartHour(dayStartHour);
  const start = localDayStartMs(now, hour);
  const d = new Date(start);
  const next = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + 1,
    hour,
    0,
    0,
    0,
  ).getTime();
  return Math.max(1, next - now);
}

/** IANA timezone id of the device (e.g. "America/Vancouver"); UTC fallback. */
export function deviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.length > 0 ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}
