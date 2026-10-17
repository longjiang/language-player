/**
 * Typed client for the SPEC-100 signup analytics route.
 *
 * Uses `authenticatedFetch`, so the Supabase access token mirrored by
 * `SessionTokenMirror` is attached and Flask's blueprint-level admin guard
 * can verify the `app_metadata.is_admin` claim.
 */

import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { log, logerr } from '@/lib/logger';
import type { SignupAnalytics, SignupRange } from '@/types/analytics';

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || data?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * The admin's IANA timezone. The backend buckets days in this zone so a
 * signup at 11pm local lands on the local day, not the UTC day.
 */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function fetchSignupAnalytics(
  range: SignupRange,
  timezone: string,
  signal?: AbortSignal,
): Promise<SignupAnalytics> {
  const params = new URLSearchParams({ range, tz: timezone });
  const url = `${PYTHON_API_URL}/admin/analytics/signups?${params.toString()}`;
  log('signup analytics request', { range, timezone });

  const res = await authenticatedFetch(url, { signal });
  if (!res.ok) {
    const message = await readError(res);
    logerr('signup analytics failed', { range, timezone, status: res.status, message });
    throw new Error(message || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as SignupAnalytics;
  log('signup analytics response', {
    range: data.range,
    timezone: data.timezone,
    days: data.days?.length ?? 0,
    total: data.total,
  });
  return data;
}
