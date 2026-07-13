'use client';

import type { DictionaryEntry } from '@langplayer/shared';
import { BookOpen, ChevronRight, Volume2 } from 'lucide-react';

interface DictionaryEntryCardProps {
  entry: DictionaryEntry;
  /** Language-specific level label formatter */
  levelLabel?: (scale: string, value: string | number) => string;
  /** Called when the card is clicked */
  onClick?: (entry: DictionaryEntry) => void;
}

/** Renders a single dictionary lookup result. */
export function DictionaryEntryCard({ entry, levelLabel, onClick }: DictionaryEntryCardProps) {
  const level = entry.level;
  const levelText = level && levelLabel
    ? levelLabel(level.scale, level.value)
    : level
      ? `${level.scale.replace('_', ' ').toUpperCase()}: ${level.value}`
      : null;

  return (
    <div
      className="rounded-lg border bg-card p-3 text-sm shadow-sm transition-colors hover:bg-accent/50 cursor-pointer"
      onClick={() => onClick?.(entry)}
    >
      {/* ── Header: head + pronunciation ── */}
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold" lang={entry.source}>
          {entry.head}
        </span>
        {entry.pronunciation && (
          <span className="text-xs text-muted-foreground">
            /{entry.pronunciation}/
          </span>
        )}
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
        <div className="mt-0.5 text-xs text-muted-foreground" lang={entry.source}>
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

      {/* ── Footer: source + match type ── */}
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        <BookOpen className="h-3 w-3" />
        <span>{entry.source}</span>
        {entry.match_type && entry.match_type !== 'exact' && (
          <span className="rounded bg-amber-100 px-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {entry.match_type}
          </span>
        )}
      </div>
    </div>
  );
}
