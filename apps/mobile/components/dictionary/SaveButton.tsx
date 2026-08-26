import React, { useState, useCallback } from 'react';
import { Pressable } from '@/components/ui/pressable';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/hooks/use-t';
import { ICON_ON_PRIMARY, ICON_UNSAVED } from '@/lib/theme-colors';
import { Bookmark } from 'lucide-react-native';
import type { DictionaryEntry, SavedWordContext } from '@langplayer/shared';

interface SaveButtonProps {
  entry: DictionaryEntry;
  size?: number;
  /** Surrounding sentence + surface form, preserved with the saved word. */
  context?: SavedWordContext;
}

/**
 * Save/unsave button for dictionary entries — a small bordered button with
 * the bookmark icon + "Save Word" / "Saved" label (a larger touch target
 * than a bare bookmark icon, matching the full entry card's save control).
 */
export function SaveButton({ entry, size = 18, context }: SaveButtonProps) {
  const router = useRouter();
  const t = useT();
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
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={saved ? t('action.remove_from_saved') : t('action.save_word')}
      className={`flex-row items-center rounded-md border px-2 py-1 ${
        saved ? 'border-amber-500 bg-amber-500' : 'border-amber-500/50'
      }`}
    >
      <Bookmark
        size={size}
        color={saved ? ICON_ON_PRIMARY : ICON_UNSAVED}
        fill={saved ? ICON_ON_PRIMARY : 'none'}
        style={{ marginRight: 4 }}
      />
      <Text className={`text-xs font-medium ${saved ? 'text-white' : 'text-amber-500/80'}`}>
        {saved ? t('label.saved') : t('action.save_word')}
      </Text>
    </Pressable>
  );
}
