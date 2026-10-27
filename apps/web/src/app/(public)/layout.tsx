import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { getMessages, getTimeZone, setRequestLocale } from 'next-intl/server';
import { SUPPORTED_L1S } from '@langplayer/shared';
import { LocaleProvider } from '@/providers/locale-provider';
import { PublicHeader } from '@/components/layout/public-header';
import { CookieConsent } from '@/components/consent/cookie-consent';

/**
 * The public half of the app: landing, auth, language selection, docs and the
 * pro-flow result pages. They share the slim `PublicHeader` instead of the app
 * `Header`, and they are the only routes whose locale is not in the URL.
 *
 * Reading `NEXT_LOCALE` here is deliberate and keeps these routes **dynamic** —
 * correct for `/`, which varies by `Accept-Language` and must never be served
 * from a shared cache. Keeping that read out of the root layout is what lets
 * `/[l1]/[l2]/*` be cached (SPEC-108 Phase 2).
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const raw = (await cookies()).get('NEXT_LOCALE')?.value ?? 'en';
  const locale = SUPPORTED_L1S.includes(raw as any) ? raw : 'en';
  setRequestLocale(locale);

  const [messages, timeZone] = await Promise.all([
    getMessages({ locale }),
    getTimeZone({ locale }),
  ]);

  return (
    <LocaleProvider locale={locale} messages={messages} timeZone={timeZone}>
      <PublicHeader />
      <Suspense fallback={null}>
        <CookieConsent />
      </Suspense>
      {children}
    </LocaleProvider>
  );
}
