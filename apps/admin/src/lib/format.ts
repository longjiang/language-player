/** Small formatting helpers shared by the admin UI. */

export function formatDate(value: string | number | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatHours(hours: number | null | undefined): string {
  const h = Number(hours ?? 0);
  if (!h) return '0h';
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

export function formatSeconds(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(seconds ?? 0)));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function initials(firstName: string, lastName: string, email: string): string {
  const fromName = `${firstName}${lastName}`.trim();
  if (fromName) return fromName.slice(0, 2).toUpperCase();
  return (email || '?').slice(0, 2).toUpperCase();
}
