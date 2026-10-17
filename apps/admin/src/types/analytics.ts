/**
 * Shapes returned by the SPEC-100 admin analytics endpoint
 * (`GET /admin/analytics/signups`).
 */

/** Range keys accepted by the backend (mirrored in `SIGNUP_RANGES`). */
export type SignupRange = 'last_7_days' | 'this_month' | 'this_year' | 'last_30_days' | 'all_time';

/** One day bucket. Dates are ISO `YYYY-MM-DD` in the requested timezone. */
export interface SignupDay {
  date: string;
  count: number;
}

export interface SignupAnalytics {
  range: SignupRange;
  /** The IANA timezone the days were bucketed in. */
  timezone: string;
  start: string;
  end: string;
  days: SignupDay[];
  total: number;
  averagePerDay: number;
  bestDay: SignupDay | null;
  /** True: Directus-imported accounts are excluded from every range. */
  excludesImportedUsers: boolean;
}

/** Display order for the range picker (matches the Teachable-style menu). */
export const SIGNUP_RANGES: { value: SignupRange; labelKey: string }[] = [
  { value: 'last_7_days', labelKey: 'range.last_7_days' },
  { value: 'this_month', labelKey: 'range.this_month' },
  { value: 'this_year', labelKey: 'range.this_year' },
  { value: 'last_30_days', labelKey: 'range.last_30_days' },
  { value: 'all_time', labelKey: 'range.all_time' },
];
