import React from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useT } from '@/hooks/use-t';
import type { DictionaryEntry, SavedWordContext } from '@langplayer/shared';
import type { SavedWordMeta } from '@/contexts/SavedWordsContext';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { BookmarkCheck } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

interface SavedWordEntryCardProps {
  word: SavedWordMeta;
  l1Code: string;
  l2Code: string;
  /** Called when the card is tapped (navigates to entry detail page). */
  onClick: () => void;
  /** Called when the user removes the word from saved words. */
  onRemove?: () => void;
}

/**
 * A single saved word on the saved-words page — the full DictionaryEntryCard
 * (compact variant) built from the lazily-enriched entry, with the saved word's
 * metadata (date/source/context) surfaced on the card. Mirrors the web
 * SavedWordEntryCard.
 *
 * Records that haven't been enriched yet render as a minimal head card with a
 * spinner; unresolvable records fall back to a head + remove row.
 */
export function SavedWordEntryCard({
  word,
  l1Code,
  l2Code,
  onClick,
  onRemove,
}: SavedWordEntryCardProps) {
  const t = useT();

  const head = word.head || word.forms?.[0] || word.id;
  const entry = word.canonicalEntry ?? null;

  // Normalize the enriched entry's id to the saved word's id so the card's
  // bookmark state + saved-metadata lookup (keyed on entry.id) stay tied to
  // the saved record (matches web's fetchSavedWordEntry normalization).
  const entryForCard: DictionaryEntry | null = entry
    ? (entry.id === word.id ? entry : { ...entry, id: word.id })
    : null;

  const hasContext = !!(word.context && (word.context as unknown as SavedWordContext).form);
  const safeCtx: SavedWordContext | undefined =
    word.context && hasContext
      ? (word.context as unknown as SavedWordContext)
      : { form: head, text: head, textTitle: '' };

  // Not yet enriched — loading placeholder while a lookup is in flight.
  // Known-unresolvable records (offline + online both missed) render a plain
  // head + remove row instead of spinning forever.
  if (!entryForCard && word.unresolvable) {
    return (
      <View className="rounded-xl border border-border bg-card px-4 pt-4 pb-2">
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 text-lg font-bold text-muted-foreground/60" numberOfLines={1}>
            {head}
          </Text>
          {onRemove && (
            <Pressable onPress={onRemove} className="rounded p-1" accessibilityLabel={t('action.remove_from_saved')}>
              <BookmarkCheck size={20} color="#f59e0b" fill="#f59e0b" />
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  if (!entryForCard) {
    return (
      <View className="rounded-xl border border-border bg-card px-4 pt-4 pb-2">
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 text-lg font-bold text-muted-foreground/60" numberOfLines={1}>
            {head}
          </Text>
          <ActivityIndicator size="small" color={ICON_MUTED} />
        </View>
        {onRemove && (
          <View className="mt-2 flex-row items-center justify-end">
            <Pressable onPress={onRemove} className="rounded p-1" accessibilityLabel={t('action.remove_from_saved')}>
              <BookmarkCheck size={20} color="#f59e0b" fill="#f59e0b" />
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <DictionaryEntryCard
      entry={entryForCard}
      variant="compact"
      l2Code={l2Code}
      l1Code={l1Code}
      saveContext={safeCtx}
      onPress={onClick}
    />
  );
}
