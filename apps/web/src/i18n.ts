import { getRequestConfig } from 'next-intl/server';
import { SUPPORTED_L1S } from '@langplayer/shared';

export default getRequestConfig(async ({ locale }) => {
  // Validate against supported L1s, fall back to English
  const validLocale = SUPPORTED_L1S.includes(locale as any) ? locale : 'en';

  return {
    locale: validLocale,
    messages: (await import(`../messages/${validLocale}.json`)).default,
  };
});
