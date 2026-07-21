// @/contexts/IntlProvider.tsx
// Wraps react-intl's IntlProvider, reading the current L1 locale from LanguageContext.
// Coexists with i18n-js during migration — both read the same JSON files.

import React, { ReactNode, useMemo } from 'react';
import { IntlProvider as ReactIntlProvider } from 'react-intl';
import { useLanguage } from './LanguageContext';
import { loadLocaleMessages } from '@/src/i18n/load-messages';

export const IntlProviderWrapper: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { l1Lang } = useLanguage();
  const locale = l1Lang?.code ?? 'en';

  const messages = useMemo(() => {
    try {
      return loadLocaleMessages(locale);
    } catch {
      // Fallback to English if the locale file is missing
      return loadLocaleMessages('en');
    }
  }, [locale]);

  return (
    <ReactIntlProvider locale={locale} messages={messages} defaultLocale="en">
      {children}
    </ReactIntlProvider>
  );
};
