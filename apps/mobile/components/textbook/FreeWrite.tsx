import React, { useCallback, useSyncExternalStore } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useTextbookTask } from './task-provider';
import { PLACEHOLDER_COLOR } from '@/lib/theme-colors';

/**
 * An open writing surface.
 *
 * Backed by a `free` blank, which is recorded but never scored — there is no
 * correct answer to a free-writing prompt, and grading one would be worse than
 * not asking. The text still persists with the rest of the attempt.
 */
export function FreeWrite({ blankId, rows = 6 }: { blankId: string; rows?: number }) {
  const ctx = useTextbookTask();

  const getValue = useCallback(() => ctx!.store.getValue(blankId), [ctx, blankId]);
  const value = useSyncExternalStore(ctx!.store.subscribe, getValue, getValue);

  // RN has no `rows`; approximate a text area from the line height.
  const height = rows * 24 + 20;

  return (
    <TextInput
      value={value}
      onChangeText={(next) => ctx!.store.setValue(blankId, next)}
      multiline
      textAlignVertical="top"
      placeholderTextColor={PLACEHOLDER_COLOR}
      style={{ height }}
      className="w-full rounded-lg border border-border bg-card p-3 text-base text-foreground"
    />
  );
}

/**
 * Note-taking into titled cards.
 *
 * D ➏: the student listens and writes notes under five topics. The workbook
 * pre-fills the 路线 card's first two lines as a worked example, so these are
 * blank fields the student continues rather than pre-filled inputs.
 */
export function NoteCards({ cards }: { cards: Array<{ blankId: string; title: string }> }) {
  return (
    <View className="gap-3">
      {cards.map((card) => (
        <View key={card.blankId} className="gap-1.5 rounded-lg border border-border p-3">
          <Text className="text-sm font-medium text-foreground">{card.title}</Text>
          <FreeWrite blankId={card.blankId} rows={4} />
        </View>
      ))}
    </View>
  );
}
