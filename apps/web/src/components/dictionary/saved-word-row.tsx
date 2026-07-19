'use client';

import React from 'react';
import { BookmarkCheck } from 'lucide-react';
import { WordListItem } from '@/components/dictionary/word-list';
import { InlineDefinition } from '@/components/dictionary/inline-definition';
import { SavedWordSource } from '@/components/saved-word-source';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { normalizeInstances } from '@/hooks/use-saved-words';
import type { SavedLexicalItemRecord } from '@langplayer/shared';

interface SavedWordRowProps {
  word: SavedLexicalItemRecord;
  l1Code: string;
  l2Code: string;
  onClick: () => void;
  /** When true, renders a compact version suitable for narrow sidebars (no SRS dot, no context/source lines). */
  compact?: boolean;
  /** SRS dot status. Omit to hide the dot. */
  srsDot?: React.ReactNode;
}

/**
 * A single saved word row used in both the saved-words page and the dictionary sidebar.
 *
 * - Full mode: head + alt forms + InlineDefinition + context line + source + bookmark suffix
 * - Compact mode (sidebar): head + InlineDefinition + bookmark on hover
 */
export function SavedWordRow({
  word,
  l1Code,
  l2Code,
  onClick,
  compact = false,
  srsDot,
}: SavedWordRowProps) {
  const { removeSavedWord } = useSavedWordsContext();
  const insts = normalizeInstances(word);
  const latest = insts[insts.length - 1];
  const ctx = latest?.context ?? word.context;

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeSavedWord(l2Code, word.id);
  };

  if (compact) {
    return (
      <div
        className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors cursor-pointer hover:bg-muted"
        onClick={onClick}
        title={word.forms[0]}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate" lang={l2Code}>
              {word.forms[0] ?? '?'}
            </span>
            <button
              onClick={handleRemove}
              className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
              title="Remove from saved words"
            >
              <BookmarkCheck className="h-4 w-4" />
            </button>
          </div>
          <InlineDefinition wordId={word.id} l1Code={l1Code} l2Code={l2Code} />
        </div>
      </div>
    );
  }

  return (
    <WordListItem
      head={word.forms[0] ?? '?'}
      altForms={word.forms.length > 1 ? word.forms.slice(1) : undefined}
      contextForm={ctx.form !== word.forms[0] ? ctx.form : undefined}
      definitionSlot={<InlineDefinition wordId={word.id} l1Code={l1Code} l2Code={l2Code} />}
      contextSlot={
        ctx.text && ctx.text !== word.forms[0] ? (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">…{ctx.text}…</p>
        ) : undefined
      }
      sourceSlot={<SavedWordSource context={ctx} date={word.date} />}
      prefix={srsDot}
      suffix={
        <button
          onClick={handleRemove}
          className="shrink-0 rounded p-1 text-amber-500 transition-colors hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          title="Remove from saved words"
        >
          <BookmarkCheck className="h-5 w-5 fill-current" />
        </button>
      }
      onClick={onClick}
    />
  );
}
