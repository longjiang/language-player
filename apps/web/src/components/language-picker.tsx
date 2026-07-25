'use client';

import { useState, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import { Search, ArrowRight, Globe, BookOpen, X } from 'lucide-react';
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

export interface LanguagePickerProps {
  /** Initial L1 code. Defaults to 'en'. */
  initialL1?: string;
  /** Initial L2 code. */
  initialL2?: string;
  /** Called when user clicks confirm with valid L1 + L2. */
  onConfirm: (l1: string, l2: string) => void;
  /** Called when user dismisses the picker (cancel / close). */
  onDismiss?: () => void;
  /** Show the welcome title above the columns. */
  showTitle?: boolean;
  /** Show a close/dismiss button (for modal use). */
  showClose?: boolean;
}

export function LanguagePicker({
  initialL1 = 'en',
  initialL2 = '',
  onConfirm,
  onDismiss,
  showTitle = false,
  showClose = false,
}: LanguagePickerProps) {
  const locale = useLocale();
  const t = useT();
  const [l1Search, setL1Search] = useState('');
  const [l2Search, setL2Search] = useState('');
  const [selectedL1, setSelectedL1] = useState(initialL1);
  const [selectedL2, setSelectedL2] = useState(initialL2);
  const [useTraditional, setUseTraditionalState] = useState(false);

  const filteredL1 = useMemo(() => {
    const q = l1Search.toLowerCase();
    if (!q) {
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

  const canConfirm = selectedL1 && selectedL2;

  function handleConfirm() {
    if (!canConfirm) return;
    if (selectedL2 === 'zh') {
      setUseTraditional(useTraditional);
    }
    onConfirm(selectedL1, selectedL2);
  }

  function renderLanguageColumn(
    code: string,
    setCode: (c: string) => void,
    list: { popular: string[]; rest: string[]; searching: boolean },
    search: string,
    setSearch: (s: string) => void,
    label: string,
    icon: React.ReactNode,
    isL1: boolean,
  ) {
    const selectedClass = isL1
      ? 'bg-primary text-primary-foreground'
      : 'bg-warm-500 text-white';

    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          {icon}
          <h2 className="font-semibold">{label}</h2>
        </div>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
            placeholder={t('placeholder.search_languages')}
          />
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {list.popular.length > 0 && (
            <>
              {!list.searching && (
                <div className="px-3 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('msg.popular_languages')}
                </div>
              )}
              {list.popular.map((c) => (
                <button
                  key={c}
                  onClick={() => setCode(c)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    code === c ? selectedClass : 'hover:bg-muted'
                  }`}
                  dir={isRTL(c) ? 'rtl' : 'ltr'}
                >
                  <span className="text-base">{isRTL(c) ? '↺' : ''}</span>
                  <span>
                    {isL1 ? languageName(c) : languageName(c, locale)}
                    <span className="ml-1 text-xs opacity-60">{c.toUpperCase()}</span>
                  </span>
                </button>
              ))}
            </>
          )}
          {list.rest.length > 0 && (
            <>
              <div className="mx-3 my-1 border-t border-border" />
              <div className="px-3 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('msg.all_languages')}
              </div>
              {list.rest.map((c) => (
                <button
                  key={c}
                  onClick={() => setCode(c)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    code === c ? selectedClass : 'hover:bg-muted'
                  }`}
                  dir={isRTL(c) ? 'rtl' : 'ltr'}
                >
                  <span className="text-base">{isRTL(c) ? '↺' : ''}</span>
                  <span>
                    {isL1 ? languageName(c) : languageName(c, locale)}
                    <span className="ml-1 text-xs opacity-60">{c.toUpperCase()}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl">
      {/* Header / title */}
      {showTitle && (
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">{t('title.welcome')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('msg.choose_languages')}
          </p>
        </div>
      )}

      {/* Close button (for modal) */}
      {showClose && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={onDismiss}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={t('action.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* L1 Selector */}
        {renderLanguageColumn(
          selectedL1,
          setSelectedL1,
          filteredL1,
          l1Search,
          setL1Search,
          t('title.i_speak'),
          <Globe className="h-5 w-5 text-primary" />,
          true,
        )}

        {/* L2 Selector */}
        {renderLanguageColumn(
          selectedL2,
          setSelectedL2,
          filteredL2,
          l2Search,
          setL2Search,
          t('title.i_learning'),
          <BookOpen className="h-5 w-5 text-warm-500" />,
          false,
        )}
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

      {/* Selection summary + confirm */}
      {canConfirm && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <div className="rounded-full border border-border bg-muted px-4 py-2 text-sm">
            <span className="text-muted-foreground">{t('title.i_speak')}:</span>{' '}
            <strong>{languageName(selectedL1, locale)}</strong>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="rounded-full border border-border bg-muted px-4 py-2 text-sm">
            <span className="text-muted-foreground">{t('title.learning_label')}</span>{' '}
            <strong>{languageName(selectedL2, locale)}</strong>
          </div>
          <Button onClick={handleConfirm} className="ml-4">
            {t('action.continue')} <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
