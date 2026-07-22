import React, { type ReactNode, useMemo } from 'react';
import { IntlProvider } from 'react-intl';
import { useLanguage } from '@/contexts/LanguageContext';

// Static import map — Metro can't resolve dynamic requires.
// These are the 31 supported locales from translations.csv.
// Each JSON is in packages/shared/locales/ (nested format, keyed by dot-path).
import en from '@langplayer/shared/locales/en.json';
import zhHans from '@langplayer/shared/locales/zh-Hans.json';
import zhHant from '@langplayer/shared/locales/zh-Hant.json';
import af from '@langplayer/shared/locales/af.json';
import ar from '@langplayer/shared/locales/ar.json';
import ca from '@langplayer/shared/locales/ca.json';
import de from '@langplayer/shared/locales/de.json';
import el from '@langplayer/shared/locales/el.json';
import es from '@langplayer/shared/locales/es.json';
import fi from '@langplayer/shared/locales/fi.json';
import fr from '@langplayer/shared/locales/fr.json';
import ga from '@langplayer/shared/locales/ga.json';
import hi from '@langplayer/shared/locales/hi.json';
import hr from '@langplayer/shared/locales/hr.json';
import hu from '@langplayer/shared/locales/hu.json';
import id from '@langplayer/shared/locales/id.json';
import it from '@langplayer/shared/locales/it.json';
import ja from '@langplayer/shared/locales/ja.json';
import ko from '@langplayer/shared/locales/ko.json';
import nl from '@langplayer/shared/locales/nl.json';
import no from '@langplayer/shared/locales/no.json';
import pl from '@langplayer/shared/locales/pl.json';
import pt from '@langplayer/shared/locales/pt.json';
import ro from '@langplayer/shared/locales/ro.json';
import ru from '@langplayer/shared/locales/ru.json';
import sr from '@langplayer/shared/locales/sr.json';
import sv from '@langplayer/shared/locales/sv.json';
import sw from '@langplayer/shared/locales/sw.json';
import th from '@langplayer/shared/locales/th.json';
import tr from '@langplayer/shared/locales/tr.json';
import vi from '@langplayer/shared/locales/vi.json';

const localeMessages: Record<string, Record<string, unknown>> = {
  en, 'zh-Hans': zhHans, 'zh-Hant': zhHant,
  af, ar, ca, de, el, es, fi, fr, ga, hi, hr, hu, id, it,
  ja, ko, nl, no, pl, pt, ro, ru, sr, sv, sw, th, tr, vi,
};

export function IntlProviderWrapper({ children }: { children: ReactNode }) {
  const { l1Lang } = useLanguage();
  const locale = l1Lang?.code ?? 'en';

  const messages = useMemo(() => {
    return localeMessages[locale] ?? localeMessages['en'] ?? {};
  }, [locale]);

  // react-intl's IntlProvider has a React 19 type incompatibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Provider = IntlProvider as any;

  return (
    <Provider locale={locale} messages={messages} defaultLocale="en">
      {children}
    </Provider>
  );
}
