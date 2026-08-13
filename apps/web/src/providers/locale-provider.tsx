'use client';

/**
 * Client-side locale provider (next-intl v4).
 *
 * Holds the current locale + merged messages in React state and re-renders
 * `NextIntlClientProvider` when the locale changes, so the entire client UI
 * retranslates immediately — no full page reload required.
 *
 * `switchLocale()` is exposed via context so the language picker can
 * retranslate the UI the moment the user picks a different L1 (before
 * confirming). It also persists the `NEXT_LOCALE` cookie (so the server-side
 * `resolveLocale()` stays in sync) and flips `<html dir/lang>`.
 *
 * Server-rendered content (metadata, some layouts) retranslates on the
 * subsequent navigation, which re-resolves the locale from the URL path.
 */

import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { SUPPORTED_L1S } from '@langplayer/shared';
import { deepMerge } from '@langplayer/utils';
import { isRTL } from '@/lib/language-data';

type Messages = Record<string, unknown>;

interface LocaleContextValue {
  /** Switch the entire UI locale immediately (async — loads messages). */
  switchLocale: (code: string) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocaleSwitcher(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocaleSwitcher must be used within <LocaleProvider>');
  }
  return ctx;
}

/** Load en + target locale messages and merge (en is the fallback base). */
async function loadMessages(code: string): Promise<Messages> {
  // Template literals (no static resolution) — matches i18n.ts's loader.
  const en = (await import(`../../../../packages/shared/locales/en.json`)).default as Messages;
  if (code === 'en') return en;
  const locale = (await import(`../../../../packages/shared/locales/${code}.json`)).default as Messages;
  return deepMerge(en, locale);
}

export function LocaleProvider({
  locale: initialLocale,
  messages: initialMessages,
  timeZone,
  children,
}: {
  locale: string;
  messages: Messages;
  timeZone: string;
  children: ReactNode;
}) {
  const [locale, setLocale] = useState(initialLocale);
  const [messages, setMessages] = useState(initialMessages);

  const switchLocale = useCallback(
    async (code: string) => {
      if (code === locale) return;
      if (!SUPPORTED_L1S.includes(code as any)) return;

      try {
        const nextMessages = await loadMessages(code);
        setMessages(nextMessages);
        setLocale(code);
        // Keep the server-side resolver (i18n.ts) in sync + flip document direction.
        document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=${60 * 60 * 24 * 365}`;
        document.documentElement.lang = code;
        document.documentElement.dir = isRTL(code) ? 'rtl' : 'ltr';
      } catch (err) {
        console.error('[LP Web] switchLocale failed', err);
      }
    },
    [locale],
  );

  const value = useMemo<LocaleContextValue>(() => ({ switchLocale }), [switchLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
