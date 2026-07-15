'use client';

import type { DictionaryEntry, SavedWordContext } from '@langplayer/shared';
import { BookOpen, ChevronRight, Volume2 } from 'lucide-react';
import { SaveButton } from './save-button';

interface DictionaryEntryCardProps {
  entry: DictionaryEntry;
  /** Language-specific level label formatter */
  levelLabel?: (scale: string, value: string | number) => string;
  /** Called when the card is clicked */
  onClick?: (entry: DictionaryEntry) => void;
  /** Optional context for the save/bookmark button. Omit to hide. */
  saveContext?: SavedWordContext;
  /** Pre-formatted pronunciation string (e.g. "[ní hǎo]"). Uses centralized formatPronunciation. */
  pronunciation?: string | null;
  /** ISO 639-1 code of the target language (for correct font rendering). */
  l2Code?: string;
}

/** Renders a single dictionary lookup result. */
export function DictionaryEntryCard({ entry, levelLabel, onClick, saveContext, pronunciation, l2Code }: DictionaryEntryCardProps) {
  const level = entry.level;
  const levelText = level && levelLabel
    ? levelLabel(level.scale, level.value)
    : level
      ? `${level.scale.replace('_', ' ').toUpperCase()}: ${level.value}`
      : null;

  return (
    <div
      className="rounded-lg border bg-card p-3 text-sm shadow-sm transition-colors hover:bg-muted/30 cursor-pointer"
      onClick={() => onClick?.(entry)}
    >
      {/* ── Header: head + pronunciation ── */}
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold" lang={l2Code}>
          {entry.head}
        </span>
        {pronunciation !== undefined
          ? (pronunciation && (
              <span className="text-xs text-muted-foreground">{pronunciation}</span>
            ))
          : (entry.pronunciation && (
              <span className="text-xs text-muted-foreground">
                /{entry.pronunciation}/
              </span>
            ))
        }
        {levelText && (
          <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {levelText}
          </span>
        )}
        {entry.part_of_speech && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {entry.part_of_speech}
          </span>
        )}
      </div>

      {/* ── Alternate script ── */}
      {entry.alternate && (
        <div className="mt-0.5 text-xs text-muted-foreground" lang={l2Code}>
          {entry.alternate}
        </div>
      )}

      {/* ── Definitions ── */}
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

      {/* ── Classifiers ── */}
      {entry.classifier && entry.classifier.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
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

      {/* ── Footer: source + match type ── */}
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        <BookOpen className="h-3 w-3" />
        <span>{entry.dictionary?.name ?? entry.source}</span>
        {entry.match_type && entry.match_type !== 'exact' && (
          <span className="rounded bg-amber-100 px-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {entry.match_type}
          </span>
        )}
        {saveContext && (
          <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
            <SaveButton
              wordId={entry.id}
              head={entry.head}
              context={saveContext}
              size="icon"
            />
          </div>
        )}
      </div>
    </div>
  );
}
