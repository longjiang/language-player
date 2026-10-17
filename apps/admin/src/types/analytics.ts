/**
 * Shapes returned by the SPEC-100 admin analytics endpoint
 * (`GET /admin/analytics?metric=signups|revenue`).
 */

/** Metrics the analytics screen can plot. */
export type AnalyticsMetric = 'signups' | 'revenue';

/** Range keys accepted by the backend (mirrored in `SIGNUP_RANGES`). */
export type SignupRange = 'last_7_days' | 'this_month' | 'this_year' | 'last_30_days' | 'all_time';

/** One day bucket. Dates are ISO `YYYY-MM-DD` in the requested timezone. */
export interface AnalyticsPoint {
  date: string;
  /** Signups for the day, or estimated USD revenue for the day. */
  value: number;
  /** Transaction count (equal to `value` for signups). */
  count: number;
}

export interface AnalyticsSeries {
  metric: AnalyticsMetric;
  range: SignupRange;
  /** The IANA timezone the days were bucketed in. */
  timezone: string;
  start: string;
  end: string;
  days: AnalyticsPoint[];
  /** Total signups, or total estimated USD revenue. */
  total: number;
  averagePerDay: number;
  bestDay: AnalyticsPoint | null;
  /** True for signups: Directus-imported accounts are excluded. */
  excludesImportedUsers?: boolean;
}

/** Display order for the metric picker. */
export const ANALYTICS_METRICS: { value: AnalyticsMetric; labelKey: string }[] = [
  { value: 'signups', labelKey: 'label.new_signups' },
  { value: 'revenue', labelKey: 'label.revenue' },
];

/** Display order for the range picker (matches the Teachable-style menu). */
export const SIGNUP_RANGES: { value: SignupRange; labelKey: string }[] = [
  { value: 'last_7_days', labelKey: 'range.last_7_days' },
  { value: 'this_month', labelKey: 'range.this_month' },
  { value: 'this_year', labelKey: 'range.this_year' },
  { value: 'last_30_days', labelKey: 'range.last_30_days' },
  { value: 'all_time', labelKey: 'range.all_time' },
];
