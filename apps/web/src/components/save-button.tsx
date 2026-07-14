'use client';

import React, { useMemo } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import type { SavedWordContext } from '@langplayer/shared';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useLanguage } from '@/providers/language-provider';
import { resolveLegacyId } from '@/lib/legacy-word-resolver';
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
 *
 * Two-tier saved check:
 *   1. Direct ID match (current dictionary)
 *   2. Legacy ID resolution (Classic → current mapping)
 */
export function SaveButton({
  wordId,
  head,
  context,
  forms,
  size = 'icon',
}: SaveButtonProps) {
  const { hasSavedWord, getSavedWords, saveWord, removeSavedWord } = useSavedWordsContext();
  const { l2 } = useLanguage();
  const l2Code = l2.code;

  // Two-tier saved check: direct ID match + legacy ID resolution
  const saved = useMemo(() => {
    if (hasSavedWord(l2Code, wordId)) return true;
    // Legacy: check if any saved word resolves to this entry's ID
    const savedWords = getSavedWords(l2Code);
    return savedWords.some((sw) => {
      const possibleIds = resolveLegacyId(sw.id);
      return possibleIds.includes(wordId);
    });
  }, [l2Code, wordId, hasSavedWord, getSavedWords]);

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
