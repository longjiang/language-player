'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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

export default function LanguageSelectPage() {
  const router = useRouter();
  const t = useT();
  const [l1Search, setL1Search] = useState('');
  const [l2Search, setL2Search] = useState('');
  const [selectedL1, setSelectedL1] = useState('en');
  const [selectedL2, setSelectedL2] = useState('');

  const filteredL1 = useMemo(() => {
    const q = l1Search.toLowerCase();
    if (!q) return POPULAR_LANGUAGES.filter((c) => SUPPORTED_L1S.includes(c as any));
    return SUPPORTED_L1S.filter(
      (c) =>
        languageName(c).toLowerCase().includes(q) || c.toLowerCase().includes(q),
    );
  }, [l1Search]);

  const filteredL2 = useMemo(() => {
    const q = l2Search.toLowerCase();
    if (!q) return POPULAR_LANGUAGES.filter((c) => SUPPORTED_L2S.includes(c as any));
    return SUPPORTED_L2S.filter(
      (c) =>
        languageName(c).toLowerCase().includes(q) || c.toLowerCase().includes(q),
    );
  }, [l2Search]);

  const canContinue = selectedL1 && selectedL2;

  function handleContinue() {
    if (!canContinue) return;
    router.push(`/${selectedL1}/${selectedL2}`);
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
                placeholder="Search languages..."
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {filteredL1.map((code) => (
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
                placeholder="Search languages..."
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {filteredL2.map((code) => (
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
                    {languageName(code)}
                    <span className="ml-1 text-xs opacity-60">{code.toUpperCase()}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Selection summary + continue */}
        {canContinue && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="rounded-full border border-border bg-muted px-4 py-2 text-sm">
              <span className="text-muted-foreground">UI:</span>{' '}
              <strong>{languageName(selectedL1!)}</strong>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="rounded-full border border-border bg-muted px-4 py-2 text-sm">
              <span className="text-muted-foreground">Learning:</span>{' '}
              <strong>{languageName(selectedL2!)}</strong>
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
