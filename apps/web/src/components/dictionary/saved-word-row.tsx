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
  /** SRS dot status. Omit to hide the dot. */
  srsDot?: React.ReactNode;
}

/**
 * A single saved word row used in both the saved-words page and the dictionary sidebar.
 * Uses WordListItem with: head + alt forms + contextForm + InlineDefinition +
 * context line + source + SRS dot (optional) + bookmark suffix.
 */
export function SavedWordRow({
  word,
  l1Code,
  l2Code,
  onClick,
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

  const headForm = word.forms[0] ?? '?';
  const altForms = word.forms.length > 1 ? word.forms.slice(1) : undefined;
  const contextForm = ctx.form !== headForm ? ctx.form : undefined;

  return (
    <WordListItem
      head={headForm}
      altForms={altForms}
      contextForm={contextForm}
      definitionSlot={<InlineDefinition wordId={word.id} l1Code={l1Code} l2Code={l2Code} />}
      contextSlot={
        ctx.text && ctx.text !== headForm ? (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">…{ctx.text}…</p>
        ) : undefined
      }
      sourceSlot={<SavedWordSource context={ctx} date={word.date} />}
      prefix={
        <>
          <button
            onClick={handleRemove}
            className="shrink-0 text-amber-500 transition-colors hover:text-red-500"
            title="Remove from saved words"
          >
            <BookmarkCheck className="h-5 w-5 fill-current" />
          </button>
          {srsDot}
        </>
      }
      onClick={onClick}
    />
  );
}
