import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';
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
function getLanguageName(code: string, locale: string = 'en'): string {
  // Resolve from locale JSON lang.* keys (e.g., lang.ja → "Japanese" in en, "日语" in zh-Hans)
  try {
    const { getLocaleMessages } = require('@/contexts/IntlProvider');
    const msgs = getLocaleMessages(locale) as Record<string, unknown>;
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

function buildLanguageMeta(code: string, locale?: string): LanguageMeta {
  return {
    code,
    name: getLanguageName(code, locale),
    direction: RTL_CODES.has(code) ? 'rtl' : 'ltr',
    han: HAN_CODES.has(code),
  };
}

const SUPPORTED_L1_SET = new Set<string>(SUPPORTED_L1S as readonly string[]);

/**
 * Best supported L1 for the user's system language, or undefined when none of
 * the device locales map to a supported UI language. Falls back to English.
 *
 * Handles script variants for Chinese (zh-Hans / zh-Hant) and prefers the
 * user's primary system locale first.
 */
function systemL1Code(): string | undefined {
  const locales = getLocales();
  if (!locales.length) return undefined;

  for (const loc of locales) {
    // Exact supported match first (e.g. 'zh-Hans', 'ja', 'en').
    if (SUPPORTED_L1_SET.has(loc.languageTag)) return loc.languageTag;

    const lc = loc.languageCode;
    if (!lc) continue;

    if (lc === 'zh') {
      // Disambiguate simplified vs traditional from the script subtag
      // (e.g. 'zh-Hans-CN' → Hans, 'zh-Hant-HK' → Hant).
      const script = loc.languageTag.split('-')[1];
      if (script === 'Hant' && SUPPORTED_L1_SET.has('zh-Hant')) return 'zh-Hant';
      if (SUPPORTED_L1_SET.has('zh-Hans')) return 'zh-Hans';
      continue;
    }
    if (SUPPORTED_L1_SET.has(lc)) return lc;
  }
  return undefined;
}

// ── Context ─────────────────────────────────

interface LanguageContextValue {
  l1Lang: LanguageMeta;
  l2Lang: LanguageMeta;
  hasStoredPair: boolean;
  setL1Lang: (code: string) => Promise<void>;
  setL2Lang: (code: string) => Promise<void>;
  swapLanguages: () => Promise<void>;
  /** Preview an L1 — the UI language switches immediately without persisting. */
  previewL1Lang: (code: string) => void;
  /** Clear an unconfirmed L1 preview, reverting the UI language. */
  clearL1Preview: () => void;
  availableL1s: string[];
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within <LanguageProvider>');
  return ctx;
}

/** Optional form used by the global text renderer during boot/error states. */
export function useOptionalLanguage(): LanguageContextValue | null {
  return useContext(LanguageContext);
}

// ── Provider ────────────────────────────────

const L1_STORAGE_KEY = 'lp_l1';
const L2_STORAGE_KEY = 'lp_l2';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [l1Code, setL1CodeState] = useState<string>('en');
  const [l2Code, setL2CodeState] = useState<string>('en');
  const [hasStoredPair, setHasStoredPair] = useState(false);
  const [ready, setReady] = useState(false);
  // Unconfirmed L1 preview from the language picker — overrides the UI
  // locale immediately but is not persisted until setL1Lang commits it.
  const [previewL1Code, setPreviewL1Code] = useState<string | null>(null);

  // Restore on mount. When no L1 has been stored, fall back to the user's
  // system language so a fresh install shows a familiar UI by default.
  useEffect(() => {
    (async () => {
      const storedL1 = await SecureStore.getItemAsync(L1_STORAGE_KEY);
      const storedL2 = await SecureStore.getItemAsync(L2_STORAGE_KEY);
      const hasStoredL1 = !!storedL1 && SUPPORTED_L1S.includes(storedL1 as typeof SUPPORTED_L1S[number]);
      if (hasStoredL1) {
        setL1CodeState(storedL1!);
      } else {
        const systemL1 = systemL1Code();
        if (systemL1) setL1CodeState(systemL1);
      }
      if (storedL1 && !hasStoredL1) {
        // Deprecated L1 (SPEC-063) — clear it so a stale pair doesn't stick.
        await SecureStore.deleteItemAsync(L1_STORAGE_KEY);
      }
      if (storedL2) {
        setL2CodeState(storedL2);
      }
      if (hasStoredL1 && storedL2) {
        setHasStoredPair(true);
      }
      setReady(true);
    })();
  }, []);

  const commitL1 = useCallback(async (code: string) => {
    setL1CodeState(code);
    setPreviewL1Code(null);
    setHasStoredPair(true);
    await SecureStore.setItemAsync(L1_STORAGE_KEY, code);
  }, []);

  const setL1Lang = useCallback(async (code: string) => {
    await commitL1(code);
  }, [commitL1]);

  const setL2Lang = useCallback(async (code: string) => {
    setL2CodeState(code);
    setHasStoredPair(true);
    await SecureStore.setItemAsync(L2_STORAGE_KEY, code);
  }, []);

  const swapLanguages = useCallback(async () => {
    const newL1 = l2Code;
    const newL2 = l1Code;
    setL1CodeState(newL1);
    setPreviewL1Code(null);
    setL2CodeState(newL2);
    setHasStoredPair(true);
    await SecureStore.setItemAsync(L1_STORAGE_KEY, newL1);
    await SecureStore.setItemAsync(L2_STORAGE_KEY, newL2);
  }, [l1Code, l2Code]);

  const previewL1Lang = useCallback((code: string) => {
    setPreviewL1Code(code);
  }, []);

  const clearL1Preview = useCallback(() => {
    setPreviewL1Code(null);
  }, []);

  // The UI locale follows an active preview, else the committed L1.
  const displayL1Code = previewL1Code ?? l1Code;

  const value = useMemo<LanguageContextValue>(() => ({
    l1Lang: buildLanguageMeta(displayL1Code, displayL1Code),
    l2Lang: buildLanguageMeta(l2Code, displayL1Code),
    hasStoredPair,
    setL1Lang,
    setL2Lang,
    swapLanguages,
    previewL1Lang,
    clearL1Preview,
    availableL1s: [...SUPPORTED_L1S],
  }), [displayL1Code, l2Code, hasStoredPair, setL1Lang, setL2Lang, swapLanguages, previewL1Lang, clearL1Preview]);

  if (!ready) return null; // Wait for stored languages before rendering

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
