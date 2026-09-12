import React, { useCallback, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { indexToCircled } from '@langplayer/textbooks';
import { SpellCharInput } from '@/components/review/SpellCharInput';
import { useTextbookTask } from './task-provider';
import { useT } from '@/hooks/use-t';

/**
 * Dictation: one numbered item typed into boxed per-character fields.
 *
 * Wraps the review page's `SpellCharInput`, which is already IME-safe — a single
 * real text field whose value is distributed one character per box — and is
 * exactly what dictation needs. Reimplementing it would risk the IME handling
 * that makes CJK entry work.
 *
 * The box count comes from `expectedLength`, which for dictation is the
 * workbook's printed box count rather than the answer length.
 */
export function DictationField({ blankId }: { blankId: string }) {
  const ctx = useTextbookTask();
  const t = useT();
  const blank = ctx?.task.blanks?.[blankId];

  const getValue = useCallback(() => ctx!.store.getValue(blankId), [ctx, blankId]);
  const value = useSyncExternalStore(ctx!.store.subscribe, getValue, getValue);

  if (!blank) return null;

  const n = Number(blankId.replace(/^b/, ''));
  const label = Number.isFinite(n) ? indexToCircled(n) : blankId;

  return (
    <View className="flex-row items-start gap-2">
      <Text className="w-5 pt-1.5 text-sm text-muted-foreground">{label}</Text>
      <SpellCharInput
        value={value}
        onChange={(next) => ctx!.store.setValue(blankId, next)}
        expectedLength={blank.expectedLength ?? blank.answer.length}
        label={`${t('action.hint')} ${label}`}
        firstCharPlaceholder={value ? undefined : blank.answer.charAt(0)}
      />
    </View>
  );
}

/** A dictation stimulus: numbered items, each a boxed field. */
export function Dictation({ ids }: { ids: string[] }) {
  return (
    <View className="gap-3">
      {ids.map((id) => (
        <DictationField key={id} blankId={id} />
      ))}
    </View>
  );
}
