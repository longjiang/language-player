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

/** Locale-aware "next review" label: today/tomorrow include the time, later
 *  dates fall back to a plain date. */
export function formatNextDueLabel(
  dueMs: number,
  locale = 'en',
  now: Date = new Date(),
): string {
  const due = new Date(dueMs);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const dayDiff = Math.round((startDue.getTime() - startToday.getTime()) / 86_400_000);
  if (dayDiff >= -1 && dayDiff <= 1) {
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(dayDiff, 'day');
    const time = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(due);
    return `${relative} ${time}`;
  }
  return due.toLocaleDateString(locale);
}

/** Temporary debug helper: UTC, local, and the runtime timezone. */
export function formatDueDebug(dueMs: number): string {
  const due = new Date(dueMs);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `utc=${due.toISOString()} local=${due.toLocaleString()} tz=${tz}`;
}
