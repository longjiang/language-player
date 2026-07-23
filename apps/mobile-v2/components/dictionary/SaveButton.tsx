import React, { useState, useCallback } from 'react';
import { Pressable } from 'react-native';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useLanguage } from '@/contexts/LanguageContext';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import { Bookmark } from 'lucide-react-native';
import type { DictionaryEntry } from '@langplayer/shared';

interface SaveButtonProps {
  entry: DictionaryEntry;
  size?: number;
}

/**
 * Save/unsave button for dictionary entries.
 * Matches Next.js — bookmark icon, toggle on press.
 */
export function SaveButton({ entry, size = 22 }: SaveButtonProps) {
  const { l2Lang } = useLanguage();
  const { hasWord, saveWord, removeWord } = useSavedWords();
  const wordId = entry.id;
  const [saved, setSaved] = useState(() => hasWord(l2Lang.code, wordId));

  const handlePress = useCallback(() => {
    if (saved) {
      removeWord(l2Lang.code, wordId);
      setSaved(false);
    } else {
      saveWord(l2Lang.code, {
        id: wordId,
        head: entry.head,
        dictionaryId: entry.dictionary.id,
        entryId: entry.id,
      });
      setSaved(true);
    }
  }, [saved, l2Lang.code, wordId, entry.head, entry.dictionary.id, entry.id, saveWord, removeWord]);

  return (
    <Pressable onPress={handlePress} className="p-1" hitSlop={8}>
      <Bookmark
        size={size}
        color={saved ? ICON_PRIMARY : ICON_MUTED}
        fill={saved ? ICON_PRIMARY : 'none'}
      />
    </Pressable>
  );
}
