import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { SUPPORTED_L1S } from '@langplayer/shared';
import { deepMerge } from '@langplayer/utils';

type Messages = Record<string, unknown>;

/** Global fallback used when no request-specific time zone is available. */
const DEFAULT_TIME_ZONE = 'America/Vancouver';

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

async function resolveLocale(): Promise<string> {
  // 1. If URL is /[l1]/[l2]/..., use l1 immediately (no cookie delay)
  try {
    const headersList = await headers();
    const pathname = headersList.get('x-invoke-path') ?? headersList.get('x-pathname') ?? '';
    const segments = pathname.split('/').filter(Boolean);
    const l1 = segments[0];
    if (l1 && SUPPORTED_L1S.includes(l1 as any)) return l1;
  } catch { /* headers() may throw during static generation */ }

  // 2. Fall back to NEXT_LOCALE cookie (set by middleware from browser Accept-Language)
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get('NEXT_LOCALE')?.value ?? 'en';
  return SUPPORTED_L1S.includes(rawLocale as any) ? rawLocale : 'en';
}

async function resolveTimeZone(): Promise<string> {
  // Prefer a request-level time zone (e.g. Vercel's x-vercel-ip-timezone),
  // falling back to a stable global default so SSR and client rendering agree.
  try {
    const headersList = await headers();
    const candidate =
      headersList.get('x-vercel-ip-timezone') ?? headersList.get('x-timezone') ?? '';
    if (candidate && isValidTimeZone(candidate)) return candidate;
  } catch {
    /* headers() may throw during static generation */
  }

  return DEFAULT_TIME_ZONE;
}

export default getRequestConfig(async (): Promise<any> => {
  const [locale, timeZone] = await Promise.all([resolveLocale(), resolveTimeZone()]);

  // Load from shared packages/shared/locales/ directory
  const enMessages = (await import(`../../../packages/shared/locales/en.json`)).default as Messages;
  if (locale === 'en') return { locale, timeZone, messages: enMessages };

  const localeMessages = (await import(`../../../packages/shared/locales/${locale}.json`)).default as Messages;
  return { locale, timeZone, messages: deepMerge(enMessages, localeMessages) };
});
