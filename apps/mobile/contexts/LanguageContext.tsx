import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { SUPPORTED_L1S } from '@langplayer/shared';

// ── Language Metadata ───────────────────────

export interface LanguageMeta {
  code: string;
  name: string;
  direction: 'ltr' | 'rtl';
  han: boolean;
}

// Language names are resolved from the locale JSON via the IntlProvider.
// For now, use the code as fallback — full lang.* resolution will be added
// in Phase 2 when we integrate language-name lookups into the useT() hook.
function getLanguageName(code: string): string {
  // Resolve from locale JSON lang.* keys (e.g., lang.zh-Hans → "Chinese (Simplified)")
  try {
    const { getLocaleMessages } = require('@/contexts/IntlProvider');
    const msgs = getLocaleMessages('en') as Record<string, unknown>;
    const lang = (msgs as any)?.lang;
    if (lang && typeof lang === 'object' && code in lang) {
      return (lang as Record<string, string>)[code]!;
    }
  } catch {}
  return code.replace('-', ' ').toUpperCase();
}

// RTL languages
const RTL_CODES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'ku']);

// Han (Chinese character) languages
const HAN_CODES = new Set(['zh', 'yue', 'lzh', 'nan', 'hak', 'wuu', 'hsn', 'cjy', 'cpx', 'gan', 'mnp']);

function buildLanguageMeta(code: string): LanguageMeta {
  return {
    code,
    name: getLanguageName(code),
    direction: RTL_CODES.has(code) ? 'rtl' : 'ltr',
    han: HAN_CODES.has(code),
  };
}

// ── Context ─────────────────────────────────

interface LanguageContextValue {
  l1Lang: LanguageMeta;
  l2Lang: LanguageMeta;
  setL1Lang: (code: string) => Promise<void>;
  setL2Lang: (code: string) => Promise<void>;
  swapLanguages: () => Promise<void>;
  availableL1s: string[];
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within <LanguageProvider>');
  return ctx;
}

// ── Provider ────────────────────────────────

const L1_STORAGE_KEY = 'lp_l1';
const L2_STORAGE_KEY = 'lp_l2';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [l1Code, setL1CodeState] = useState<string>('en');
  const [l2Code, setL2CodeState] = useState<string>('en');
  const [ready, setReady] = useState(false);

  // Restore on mount
  useEffect(() => {
    (async () => {
      const storedL1 = await SecureStore.getItemAsync(L1_STORAGE_KEY);
      const storedL2 = await SecureStore.getItemAsync(L2_STORAGE_KEY);
      if (storedL1 && SUPPORTED_L1S.includes(storedL1 as typeof SUPPORTED_L1S[number])) {
        setL1CodeState(storedL1);
      }
      if (storedL2) {
        setL2CodeState(storedL2);
      }
      setReady(true);
    })();
  }, []);

  const setL1Lang = useCallback(async (code: string) => {
    setL1CodeState(code);
    await SecureStore.setItemAsync(L1_STORAGE_KEY, code);
  }, []);

  const setL2Lang = useCallback(async (code: string) => {
    setL2CodeState(code);
    await SecureStore.setItemAsync(L2_STORAGE_KEY, code);
  }, []);

  const swapLanguages = useCallback(async () => {
    const newL1 = l2Code;
    const newL2 = l1Code;
    setL1CodeState(newL1);
    setL2CodeState(newL2);
    await SecureStore.setItemAsync(L1_STORAGE_KEY, newL1);
    await SecureStore.setItemAsync(L2_STORAGE_KEY, newL2);
  }, [l1Code, l2Code]);

  const value = useMemo<LanguageContextValue>(() => ({
    l1Lang: buildLanguageMeta(l1Code),
    l2Lang: buildLanguageMeta(l2Code),
    setL1Lang,
    setL2Lang,
    swapLanguages,
    availableL1s: [...SUPPORTED_L1S],
  }), [l1Code, l2Code, setL1Lang, setL2Lang, swapLanguages]);

  if (!ready) return null; // Wait for stored languages before rendering

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
