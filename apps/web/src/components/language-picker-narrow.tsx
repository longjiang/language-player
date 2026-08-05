/**
 * Narrow/tab-based language picker layout (ADR-0017).
 *
 * Used on small screens (< 640px) and in dialog/header mode.
 * Two tabs: "I speak" (L1) and "I'm learning" (L2).
 * Tapping L1 auto-advances to L2 tab.
 */

'use client';

import React from 'react';
import { useT } from '@/hooks/use-t';
import { Search, X, Check, ArrowRight } from 'lucide-react';
import { languageName, isRTL, flagEmoji } from '@/lib/language-data';
import type {
  LanguageSection,
  UseLanguagePickerReturn,
} from '@langplayer/shared';

// ── Props ─────────────────────────────────────

interface LanguagePickerNarrowProps extends UseLanguagePickerReturn {
  onConfirm: () => void;
  showTitle?: boolean;
  showClose?: boolean;
  onDismiss?: () => void;
  getName: (code: string) => string;
  /** Resolver for L1 names (self-names). Defaults to getName. */
  getNameL1?: (code: string) => string;
  /** Whether the L2 list (translated names) renders RTL — follows the UI locale. */
  l2Rtl?: boolean;
}

// ── Helpers ───────────────────────────────────

const TABS = ['l1', 'l2'] as const;

function shortCode(code: string): string {
  return code.split('-')[0]!.toUpperCase();
}

// ── Component ─────────────────────────────────

export function LanguagePickerNarrow(props: LanguagePickerNarrowProps) {
  const {
    selectedL1,
    selectedL2,
    searchL1,
    searchL2,
    activeTab,
    useTraditional,
    filteredL1,
    filteredL2,
    setSelectedL1,
    setSelectedL2,
    setSearchL1,
    setSearchL2,
    setActiveTab,
    setUseTraditional,
    onConfirm,
    showTitle,
    showClose,
    onDismiss,
    getName,
    getNameL1,
    l2Rtl,
  } = props;

  const t = useT();

  const isL1 = activeTab === 'l1';
  const search = isL1 ? searchL1 : searchL2;
  const setSearch = isL1 ? setSearchL1 : setSearchL2;
  const sections = isL1 ? filteredL1 : filteredL2;
  const selectedCode = isL1 ? selectedL1 : selectedL2;
  const accentBg = isL1 ? 'bg-primary' : 'bg-accent';
  const accentText = 'text-primary-foreground';
  const resolveName = (code: string) => (isL1 ? getNameL1 ?? getName : getName)(code);

  // True when at least one section has items (search can return empty).
  const hasResults = sections.some((s) => s.data.length > 0);

  const handleSelect = (code: string) => {
    if (isL1) {
      setSelectedL1(code);
    } else {
      setSelectedL2(code);
    }
  };

  return (
    <div className="w-full">
      {/* Header / title */}
      {showTitle && (
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">{t('title.welcome')}</h1>
          <p className="mt-1 text-muted-foreground">{t('msg.choose_languages')}</p>
        </div>
      )}

      {/* Close button */}
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

      {/* Tab bar */}
      <div className="mb-3">
        <div className="flex rounded-lg border border-border bg-muted p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'l1' ? t('title.i_speak') : t('title.i_learning')}
            </button>
          ))}
        </div>
      </div>

      {/* Bordered panel: search + language list */}
      <div className="mb-4 rounded-xl border border-border bg-card">
        {/* Search */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center rounded-lg border border-input bg-background px-3 py-2 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ml-2 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              placeholder={t('placeholder.search_languages')}
              autoCapitalize="none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={t('action.clear')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Language list */}
        <div className="max-h-80 overflow-y-auto px-4 pb-4">
          {hasResults ? (
            sections.map((section: LanguageSection) => (
              <div key={section.title} className="space-y-1 pb-2">
                {section.title && (
                  <div className="sticky top-0 z-10 bg-card px-1 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {section.title}
                  </div>
                )}
                {section.data.map((code) => {
                  const isSelected = code === selectedCode;
                  // L1 tab shows native self-names (RTL per language); L2 tab
                  // shows names translated into the UI locale (follow its direction).
                  const rowRtl = isL1 ? isRTL(code) : (l2Rtl ?? false);
                  return (
                    <button
                      key={code}
                      onClick={() => handleSelect(code)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        isSelected
                          ? `${accentBg} ${accentText} shadow-sm`
                          : 'text-foreground hover:bg-muted'
                      }`}
                      dir={rowRtl ? 'rtl' : 'ltr'}
                    >
                      <span className="text-base leading-none" aria-hidden="true">
                        {flagEmoji(code)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{resolveName(code)}</span>
                      {isSelected ? (
                        <Check className="h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-muted-foreground/70">
                          {code.toUpperCase()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('msg.no_languages_match')}
            </div>
          )}
        </div>
      </div>

      {/* Summary bar */}
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        {/* Script toggle for Chinese */}
        {selectedL2 === 'zh' && (
          <div className="mb-2 flex rounded-lg border border-border bg-muted p-0.5">
            <button
              onClick={() => setUseTraditional(false)}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                !useTraditional
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('setting.simplified')}
            </button>
            <button
              onClick={() => setUseTraditional(true)}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                useTraditional
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('setting.traditional')}
            </button>
          </div>
        )}

        {/* Selection + button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span aria-hidden="true">{flagEmoji(selectedL1 || 'en')}</span>
            <span className="font-bold text-foreground">{shortCode(selectedL1 || 'en')}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span aria-hidden="true">{flagEmoji(selectedL2 || '')}</span>
            <span className={`truncate font-bold ${selectedL2 ? 'text-foreground' : 'text-muted-foreground'}`}>
              {selectedL2 ? shortCode(selectedL2) : '?'}
            </span>
          </div>

          {/* On L1 tab: "Next" switches to L2 */}
          {activeTab === 'l1' && (
            <button
              onClick={() => setActiveTab('l2')}
              className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t('action.next')}
            </button>
          )}

          {/* On L2 tab with L2 picked: "Confirm" */}
          {activeTab === 'l2' && selectedL2 && (
            <button
              onClick={onConfirm}
              className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t('action.confirm')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
