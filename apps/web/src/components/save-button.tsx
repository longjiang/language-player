'use client';

import React from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import type { SavedWordContext } from '@langplayer/shared';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';

interface SaveButtonProps {
  /** Dictionary entry ID (e.g., "cedict-0", "llm-zh-abc123") */
  wordId: string;
  /** Canonical head form */
  head: string;
  /** Context: where/how the word is being saved */
  context: SavedWordContext;
  /** Additional alternate forms (future: inflections). Defaults to [head]. */
  forms?: string[];
  /** Visual size */
  size?: 'sm' | 'default' | 'icon';
}

/**
 * Bookmark toggle button for saving/removing words from the vocabulary list.
 * Mirrors Classic's Star.vue + GO's BookmarkButton.
 */
export function SaveButton({
  wordId,
  head,
  context,
  forms,
  size = 'icon',
}: SaveButtonProps) {
  const { hasSavedWord, saveWord, removeSavedWord } = useSavedWordsContext();
  const { l2 } = useLanguage();
  const l2Code = l2.code;
  const saved = hasSavedWord(l2Code, wordId);

  const handleToggle = () => {
    if (saved) {
      removeSavedWord(l2Code, wordId);
    } else {
      saveWord(l2Code, {
        id: wordId,
        forms: forms ?? [head],
        date: Date.now(),
        context,
      });
    }
  };

  if (size === 'icon') {
    return (
      <button
        onClick={handleToggle}
        className={`p-1 rounded transition-colors ${
          saved
            ? 'text-amber-500 hover:text-amber-600'
            : 'text-muted-foreground hover:text-amber-500'
        }`}
        title={saved ? 'Remove from saved words' : 'Save word'}
      >
        {saved ? (
          <BookmarkCheck className="h-5 w-5 fill-current" />
        ) : (
          <Bookmark className="h-5 w-5" />
        )}
      </button>
    );
  }

  return (
    <Button
      variant={saved ? 'secondary' : 'outline'}
      size={size}
      onClick={handleToggle}
      className="gap-1.5"
    >
      {saved ? (
        <>
          <BookmarkCheck className="h-4 w-4" />
          Saved
        </>
      ) : (
        <>
          <Bookmark className="h-4 w-4" />
          Save Word
        </>
      )}
    </Button>
  );
}
