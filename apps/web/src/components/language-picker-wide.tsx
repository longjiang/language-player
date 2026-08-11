/**
 * Wide/bi-panel language picker layout (ADR-0017).
 *
 * Used on large screens (≥ 640px) in fullscreen mode.
 * Two columns side-by-side: L1 panel (left) and L2 panel (right).
 * Summary bar at bottom with script toggle and confirm button.
 */

'use client';

import React from 'react';
import { useT } from '@/hooks/use-t';
import { Search, Globe, BookOpen, ArrowRight, Check, X } from 'lucide-react';
import { languageName, isRTL, flagEmoji } from '@/lib/language-data';
import { isExperimentalL2 } from '@langplayer/shared';
import type {
  LanguageSection,
  UseLanguagePickerReturn,
} from '@langplayer/shared';

// ── Props ─────────────────────────────────────

interface LanguagePickerWideProps extends UseLanguagePickerReturn {
  onConfirm: () => void;
  showTitle?: boolean;
  getName: (code: string) => string;
  /** Resolver for L1 names (self-names). */
  getNameL1: (code: string) => string;
  /** Whether the L2 list (translated names) renders RTL — follows the UI locale. */
  l2Rtl?: boolean;
}

// ── Panel sub-component ───────────────────────

function LanguagePanel({
  title,
  step,
  icon,
  search,
  onSearchChange,
  sections,
  selectedCode,
  onSelect,
  accentColor,
  nativeNames,
  rtl = false,
  showSearch = true,
  showTitles = true,
  getName,
}: {
  title: string;
  /** Step number shown in the header badge (1 = L1, 2 = L2). */
  step: number;
  icon: React.ReactNode;
  search: string;
  onSearchChange: (q: string) => void;
  sections: LanguageSection[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  accentColor: 'primary' | 'accent';
  /** True when names are native self-names (L1) — apply RTL per language. */
  nativeNames: boolean;
  /** Whether translated names (L2) render RTL — follows the UI locale. */
  rtl?: boolean;
  /** Show the search field. L1 panel hides it. */
  showSearch?: boolean;
  /** Show section titles. L1 panel hides them. */
  showTitles?: boolean;
  getName: (code: string) => string;
}) {
  const t = useT();

  const isPrimary = accentColor === 'primary';
  const selectedBg = isPrimary ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground';
  const stepBg = isPrimary ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent';

  // True when at least one section has items (search can return empty).
  const hasResults = sections.some((s) => s.data.length > 0);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Panel header */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${stepBg}`}
          aria-hidden="true"
        >
          {step}
        </span>
        {icon}
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
      </div>

      {/* Search */}
      {showSearch !== false && (
        <div className="mb-3 flex items-center rounded-lg border border-input bg-background px-3 py-2 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="ml-2 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            placeholder={t('placeholder.search_languages')}
            autoCapitalize="none"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t('action.clear')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Language list */}
      <div className="h-80 overflow-y-auto pr-1">
        {hasResults ? (
          sections.map((section: LanguageSection) => (
            <div key={section.title} className="space-y-1 pb-2">
              {showTitles && section.title && (
                <div className="sticky top-0 z-10 bg-card px-1 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </div>
              )}
              {section.data.map((code) => {
                const isSelected = code === selectedCode;
                const isRtlRow = nativeNames ? isRTL(code) : rtl;
                return (
                  <button
                    key={code}
                    onClick={() => onSelect(code)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      isSelected
                        ? `${selectedBg} shadow-sm`
                        : 'text-foreground hover:bg-muted'
                    }`}
                    dir={isRtlRow ? 'rtl' : 'ltr'}
                  >
                    {!isPrimary && (
                      <span className="text-base leading-none" aria-hidden="true">
                        {flagEmoji(code)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{getName(code)}</span>
                    {!isPrimary && isExperimentalL2(code) && (
                      <span className="shrink-0 rounded-full border border-warm-500/30 bg-warm-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-600 dark:text-warm-400">
                        {t('label.experimental')}
                      </span>
                    )}
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
  );
}

// ── Component ─────────────────────────────────

export function LanguagePickerWide(props: LanguagePickerWideProps) {
  const {
    selectedL1,
    selectedL2,
    searchL1,
    searchL2,
    useTraditional,
    filteredL1,
    filteredL2,
    setSelectedL1,
    setSelectedL2,
    setSearchL1,
    setSearchL2,
    setUseTraditional,
    onConfirm,
    showTitle,
    getName,
    getNameL1,
    l2Rtl,
  } = props;

  const t = useT();

  return (
    <div className="w-full">
      {/* Header */}
      {showTitle && (
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-foreground">{t('title.welcome')}</h1>
          <p className="mt-2 text-muted-foreground">{t('msg.choose_languages')}</p>
        </div>
      )}

      {/* Bordered panel: two-column layout */}
      <div className="mb-4 rounded-xl border border-border bg-card p-6">
        <div className="flex gap-6">
          {/* L1 panel */}
          <LanguagePanel
            title={t('title.i_speak')}
            step={1}
            icon={<Globe className="h-5 w-5 text-primary" />}
            search={searchL1}
            onSearchChange={setSearchL1}
            sections={filteredL1}
            selectedCode={selectedL1}
            onSelect={setSelectedL1}
            accentColor="primary"
            nativeNames
            showSearch={false}
            showTitles={false}
            getName={getNameL1}
          />

          {/* L2 panel */}
          <LanguagePanel
            title={t('title.i_learning')}
            step={2}
            icon={<BookOpen className="h-5 w-5 text-accent" />}
            search={searchL2}
            onSearchChange={setSearchL2}
            sections={filteredL2}
            selectedCode={selectedL2}
            onSelect={setSelectedL2}
            accentColor="accent"
            nativeNames={false}
            rtl={l2Rtl ?? false}
            getName={getName}
          />
        </div>
      </div>

      {/* Summary bar */}
      {(selectedL1 || selectedL2) && (
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Script toggle for Chinese */}
              {selectedL2 === 'zh' && (
                <div className="flex rounded-lg border border-border bg-muted p-0.5">
                  <button
                    onClick={() => setUseTraditional(false)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      !useTraditional
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('setting.simplified')}
                  </button>
                  <button
                    onClick={() => setUseTraditional(true)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      useTraditional
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('setting.traditional')}
                  </button>
                </div>
              )}

              {/* Bottom action: Next (no L2 yet) or Start Learning */}
              {!selectedL2 ? (
                <button
                  disabled
                  aria-disabled="true"
                  className="flex max-w-full cursor-not-allowed items-center gap-1.5 rounded-lg bg-primary/50 px-5 py-2 text-left text-sm font-bold text-primary-foreground shadow-sm whitespace-normal"
                >
                  {t('action.next')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={onConfirm}
                  className="flex max-w-full items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-left text-sm font-bold text-primary-foreground shadow-sm transition-colors whitespace-normal hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t('action.start_learning_lang', { name: getName(selectedL2) })}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
