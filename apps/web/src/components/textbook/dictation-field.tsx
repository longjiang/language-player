'use client';

import React, { useCallback, useSyncExternalStore } from 'react';
import { indexToCircled } from '@langplayer/textbooks';
import { SpellCharInput } from '@/components/review/spell-char-input';
import { useTextbookTask } from './task-provider';
import { InlineTrackButton } from './inline-track-button';
import { useT } from '@/hooks/use-t';

/**
 * Dictation: one numbered item typed into boxed per-character fields.
 *
 * Wraps the SRS review page's `SpellCharInput` rather than reimplementing it.
 * That component is deliberately IME-safe — a single real text field whose value
 * is distributed one character per box — which is exactly what dictation needs
 * and is the kind of thing that is easy to get subtly wrong twice.
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
    <div className="flex items-start gap-2">
      <span className="w-5 shrink-0 pt-1.5 text-sm text-muted-foreground" aria-hidden>
        {label}
      </span>
      <SpellCharInput
        value={value}
        onChange={(next) => ctx!.store.setValue(blankId, next)}
        // Enter has no submit semantics inside a task (the shell owns submit),
        // so this is a no-op rather than a nav action.
        onSubmit={() => {}}
        expectedLength={blank.expectedLength ?? blank.answer.length}
        label={`${t('action.hint')} ${label}`}
        firstCharPlaceholder={value ? undefined : blank.answer.charAt(0)}
      />
    </div>
  );
}

/**
 * A dictation stimulus: numbered items, each a boxed field.
 *
 * Each item's recording is played from a control beside it — E ➊/➋ anchor one
 * track per item — so a student hears the word and types it without leaving the
 * row.
 */
export function Dictation({ ids }: { ids: string[] }) {
  const ctx = useTextbookTask();
  return (
    <div className="flex flex-col gap-3">
      {ids.map((id) => (
        <div key={id} className="flex items-center gap-2">
          <InlineTrackButton blankId={id} tracks={ctx?.task.audio} />
          <DictationField blankId={id} />
        </div>
      ))}
    </div>
  );
}
