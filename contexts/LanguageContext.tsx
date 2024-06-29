// @/contexts/LanguageContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as Localization from 'expo-localization';
import { I18n } from 'i18n-js';
import Languages from '@/src/languages';
import { Language } from '@/src/languages';  // Import the Language type from your languages module

// Instantiate I18n with the `new` keyword
const i18n = new I18n({
  en: require('@/assets/localizations/en.json'),
  'zh-Hans': require('@/assets/localizations/zh-Hans.json'),
  'zh-Hant': require('@/assets/localizations/zh-Hant.json'),
  es: require('@/assets/localizations/es.json'),
  tr: require('@/assets/localizations/tr.json'),
  de: require('@/assets/localizations/de.json'),
  fr: require('@/assets/localizations/fr.json'),
  ru: require('@/assets/localizations/ru.json'),
  pt: require('@/assets/localizations/pt.json'),
  pl: require('@/assets/localizations/pl.json'),
  ar: require('@/assets/localizations/ar.json'),
});

// Enable fallback and load default translations
i18n.enableFallback = true;
i18n.translations.en = i18n.translations.en || require('@/assets/localizations/en.json');

// Define the context's value type
interface LanguageContextType {
  setL1Lang: (lang: Language | null) => void;
  setL2Lang: (lang: Language | null) => void;
  l1Lang: Language | null;
  l2Lang: Language | null;
  languages: Languages | null;
  i18n: I18n;
}

// Create the context with a default value
const LanguageContext = createContext<LanguageContextType>({
  setL1Lang: () => {},
  setL2Lang: () => {},
  l1Lang: null,
  l2Lang: null,
  languages: null,
  i18n,
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

  // Context value that will be exposed to other components
  const value = {
    setL1Lang,
    setL2Lang,
    l1Lang,
    l2Lang,
    languages,
    i18n
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
