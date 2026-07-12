'use client';

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getLanguageMeta, type LanguageMeta } from '@/lib/language-data';

interface LanguageContextValue {
  l1: LanguageMeta;
  l2: LanguageMeta;
  setLanguagePair: (l1: string, l2: string) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within <LanguageProvider>');
  }
  return ctx;
}

export function LanguageProvider({
  children,
  l1: l1Code,
  l2: l2Code,
}: {
  children: ReactNode;
  l1: string;
  l2: string;
}) {
  const l1 = useMemo(() => getLanguageMeta(l1Code)!, [l1Code]);
  const l2 = useMemo(() => getLanguageMeta(l2Code)!, [l2Code]);

  const setLanguagePair = (newL1: string, newL2: string) => {
    // Navigate to the new URL — this triggers middleware to set cookies
    window.location.href = `/${newL1}/${newL2}`;
  };

  const value = useMemo<LanguageContextValue>(
    () => ({ l1, l2, setLanguagePair }),
    [l1, l2],
  );

  // Set dir attribute for RTL languages
  React.useEffect(() => {
    document.documentElement.dir = l1.direction;
    document.documentElement.lang = l1.code;
  }, [l1]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
