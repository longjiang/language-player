import React, { type ReactNode, useMemo } from 'react';
import { IntlProvider } from 'react-intl';
import { useLanguage } from '@/contexts/LanguageContext';
import { logerr } from '@/lib/logger';

// Static import map — Metro can't resolve dynamic requires.
// These are the 18 supported locales from translations.csv.
// Each JSON is in packages/shared/locales/ (nested format, keyed by dot-path).
import en from '@langplayer/shared/locales/en.json';
import zhHans from '@langplayer/shared/locales/zh-Hans.json';
import zhHant from '@langplayer/shared/locales/zh-Hant.json';
import ar from '@langplayer/shared/locales/ar.json';
import de from '@langplayer/shared/locales/de.json';
import es from '@langplayer/shared/locales/es.json';
import fr from '@langplayer/shared/locales/fr.json';
import id from '@langplayer/shared/locales/id.json';
import it from '@langplayer/shared/locales/it.json';
import ja from '@langplayer/shared/locales/ja.json';
import ko from '@langplayer/shared/locales/ko.json';
import nl from '@langplayer/shared/locales/nl.json';
import pl from '@langplayer/shared/locales/pl.json';
import pt from '@langplayer/shared/locales/pt.json';
import ru from '@langplayer/shared/locales/ru.json';
import th from '@langplayer/shared/locales/th.json';
import tr from '@langplayer/shared/locales/tr.json';
import vi from '@langplayer/shared/locales/vi.json';

const localeMessages: Record<string, Record<string, unknown>> = {
  en, 'zh-Hans': zhHans, 'zh-Hant': zhHant,
  ar, de, es, fr, id, it, ja, ko, nl, pl, pt, ru, th, tr, vi,
};

/** Direct access to nested locale messages — useT() resolves from this, not IntlProvider. */
export function getLocaleMessages(locale: string): Record<string, unknown> {
  return (localeMessages as any)[locale] ?? localeMessages['en'] ?? {};
}

export function IntlProviderWrapper({ children }: { children: ReactNode }) {
  const { l1Lang } = useLanguage();
  const locale = l1Lang?.code ?? 'en';

  // Pass empty messages to IntlProvider — useT() resolves directly from
  // the static import map via resolveNested(). Simple {key} placeholders are
  // handled by string replacement; only complex ICU (plural/select) goes
  // through intl.formatMessage({ defaultMessage }), which falls back
  // gracefully when the flat key isn't found in empty messages.
  const emptyMessages = useMemo(() => ({} as Record<string, string>), []);

  // Suppress MISSING_TRANSLATION errors — useT() resolves messages from the
  // static import map via resolveNested() and only routes ICU plurals through
  // intl.formatMessage({ id, defaultMessage }), which triggers a harmless
  // MISSING_TRANSLATION lookup before falling back to defaultMessage.
  const handleError = useMemo(() => (err: any) => {
    if (err?.code === 'MISSING_TRANSLATION') return;
    logerr('[IntlProvider]', err);
  }, []);

  // react-intl's IntlProvider has a React 19 type incompatibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Provider = IntlProvider as any;

  return (
    <Provider locale={locale} messages={emptyMessages} defaultLocale="en" onError={handleError}>
      {children}
    </Provider>
  );
}
