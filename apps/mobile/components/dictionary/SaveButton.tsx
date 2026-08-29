import React, { useState, useCallback } from 'react';
import { Pressable } from '@/components/ui/pressable';
import { useRouter } from 'expo-router';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ICON_SAVED, ICON_UNSAVED } from '@/lib/theme-colors';
import { Bookmark } from 'lucide-react-native';
import type { DictionaryEntry, SavedWordContext } from '@langplayer/shared';

interface SaveButtonProps {
  entry: DictionaryEntry;
  size?: number;
  /** Surrounding sentence + surface form, preserved with the saved word. */
  context?: SavedWordContext;
}

/**
 * Save/unsave button for dictionary entries.
 * Matches Next.js — bookmark icon, toggle on press.
 */
export function SaveButton({ entry, size = 22, context }: SaveButtonProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { l2Lang } = useLanguage();
  const { hasWord, saveWord, removeWord } = useSavedWords();
  const wordId = entry.id;
  const [saved, setSaved] = useState(() => hasWord(l2Lang.code, wordId));

  const handlePress = useCallback(() => {
    if (saved) {
      removeWord(l2Lang.code, wordId);
      setSaved(false);
    } else {
      if (authLoading) return;
      if (!user) {
        router.push('/login' as any);
        return;
      }
      saveWord(l2Lang.code, {
        id: wordId,
        head: entry.head,
        dictionaryId: entry.dictionary.id,
        entryId: entry.id,
        ...(context ? { context: context as unknown as Record<string, unknown> } : {}),
        ...(context?.form ? { forms: [context.form] } : {}),
      });
      setSaved(true);
    }
  }, [
    saved,
    l2Lang.code,
    wordId,
    entry.head,
    entry.dictionary.id,
    entry.id,
    saveWord,
    removeWord,
    user,
    authLoading,
    router,
  ]);

  return (
    <Pressable onPress={handlePress} className="p-1" hitSlop={8}>
      <Bookmark
        size={size}
        color={saved ? ICON_SAVED : ICON_UNSAVED}
        fill={saved ? ICON_SAVED : 'none'}
      />
    </Pressable>
  );
}
