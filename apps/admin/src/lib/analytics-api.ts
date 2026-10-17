/**
 * Typed client for the SPEC-100 analytics route.
 *
 * Uses `authenticatedFetch`, so the Supabase access token mirrored by
 * `SessionTokenMirror` is attached and Flask's blueprint-level admin guard
 * can verify the `app_metadata.is_admin` claim.
 */

import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { log, logerr } from '@/lib/logger';
import type { AnalyticsMetric, AnalyticsSeries, SignupRange } from '@/types/analytics';

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || data?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function fetchAnalytics(
  metric: AnalyticsMetric,
  range: SignupRange,
  timezone: string,
  signal?: AbortSignal,
): Promise<AnalyticsSeries> {
  const params = new URLSearchParams({ metric, range, tz: timezone });
  const url = `${PYTHON_API_URL}/admin/analytics?${params.toString()}`;
  log('analytics request', { metric, range, timezone });

  const res = await authenticatedFetch(url, { signal });
  if (!res.ok) {
    const message = await readError(res);
    logerr('analytics failed', {
      metric,
      range,
      timezone,
      status: res.status,
      message,
    });
    throw new Error(message || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as AnalyticsSeries;
  log('analytics response', {
    metric: data.metric,
    range: data.range,
    timezone: data.timezone,
    days: data.days?.length ?? 0,
    total: data.total,
  });
  return data;
}
