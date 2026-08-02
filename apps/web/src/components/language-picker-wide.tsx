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
import { Search, Globe, BookOpen, ArrowRight } from 'lucide-react';
import { languageName, isRTL } from '@/lib/language-data';
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
}

// ── Panel sub-component ───────────────────────

function LanguagePanel({
  title,
  icon,
  search,
  onSearchChange,
  sections,
  selectedCode,
  onSelect,
  accentColor,
  getName,
}: {
  title: string;
  icon: React.ReactNode;
  search: string;
  onSearchChange: (q: string) => void;
  sections: LanguageSection[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  accentColor: 'primary' | 'accent';
  getName: (code: string) => string;
}) {
  const t = useT();

  const isPrimary = accentColor === 'primary';
  const selectedBg = isPrimary ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground';

  return (
    <div className="flex-1">
      {/* Panel header */}
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
      </div>

      {/* Search */}
      <div className="mb-3 flex items-center rounded-lg border border-input bg-background px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="ml-2 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          placeholder={t('placeholder.search_languages')}
          autoCapitalize="none"
        />
      </div>

      {/* Language list */}
      <div className="h-80 space-y-1 overflow-y-auto">
        {sections.map((section: LanguageSection) => (
          <div key={section.title}>
            {section.title && (
              <div className="px-1 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </div>
            )}
            {section.data.map((code) => {
              const isSelected = code === selectedCode;
              return (
                <button
                  key={code}
                  onClick={() => onSelect(code)}
                  className={`flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors ${
                    isSelected
                      ? selectedBg
                      : 'hover:bg-muted text-foreground'
                  }`}
                  dir={isRTL(code) ? 'rtl' : 'ltr'}
                >
                  <span>{getName(code)}</span>
                  <span className={`text-xs ${isSelected ? 'opacity-70' : 'text-muted-foreground'}`}>
                    {code.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
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
            icon={<Globe className="h-5 w-5 text-primary" />}
            search={searchL1}
            onSearchChange={setSearchL1}
            sections={filteredL1}
            selectedCode={selectedL1}
            onSelect={setSelectedL1}
            accentColor="primary"
            getName={getNameL1}
          />

          {/* L2 panel */}
          <LanguagePanel
            title={t('title.i_learning')}
            icon={<BookOpen className="h-5 w-5 text-accent" />}
            search={searchL2}
            onSearchChange={setSearchL2}
            sections={filteredL2}
            selectedCode={selectedL2}
            onSelect={setSelectedL2}
            accentColor="accent"
            getName={getName}
          />
        </div>
      </div>

      {/* Summary bar */}
      {(selectedL1 || selectedL2) && (
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-center gap-3">
            {/* Selection pills */}
            <div className="rounded-full border border-border bg-muted px-4 py-1.5 text-sm">
              <span className="text-muted-foreground">{t('title.i_speak')}: </span>
              <span className="font-bold text-foreground">
                {selectedL1 ? getNameL1(selectedL1) : '?'}
              </span>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="rounded-full border border-border bg-muted px-4 py-1.5 text-sm">
              <span className="text-muted-foreground">{t('title.learning_label')} </span>
              <span className="font-bold text-foreground">
                {selectedL2 ? getName(selectedL2) : '?'}
              </span>
            </div>

            {/* Script toggle for Chinese */}
            {selectedL2 === 'zh' && (
              <div className="ml-2 flex rounded-lg border border-border bg-muted p-0.5">
                <button
                  onClick={() => setUseTraditional(false)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    !useTraditional
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('setting.simplified')}
                </button>
                <button
                  onClick={() => setUseTraditional(true)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    useTraditional
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('setting.traditional')}
                </button>
              </div>
            )}

            {/* Continue button */}
            {selectedL1 && selectedL2 && (
              <button
                onClick={onConfirm}
                className="ml-2 flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {t('action.continue')}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
