'use client';

import type { DictionaryEntry, SavedWordContext } from '@langplayer/shared';
import { BookOpen, ExternalLink, Volume2 } from 'lucide-react';
import { SaveButton } from './save-button';
import { SpeakButton } from './speak-button';
import { formatPronunciation } from '@langplayer/utils';
import { useScriptPreference } from '@/hooks/use-script-preference';

interface DictionaryEntryCardProps {
  entry: DictionaryEntry;
  /** 'compact' = popup/list view; 'full' = detail page view */
  variant?: 'compact' | 'full';
  /** Language-specific level label formatter */
  levelLabel?: (scale: string, value: string | number) => string;
  /** Called when the card is clicked (navigates to entry detail page) */
  onClick?: (entry: DictionaryEntry) => void;
  /** Context for the save/bookmark button. Omit to hide (compact) or show (full). */
  saveContext?: SavedWordContext;
  /** Pre-formatted pronunciation string. Uses centralized formatPronunciation if omitted. */
  pronunciation?: string | null;
  /** ISO 639-1 code of the target language (for script preference + font rendering). */
  l2Code?: string;
  /** ISO 639-1 code of the user's L1 (for SpeakButton language context). */
  l1Code?: string;
  /** WAI-ARIA heading level for the headword (full mode defaults to h1). */
  headingLevel?: 'h1' | 'h2' | 'h3';
}

/** Renders a single dictionary lookup result — compact in popups, full on detail pages. */
export function DictionaryEntryCard({
  entry,
  variant = 'compact',
  levelLabel,
  onClick,
  saveContext,
  pronunciation,
  l2Code,
  l1Code,
  headingLevel = 'h1',
}: DictionaryEntryCardProps) {
  const { apply } = useScriptPreference(l2Code ?? '');
  const { head, alternate } = apply(entry.head, entry.alternate);
  const isFull = variant === 'full';

  const level = entry.level;
  const levelText = level && levelLabel
    ? levelLabel(level.scale, level.value)
    : level
      ? `${level.scale.replace('_', ' ').toUpperCase()}: ${level.value}`
      : null;

  const formattedPron = pronunciation !== undefined
    ? pronunciation
    : formatPronunciation(entry, l2Code ?? '');

  // ── Shared: level + POS badges ──
  const badges = (
    <>
      {levelText && (
        <span className={isFull
          ? "rounded-md bg-blue-100 px-2.5 py-1 text-sm font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
          : "ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        }>
          {levelText}
        </span>
      )}
      {entry.part_of_speech && (
        <span className={isFull
          ? "rounded-md bg-muted px-2.5 py-1 text-sm font-medium text-muted-foreground"
          : "shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        }>
          {entry.part_of_speech}
        </span>
      )}
    </>
  );

  // ── Shared: source line ──
  const sourceLine = (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {isFull ? <ExternalLink className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
      <span>{entry.dictionary?.name ?? entry.source}</span>
      {entry.match_type && entry.match_type !== 'exact' && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {entry.match_type}
        </span>
      )}
    </div>
  );

  // ── Shared: save button ──
  const saveBtn = (size: 'icon' | 'default' = 'icon') => saveContext ? (
    <div onClick={(e) => e.stopPropagation()}>
      <SaveButton
        wordId={entry.id}
        head={entry.head}
        context={saveContext}
        size={size}
      />
    </div>
  ) : null;

  // ── COMPACT variant ──
  if (!isFull) {
    return (
      <div
        className="rounded-lg border bg-card p-3 text-sm shadow-sm transition-colors hover:bg-muted/30 cursor-pointer"
        onClick={() => onClick?.(entry)}
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold" lang={l2Code}>{head}</span>
          {alternate && (
            <span className="text-xs text-muted-foreground" lang={l2Code}>{alternate}</span>
          )}
          {formattedPron && (
            <span className="text-xs text-muted-foreground">{formattedPron}</span>
          )}
          {badges}
        </div>

        {/* Definitions */}
        {entry.definitions.length > 0 && (
          <div className="mt-2 space-y-1">
            {entry.definitions.map((def, i) => (
              <p key={i} className="text-sm leading-relaxed">
                {entry.definitions.length > 1 && (
                  <span className="mr-1 text-xs text-muted-foreground">{i + 1}.</span>
                )}
                {def}
              </p>
            ))}
          </div>
        )}

        {/* Classifiers */}
        {entry.classifier && entry.classifier.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-medium text-muted-foreground mr-0.5">
              {entry.classifier[0]!.kind === 'measure_word' ? 'CL:' :
               entry.classifier[0]!.kind === 'gender' ? 'Gender:' : 'Class:'}
            </span>
            {entry.classifier.map((cl, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs"
                title={cl.kind === 'measure_word'
                  ? `Measure word: ${cl.traditional} (${cl.reading})`
                  : cl.kind === 'gender'
                    ? `Gender: ${cl.value}`
                    : `Noun class: ${cl.value}`}
              >
                {cl.kind === 'measure_word' ? (
                  <>
                    <span className="font-medium" lang="zh">{cl.simplified}</span>
                    <span className="text-muted-foreground">{cl.reading}</span>
                  </>
                ) : cl.kind === 'gender' ? (
                  <span className="text-muted-foreground">{cl.value}</span>
                ) : (
                  <span className="text-muted-foreground">{cl.value}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-2 flex items-center gap-2 text-[10px]">
          {sourceLine}
          {saveContext && <div className="ml-auto">{saveBtn()}</div>}
        </div>
      </div>
    );
  }

  // ── FULL variant ──
  const HeadTag = headingLevel;
  return (
    <div
      className={onClick
        ? "rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md hover:border-primary/20 cursor-pointer transition-all"
        : "rounded-xl border border-border bg-card p-6 shadow-sm"
      }
      onClick={() => onClick?.(entry)}
    >
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <HeadTag className="text-4xl font-bold" lang={l2Code}>
                {head}
              </HeadTag>
              {alternate && (
                <span className="text-xl text-muted-foreground" lang={l2Code}>
                  {alternate}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              {formattedPron && (
                <span className="flex items-center gap-1 text-lg text-muted-foreground" lang={l2Code}>
                  <SpeakButton text={entry.head} l2Code={l2Code ?? ''} size="default" />
                  {formattedPron}
                </span>
              )}
              {badges}
            </div>
          </div>

          {saveContext && saveBtn('default')}
        </div>
      </div>

      {/* Definitions */}
      {entry.definitions.length > 0 && (
        <div className="mb-6 rounded-lg bg-muted/40 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Definitions
          </h3>
          <ul className="space-y-2">
            {entry.definitions.map((def, i) => (
              <li key={i} className="flex items-start gap-2 text-base leading-relaxed">
                {entry.definitions.length > 1 && (
                  <span className="mt-0.5 flex-shrink-0 text-sm text-muted-foreground">
                    {i + 1}.
                  </span>
                )}
                <span>{def}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Classifiers */}
      {entry.classifier && entry.classifier.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Classifiers
          </h3>
          <div className="flex flex-wrap gap-2">
            {entry.classifier.map((cl, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm"
              >
                {cl.kind === 'measure_word' ? (
                  <>
                    <span className="font-medium" lang="zh">{cl.simplified}</span>
                    <span className="text-muted-foreground">{cl.reading}</span>
                  </>
                ) : cl.kind === 'gender' ? (
                  <span className="text-muted-foreground">{cl.value}</span>
                ) : (
                  <span className="text-muted-foreground">{cl.value}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Han script detail */}
      {entry.han_script && (entry.han_script.traditional || entry.han_script.simplified) && (
        <div className="mb-6 flex gap-4 text-sm text-muted-foreground">
          {entry.han_script.simplified && entry.han_script.simplified !== entry.head && (
            <span>简: {entry.han_script.simplified}</span>
          )}
          {entry.han_script.traditional && entry.han_script.traditional !== entry.head && (
            <span>繁: {entry.han_script.traditional}</span>
          )}
        </div>
      )}

      {/* Phonetic detail */}
      {entry.phonetic_detail && typeof entry.phonetic_detail === 'object' && (
        <div className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground/70">
          {Object.entries(entry.phonetic_detail).map(([key, value]) => {
            // Skip keys already shown prominently elsewhere
            if (key === 'romaji' || key === 'pinyin' || key === 'jyutping') return null;
            // Skip IPA if it's identical to the pronunciation already shown
            if (key === 'ipa' && !isFull) return null;
            if (key === 'ipa' && value === entry.pronunciation) return null;
            if (typeof value === 'string' && value) {
              return <span key={key}>{key}: {value}</span>;
            }
            return null;
          })}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2">
        {sourceLine}
        {saveContext && !entry.classifier && (
          <div className="ml-auto">{saveBtn()}</div>
        )}
      </div>
    </div>
  );
}
