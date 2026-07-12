import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
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

export default getRequestConfig(async () => {
  // Read locale from our custom cookie (set by middleware from /[l1]/[l2] path)
  const cookieStore = cookies();
  const rawLocale = cookieStore.get('NEXT_LOCALE')?.value ?? 'en';
  const locale = SUPPORTED_L1S.includes(rawLocale as any) ? rawLocale : 'en';

  // Always load English as fallback for missing translations
  const enMessages = (await import(`../messages/en.json`)).default as Messages;

  if (locale === 'en') {
    return { locale, messages: enMessages };
  }

  const localeMessages = (await import(`../messages/${locale}.json`)).default as Messages;

  return {
    locale,
    messages: deepMerge(enMessages, localeMessages),
  };
});
