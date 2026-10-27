import { getRequestConfig } from 'next-intl/server';
import { SUPPORTED_L1S } from '@langplayer/shared';
import { deepMerge } from '@langplayer/utils';

type Messages = Record<string, unknown>;

/** Global fallback used when no request-specific time zone is available. */
const DEFAULT_TIME_ZONE = 'America/Vancouver';

/**
 * The locale comes from the URL, never from the request.
 *
 * `/[l1]/[l2]/...` already carries the UI language in its first segment, and
 * the layouts owning that segment call `setRequestLocale(l1)` before asking for
 * messages. Reading it here from `headers()`/`cookies()` instead is what made
 * every route a request-time render — one `cookies()` call anywhere in the tree
 * opts the whole subtree out of prerendering, with a green build and no warning
 * (measured: SPEC-108 Q1). Removing it is what lets the app shell be cached at
 * the edge (SPEC-108 Phase 2).
 *
 * Public routes (landing, auth, docs) have no language segment; their layout
 * reads `NEXT_LOCALE` and calls `setRequestLocale()` itself, so they stay
 * dynamic — correctly, because the landing page varies by `Accept-Language`.
 *
 * The time zone is a constant for the same reason: Netlify sets neither
 * `x-vercel-ip-timezone` nor `x-timezone`, so the header read always fell
 * through to this value anyway.
 */
export default getRequestConfig(async ({ requestLocale }): Promise<any> => {
  const requested = await requestLocale;
  const locale = requested && SUPPORTED_L1S.includes(requested as any) ? requested : 'en';

  // Load from shared packages/shared/locales/ directory
  const enMessages = (await import(`../../../packages/shared/locales/en.json`)).default as Messages;
  if (locale === 'en') {
    return { locale, timeZone: DEFAULT_TIME_ZONE, messages: enMessages };
  }

  const localeMessages = (await import(`../../../packages/shared/locales/${locale}.json`)).default as Messages;
  return { locale, timeZone: DEFAULT_TIME_ZONE, messages: deepMerge(enMessages, localeMessages) };
});
