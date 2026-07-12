import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { SUPPORTED_L1S } from '@langplayer/shared';

export default getRequestConfig(async () => {
  // Read locale from our custom cookie (set by middleware from /[l1]/[l2] path)
  const cookieStore = cookies();
  const rawLocale = cookieStore.get('NEXT_LOCALE')?.value ?? 'en';
  const locale = SUPPORTED_L1S.includes(rawLocale as any) ? rawLocale : 'en';

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
