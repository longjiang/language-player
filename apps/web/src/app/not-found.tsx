import { getMessages, getTimeZone, setRequestLocale } from 'next-intl/server';
import { LocaleProvider } from '@/providers/locale-provider';
import { NotFoundBody } from '@/components/layout/not-found-body';

/**
 * The global 404, for URLs that match no route at all.
 *
 * It is deliberately **static and English**. `app/not-found.tsx` is part of the
 * tree of *every* route, so a request-time API here (`cookies()`, `headers()`)
 * marks the entire app dynamic — a `cookies()` call in this file alone was
 * enough to keep all 60 routes out of the prerender cache (SPEC-108 Phase 2).
 *
 * Localized 404s still happen where users actually hit them: an unknown language
 * pair, video or channel renders `[l1]/[l2]/not-found.tsx`, which has the app's
 * locale provider above it. Only a top-level unmatched path (`/garbage`) falls
 * back to this English page.
 *
 * `setRequestLocale` is required even for English: without a cached locale,
 * next-intl falls back to reading `headers()`, which would reintroduce exactly
 * the dynamic rendering this file must avoid.
 */
export default async function NotFound() {
  setRequestLocale('en');
  const [messages, timeZone] = await Promise.all([
    getMessages({ locale: 'en' }),
    getTimeZone({ locale: 'en' }),
  ]);

  return (
    <LocaleProvider locale="en" messages={messages} timeZone={timeZone}>
      <NotFoundBody />
    </LocaleProvider>
  );
}
