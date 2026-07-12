// @/contexts/LanguageContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { I18n } from 'i18n-js';
import Languages from '@/src/languages';
import { Language } from '@/src/languages';  // Import the Language type from your languages module

// Instantiate I18n with the `new` keyword
const i18n = new I18n({
  en: require('@/assets/localizations/en.json'),
  'zh-Hans': require('@/assets/localizations/zh-Hans.json'),
  'zh-Hant': require('@/assets/localizations/zh-Hant.json'),
  af: require('@/assets/localizations/af.json'),
  ar: require('@/assets/localizations/ar.json'),
  ca: require('@/assets/localizations/ca.json'),
  de: require('@/assets/localizations/de.json'),
  el: require('@/assets/localizations/el.json'),
  es: require('@/assets/localizations/es.json'),
  fi: require('@/assets/localizations/fi.json'),
  fr: require('@/assets/localizations/fr.json'),
  ga: require('@/assets/localizations/ga.json'),
  hi: require('@/assets/localizations/hi.json'),
  hr: require('@/assets/localizations/hr.json'),
  hu: require('@/assets/localizations/hu.json'),
  id: require('@/assets/localizations/id.json'),
  it: require('@/assets/localizations/it.json'),
  ja: require('@/assets/localizations/ja.json'),
  ko: require('@/assets/localizations/ko.json'),
  nl: require('@/assets/localizations/nl.json'),
  no: require('@/assets/localizations/no.json'),
  pl: require('@/assets/localizations/pl.json'),
  pt: require('@/assets/localizations/pt.json'),
  ro: require('@/assets/localizations/ro.json'),
  ru: require('@/assets/localizations/ru.json'),
  sr: require('@/assets/localizations/sr.json'),
  sv: require('@/assets/localizations/sv.json'),
  sw: require('@/assets/localizations/sw.json'),
  th: require('@/assets/localizations/th.json'),
  tr: require('@/assets/localizations/tr.json'),
  vi: require('@/assets/localizations/vi.json')
});

// Enable fallback and load default translations
i18n.enableFallback = true;
i18n.translations.en = i18n.translations.en || require('@/assets/localizations/en.json');

// Set default missingBehavior
i18n.missingBehavior = 'guess';

// Define the context's value type
interface LanguageContextType {
  setL1Lang: (lang: Language | null) => void;
  setL2Lang: (lang: Language | null) => void;
  l1Lang: Language | null;
  l2Lang: Language | null;
  languages: Languages | null;
  i18n: I18n;
  t: typeof i18n.t;
}

// Create the context with a default value
const LanguageContext = createContext<LanguageContextType>({
  setL1Lang: () => {},
  setL2Lang: () => {},
  l1Lang: null,
  l2Lang: null,
  languages: null,
  i18n,
  t: i18n.t.bind(i18n)
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  const [l1Lang, setL1Lang] = useState<Language | null>(null);
  const [l2Lang, setL2Lang] = useState<Language | null>(null);
  const [languages, setLanguages] = useState<Languages | null>(null);

  useEffect(() => {
    const loadLanguages = async () => {
      const langs = await Languages.getInstance();
      setLanguages(langs);
    };

    loadLanguages();
  }, []);

  useEffect(() => {
    if (l1Lang?.code) {
      try {
        i18n.locale = l1Lang.code;
        console.log('Setting locale to', l1Lang.code);
      } catch (error) {
        console.error("Failed to load translations", error);
        i18n.locale = 'en'; // Fallback to English
      }
    }
  }, [l1Lang]);


  // Stable t function — avoids re-running downstream effects on every render
  const t = useMemo(() => i18n.t.bind(i18n), []);

  // Context value that will be exposed to other components
  const value = useMemo(() => ({
    setL1Lang,
    setL2Lang,
    l1Lang,
    l2Lang,
    languages,
    i18n,
    t
  }), [l1Lang, l2Lang, languages, i18n, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
