/** Small pure helpers for the hand-rolled SVG signup chart. */

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartScale {
  max: number;
  step: number;
  ticks: number[];
}

/**
 * Pick an integer y-axis maximum and evenly spaced ticks. Always leaves room
 * for zero, and never produces fractional signup counts.
 */
export function niceScale(maxCount: number, tickCount = 4): ChartScale {
  const safeMax = Math.max(0, Math.ceil(maxCount || 0));
  const rawStep = Math.max(1, safeMax / Math.max(1, tickCount));
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  const step = Math.max(1, niceResidual * magnitude);
  return {
    max: step * tickCount,
    step,
    ticks: Array.from({ length: tickCount + 1 }, (_, index) => index * step),
  };
}

/**
 * Parse an ISO `YYYY-MM-DD` as a *local* date. `new Date('2026-10-12')`
 * parses as UTC and can display the previous day in western timezones.
 */
export function parseIsoDay(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function formatChartDay(iso: string): string {
  const date = parseIsoDay(iso);
  if (!date) return iso;
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

export function formatChartDayLong(iso: string): string {
  const date = parseIsoDay(iso);
  if (!date) return iso;
  return date.toLocaleDateString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Monotone cubic (Fritsch–Carlson) path through the points. Monotone means
 * the curve never dips below zero between two non-negative counts, unlike a
 * plain Catmull-Rom spline.
 */
export function smoothPath(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const only = points[0]!;
    return `M ${only.x} ${only.y}`;
  }

  const n = points.length;
  const dx = new Array<number>(n - 1);
  const slopes = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i += 1) {
    const current = points[i]!;
    const next = points[i + 1]!;
    dx[i] = next.x - current.x;
    slopes[i] = dx[i] === 0 ? 0 : (next.y - current.y) / dx[i]!;
  }

  const tangents = new Array<number>(n);
  tangents[0] = slopes[0]!;
  tangents[n - 1] = slopes[n - 2]!;
  for (let i = 1; i < n - 1; i += 1) {
    const previous = slopes[i - 1]!;
    const current = slopes[i]!;
    if (previous === 0 || current === 0 || Math.sign(previous) !== Math.sign(current)) {
      tangents[i] = 0;
    } else {
      const w1 = 2 * dx[i]! + dx[i - 1]!;
      const w2 = dx[i]! + 2 * dx[i - 1]!;
      tangents[i] = (w1 + w2) / (w1 / previous + w2 / current);
    }
  }

  const first = points[0]!;
  let path = `M ${first.x} ${first.y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const current = points[i]!;
    const next = points[i + 1]!;
    const step = dx[i]!;
    const x1 = current.x + step / 3;
    const y1 = current.y + (tangents[i]! * step) / 3;
    const x2 = next.x - step / 3;
    const y2 = next.y - (tangents[i + 1]! * step) / 3;
    path += ` C ${x1} ${y1}, ${x2} ${y2}, ${next.x} ${next.y}`;
  }
  return path;
}

/** Closed area under the line, down to `baselineY`. */
export function areaPath(points: ChartPoint[], baselineY: number): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${smoothPath(points)} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

/** Up to `maxLabels` evenly spaced indexes, always including first and last. */
export function pickLabelIndices(length: number, maxLabels = 7): number[] {
  if (length <= 0) return [];
  if (length <= maxLabels) return Array.from({ length }, (_, index) => index);
  const step = (length - 1) / (maxLabels - 1);
  const indices = new Set<number>();
  for (let i = 0; i < maxLabels; i += 1) indices.add(Math.round(i * step));
  return [...indices].sort((a, b) => a - b);
}
