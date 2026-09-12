'use client';

import React, { useCallback, useMemo, useSyncExternalStore } from 'react';
import { pictureSetsIn, type BlankResult, type BlankSpec } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTextbookTask } from './task-provider';
import { useBlankChoice } from './blank-choice';

/**
 * A picture-set blank as the small cell the workbook prints for it.
 *
 * Wherever the workbook shows a blank and not a picture box — the map's `( )` brackets
 * (A ➊), the `① ___` rows (A ➋, C ➊/➋), a table cell (A ➌) — the blank is a compact
 * rounded square in a faded primary tint, so it reads as tappable without a label, and
 * it shows the chosen letter. Tapping it opens the picture choices.
 *
 * This is deliberately *not* used inside a running passage, where the workbook prints a
 * box for an illustration and `InlineImageSlot` fills it with the picture instead
 * (B ➎/➏). Same blank kind, same dialog, two printings.
 */
export function PictureBlankCell({
  blank,
  value,
  result,
}: {
  blank: BlankSpec;
  value: string;
  result?: BlankResult;
}) {
  const t = useT();
  const ctx = useTextbookTask()!;
  const choice = useBlankChoice();

  const getSelected = useCallback(() => ctx.selection.get() === blank.id, [ctx, blank.id]);
  const isSelected = useSyncExternalStore(ctx.selection.subscribe, getSelected, getSelected);

  // When filled, the picture's own label names the cell — that is content, not chrome.
  const item = useMemo(() => {
    const set = blank.optionSet ? pictureSetsIn(ctx.task).get(blank.optionSet) : undefined;
    return set?.items.find((i) => i.letter === value);
  }, [ctx.task, blank.optionSet, value]);

  const verdictClass = result
    ? result.correct
      ? 'border-green-600 bg-green-500/10 text-foreground'
      : 'border-destructive bg-destructive/10 text-foreground'
    : null;

  // A worked example from the workbook (西安 prints its A) is not the student's to
  // change, so it is the same cell without the affordance.
  if (blank.kind === 'given') {
    return (
      <span
        className="inline-flex h-6 min-w-9 items-center justify-center rounded-md border border-dashed border-muted-foreground/50 bg-muted/40 px-1.5 align-middle text-sm font-medium text-foreground"
        title={t('review.spell_correct_answer', { answer: blank.answer })}
      >
        {blank.answer}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => choice?.open(blank.id)}
      aria-label={item ? `${item.letter}. ${item.label}` : t('label.pick_illustration')}
      aria-pressed={isSelected}
      className={`inline-flex h-6 min-w-9 items-center justify-center rounded-md border px-1.5 align-middle text-sm font-semibold transition-colors ${
        verdictClass ??
        (isSelected
          ? 'border-primary bg-primary/20 text-primary'
          : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20')
      }`}
    >
      {value || <span aria-hidden className="text-primary/50">?</span>}
    </button>
  );
}
