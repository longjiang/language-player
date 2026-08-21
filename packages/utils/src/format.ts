/**
 * Shared formatting utilities — works in browser, React Native, and Node.
 */

/** Format seconds → "MM:SS" or "H:MM:SS". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');

  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/** Format a number with locale-aware separators (e.g., 1,234,567). */
export function formatNumber(n: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale).format(n);
}

/** Relative time (e.g., "2 hours ago", "just now"). */
export function formatRelativeDate(date: Date | string, now: Date = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`;
  return `${Math.floor(diffDay / 365)}y ago`;
}

export type ReviewIntervalUnit = 'minutes' | 'hours' | 'days';

/** Return a rounded-up interval suitable for a "next review in …" label. */
export function getNextReviewInterval(
  dueMs: number,
  now = Date.now(),
): { value: number; unit: ReviewIntervalUnit } {
  const minutes = Math.max(1, Math.ceil((dueMs - now) / 60_000));
  if (minutes < 60) return { value: minutes, unit: 'minutes' };

  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return { value: hours, unit: 'hours' };

  return { value: Math.ceil(hours / 24), unit: 'days' };
}

/** Locale-aware "next review" label: today/tomorrow include the time, later
 *  dates fall back to a plain date.
 *
 *  Hermes (React Native) has no `Intl.RelativeTimeFormat`, so the near-day
 *  branch falls back to a manual label — same capability-check pattern as
 *  sentence.ts's `Intl.Segmenter` guard. Every Intl call here is guarded so
 *  the label can never throw on any runtime. */
export function formatNextDueLabel(
  dueMs: number,
  locale = 'en',
  now: Date = new Date(),
): string {
  if (!Number.isFinite(dueMs)) return '';
  const due = new Date(dueMs);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const dayDiff = Math.round((startDue.getTime() - startToday.getTime()) / 86_400_000);

  // Time — Intl.DateTimeFormat exists in Hermes (basic), but guard anyway so
  // no runtime can make this label throw.
  const time = (() => {
    try {
      return new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(due);
    } catch {
      return `${pad2(due.getHours())}:${pad2(due.getMinutes())}`;
    }
  })();

  if (dayDiff >= -1 && dayDiff <= 1) {
    const hasRelative =
      typeof Intl !== 'undefined' &&
      typeof (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat === 'function';
    if (hasRelative) {
      try {
        const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(dayDiff, 'day');
        return `${relative} ${time}`;
      } catch {
        // fall through to the manual label
      }
    }
    const day = dayDiff === -1 ? 'yesterday' : dayDiff === 1 ? 'tomorrow' : 'today';
    return `${day} ${time}`;
  }
  try {
    return due.toLocaleDateString(locale);
  } catch {
    return `${due.getFullYear()}-${pad2(due.getMonth() + 1)}-${pad2(due.getDate())}`;
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
