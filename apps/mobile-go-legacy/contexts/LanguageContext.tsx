// @/contexts/LanguageContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import Languages from '@/src/languages';
import { Language } from '@/src/languages';

// Define the context's value type
interface LanguageContextType {
  setL1Lang: (lang: Language | null) => void;
  setL2Lang: (lang: Language | null) => void;
  l1Lang: Language | null;
  l2Lang: Language | null;
  languages: Languages | null;
}

// Create the context with a default value
const LanguageContext = createContext<LanguageContextType>({
  setL1Lang: () => {},
  setL2Lang: () => {},
  l1Lang: null,
  l2Lang: null,
  languages: null,
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

  // Context value that will be exposed to other components
  const value = useMemo(() => ({
    setL1Lang,
    setL2Lang,
    l1Lang,
    l2Lang,
    languages,
  }), [l1Lang, l2Lang, languages]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
