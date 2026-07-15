import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { SUPPORTED_L1S } from '@langplayer/shared';

type Messages = Record<string, unknown>;

/** Deep-merge: `base` provides fallback values, `override` takes priority. */
function deepMerge(base: Messages, override: Messages): Messages {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (
      baseVal != null &&
      overrideVal != null &&
      typeof baseVal === 'object' &&
      typeof overrideVal === 'object' &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(baseVal as Messages, overrideVal as Messages);
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}

async function resolveLocale(): Promise<string> {
  // 1. If URL is /[l1]/[l2]/..., use l1 immediately (no cookie delay)
  try {
    const headersList = headers();
    const pathname = headersList.get('x-invoke-path') ?? headersList.get('x-pathname') ?? '';
    const segments = pathname.split('/').filter(Boolean);
    const l1 = segments[0];
    if (l1 && SUPPORTED_L1S.includes(l1 as any)) return l1;
  } catch { /* headers() may throw during static generation */ }

  // 2. Fall back to NEXT_LOCALE cookie (set by middleware from browser Accept-Language)
  const cookieStore = cookies();
  const rawLocale = cookieStore.get('NEXT_LOCALE')?.value ?? 'en';
  return SUPPORTED_L1S.includes(rawLocale as any) ? rawLocale : 'en';
}

export default getRequestConfig(async (): Promise<any> => {
  const locale = await resolveLocale();

  const enMessages = (await import(`../messages/en.json`)).default as Messages;
  if (locale === 'en') return { locale, messages: enMessages };

  const localeMessages = (await import(`../messages/${locale}.json`)).default as Messages;
  return { locale, messages: deepMerge(enMessages, localeMessages) };
});
