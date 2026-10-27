import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getMessages, getTimeZone, setRequestLocale } from 'next-intl/server';
import { LanguageProvider } from '@/providers/language-provider';
import { LocaleProvider } from '@/providers/locale-provider';
import { VideoPlayerProvider } from '@/providers/video-player-provider';
import { SettingsProvider } from '@/providers/settings-provider';
import { RareGlyphProvider } from '@/providers/rare-glyph-provider';
import { ThemeSync } from '@/components/theme-sync';
import { ExploreCacheProvider } from '@/providers/explore-cache-provider';
import { UserLibraryProvider } from '@/providers/user-library-provider';
import { SUPPORTED_L1S, SUPPORTED_L2S } from '@langplayer/shared';
import { Header } from '@/components/layout/header';
import { ReaderChromeProvider } from '@/providers/reader-chrome-provider';
import { CookieConsent } from '@/components/consent/cookie-consent';
import { LanguagePairCookies } from '@/components/layout/language-pair-cookies';

/**
 * The app shell for every language-pair route. It is a **static** route: the
 * shell contains no user data, so one render per `(l1, l2, route)` per deploy is
 * enough, and every view, prefetch and navigation after that is served from the
 * edge cache (SPEC-108 Phase 2).
 *
 * Three things must stay true for that to hold:
 *
 * 1. **No request-time API may appear anywhere in this subtree** — no
 *    `cookies()`, `headers()`, `searchParams` or uncached `fetch()`. One such
 *    call silently flips the whole subtree back to dynamic, with a green build
 *    (measured: SPEC-108 Q1). Locale therefore comes from `setRequestLocale`
 *    below, never from a cookie.
 * 2. `generateStaticParams` must exist, even returning `[]`, or the route never
 *    leaves the dynamic path. `dynamicParams` then renders unknown pairs on
 *    demand, which is how 110 × 18 pairs stay out of the build.
 * 3. `revalidate = false`: the shell only changes when the code changes, i.e. on
 *    deploy. Any positive value re-invokes the function once per window per
 *    visited pair.
 */
export async function generateStaticParams() {
  // TEMPORARY probe: force a real prerender so a page that cannot be static
  // fails the build instead of silently rendering per request.
  return [{ l1: 'en', l2: 'ja' }, { l1: 'en', l2: 'zh' }];
}

export const dynamicParams = true;
export const revalidate = false;

export default async function LanguageLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ l1: string; l2: string }>;
  }
) {
  const params = await props.params;

  const {
    children
  } = props;

  // Validate language codes server-side
  if (
    !SUPPORTED_L1S.includes(params.l1 as any) ||
    !SUPPORTED_L2S.includes(params.l2 as any)
  ) {
    notFound();
  }

  // Tell next-intl the locale is a known route segment, so it resolves messages
  // without touching the request. Must run before any `getMessages()`.
  setRequestLocale(params.l1);
  const [messages, timeZone] = await Promise.all([getMessages(), getTimeZone()]);

  return (
    <LocaleProvider locale={params.l1} messages={messages} timeZone={timeZone}>
      <LanguagePairCookies l1={params.l1} l2={params.l2} />
      <LanguageProvider l1={params.l1} l2={params.l2}>
        <UserLibraryProvider>
          <SettingsProvider>
            <RareGlyphProvider>
              <ThemeSync />
              <Suspense fallback={null}>
                <CookieConsent />
              </Suspense>
              <ExploreCacheProvider>
                <VideoPlayerProvider>
                  <ReaderChromeProvider>
                    <div className="flex min-h-screen flex-col">
                      <Header />
                      {/*
                        A boundary above the page is required for every client
                        page that calls `useSearchParams()` (web-reader, search,
                        live-tv, dictionary…): without one, prerendering bails
                        out with "useSearchParams() should be wrapped in a
                        suspense boundary" and the route can never be static.
                        Routes with their own `loading.tsx` keep that closer
                        boundary — this one only catches the rest.
                      */}
                      <main className="flex-1">
                        <Suspense fallback={<div className="min-h-[60vh]" />}>
                          {children}
                        </Suspense>
                      </main>
                    </div>
                  </ReaderChromeProvider>
                </VideoPlayerProvider>
              </ExploreCacheProvider>
            </RareGlyphProvider>
          </SettingsProvider>
        </UserLibraryProvider>
      </LanguageProvider>
    </LocaleProvider>
  );
}
