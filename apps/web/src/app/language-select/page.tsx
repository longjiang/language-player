'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import { Search, ArrowRight, Globe, BookOpen } from 'lucide-react';
import {
  SUPPORTED_L1S,
  SUPPORTED_L2S,
} from '@langplayer/shared';
import {
  POPULAR_LANGUAGES,
  languageName,
  isRTL,
} from '@/lib/language-data';
import { setUseTraditional } from '@/lib/settings';

export default function LanguageSelectPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const [l1Search, setL1Search] = useState('');
  const [l2Search, setL2Search] = useState('');
  const [selectedL1, setSelectedL1] = useState('en');
  const [selectedL2, setSelectedL2] = useState('');
  const [useTraditional, setUseTraditionalState] = useState(false);

  const filteredL1 = useMemo(() => {
    const q = l1Search.toLowerCase();
    if (!q) {
      // Popular first, then remaining L1s
      const popularSet = new Set(POPULAR_LANGUAGES);
      const popular = POPULAR_LANGUAGES.filter((c) => SUPPORTED_L1S.includes(c as any));
      const rest = SUPPORTED_L1S.filter((c) => !popularSet.has(c as any));
      return { popular, rest, searching: false };
    }
    const results = SUPPORTED_L1S.filter(
      (c) =>
        languageName(c).toLowerCase().includes(q) ||
        languageName(c, locale).toLowerCase().includes(q) ||
        languageName(c, 'en').toLowerCase().includes(q) ||
        c.toLowerCase().includes(q),
    );
    return { popular: results, rest: [], searching: true };
  }, [l1Search, locale]);

  const filteredL2 = useMemo(() => {
    const q = l2Search.toLowerCase();
    if (!q) {
      // Popular first, then remaining L2s
      const popularSet = new Set(POPULAR_LANGUAGES);
      const popular = POPULAR_LANGUAGES.filter((c) => SUPPORTED_L2S.includes(c as any));
      const rest = SUPPORTED_L2S.filter((c) => !popularSet.has(c as any));
      return { popular, rest, searching: false };
    }
    const results = SUPPORTED_L2S.filter(
      (c) =>
        languageName(c).toLowerCase().includes(q) ||
        languageName(c, locale).toLowerCase().includes(q) ||
        languageName(c, 'en').toLowerCase().includes(q) ||
        c.toLowerCase().includes(q),
    );
    return { popular: results, rest: [], searching: true };
  }, [l2Search, locale]);

  const canContinue = selectedL1 && selectedL2;

  function handleContinue() {
    if (!canContinue) return;
    // Save traditional/simplified preference for Chinese
    if (selectedL2 === 'zh') {
      setUseTraditional(useTraditional);
    }
    router.push(`/${selectedL1}/${selectedL2}/explore`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">{t('title.welcome')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('msg.choose_languages')}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* L1 Selector */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">{t('title.i_speak')}</h2>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={l1Search}
                onChange={(e) => setL1Search(e.target.value)}
                className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                placeholder={t('placeholder.search_languages')}
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {filteredL1.popular.length > 0 && (
                <>
                  {!filteredL1.searching && (
                    <div className="px-3 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('msg.popular_languages')}
                    </div>
                  )}
                  {filteredL1.popular.map((code) => (
                    <button
                      key={code}
                      onClick={() => setSelectedL1(code)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        selectedL1 === code
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                      dir={isRTL(code) ? 'rtl' : 'ltr'}
                    >
                      <span className="text-base">{isRTL(code) ? '↺' : ''}</span>
                      <span>
                        {languageName(code)}
                        <span className="ml-1 text-xs opacity-60">{code.toUpperCase()}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              {filteredL1.rest.length > 0 && (
                <>
                  <div className="mx-3 my-1 border-t border-border" />
                  <div className="px-3 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('msg.all_languages')}
                  </div>
                  {filteredL1.rest.map((code) => (
                    <button
                      key={code}
                      onClick={() => setSelectedL1(code)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        selectedL1 === code
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                      dir={isRTL(code) ? 'rtl' : 'ltr'}
                    >
                      <span className="text-base">{isRTL(code) ? '↺' : ''}</span>
                      <span>
                        {languageName(code)}
                        <span className="ml-1 text-xs opacity-60">{code.toUpperCase()}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* L2 Selector */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-warm-500" />
              <h2 className="font-semibold">{t('title.i_learning')}</h2>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={l2Search}
                onChange={(e) => setL2Search(e.target.value)}
                className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                placeholder={t('placeholder.search_languages')}
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {filteredL2.popular.length > 0 && (
                <>
                  {!filteredL2.searching && (
                    <div className="px-3 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('msg.popular_languages')}
                    </div>
                  )}
                  {filteredL2.popular.map((code) => (
                    <button
                      key={code}
                      onClick={() => setSelectedL2(code)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        selectedL2 === code
                          ? 'bg-warm-500 text-white'
                          : 'hover:bg-muted'
                      }`}
                      dir={isRTL(code) ? 'rtl' : 'ltr'}
                    >
                      <span>
                        {languageName(code, locale)}
                        <span className="ml-1 text-xs opacity-60">{code.toUpperCase()}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              {filteredL2.rest.length > 0 && (
                <>
                  <div className="mx-3 my-1 border-t border-border" />
                  <div className="px-3 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('msg.all_languages')}
                  </div>
                  {filteredL2.rest.map((code) => (
                    <button
                      key={code}
                      onClick={() => setSelectedL2(code)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        selectedL2 === code
                          ? 'bg-warm-500 text-white'
                          : 'hover:bg-muted'
                      }`}
                      dir={isRTL(code) ? 'rtl' : 'ltr'}
                    >
                      <span>
                        {languageName(code, locale)}
                        <span className="ml-1 text-xs opacity-60">{code.toUpperCase()}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Script choice for Chinese */}
        {selectedL2 === 'zh' && (
          <div className="mt-6 flex justify-center">
            <div className="inline-flex rounded-lg border border-border bg-muted p-1">
              <button
                onClick={() => setUseTraditionalState(false)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  !useTraditional
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('setting.simplified')}
              </button>
              <button
                onClick={() => setUseTraditionalState(true)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  useTraditional
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('setting.traditional')}
              </button>
            </div>
          </div>
        )}

        {/* Selection summary + continue */}
        {canContinue && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="rounded-full border border-border bg-muted px-4 py-2 text-sm">
              <span className="text-muted-foreground">{t('title.i_speak')}:</span>{' '}
              <strong>{languageName(selectedL1!, locale)}</strong>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="rounded-full border border-border bg-muted px-4 py-2 text-sm">
              <span className="text-muted-foreground">{t('title.learning_label')}</span>{' '}
              <strong>{languageName(selectedL2!, locale)}</strong>
            </div>
            <Button onClick={handleContinue} className="ml-4">
              {t('action.continue')} <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
