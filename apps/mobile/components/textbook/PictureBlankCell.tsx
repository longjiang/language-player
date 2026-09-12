import React, { useCallback, useMemo, useSyncExternalStore } from 'react';
import { Pressable, Text } from 'react-native';
import { pictureSetsIn, type BlankResult, type BlankSpec } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTextbookTask } from './task-provider';
import { useBlankChoice } from './BlankChoice';

/**
 * A picture-set blank as the small cell the workbook prints for it.
 *
 * Wherever the workbook shows a blank and not a picture box — the map's `( )` brackets
 * (A ➊), the `① ___` rows (A ➋, C ➊/➋), a table cell (A ➌) — the blank is a compact
 * rounded square in a faded primary tint, so it reads as tappable without a label, and
 * it shows the chosen letter. Tapping it opens the picture choices.
 *
 * The tap target is deliberately larger than the cell: on a phone the map renders at a
 * fraction of its natural width, where the cell is a few points across. `hitSlop` grows
 * the touchable area without changing what is drawn.
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
      ? 'border-green-600 bg-green-500/10'
      : 'border-destructive bg-destructive/10'
    : null;

  // A worked example from the workbook (西安 prints its A) is not the student's to
  // change, so it is the same cell without the affordance.
  if (blank.kind === 'given') {
    return (
      <Text className="rounded-md border border-dashed border-border bg-muted/40 px-1.5 text-sm font-medium text-foreground">
        {blank.answer}
      </Text>
    );
  }

  return (
    <Pressable
      onPress={() => choice?.open(blank.id)}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={item ? `${item.letter}. ${item.label}` : t('label.pick_illustration')}
      className={`h-6 min-w-9 items-center justify-center rounded-md border px-1.5 ${
        verdictClass ??
        (isSelected ? 'border-primary bg-primary/20' : 'border-primary/40 bg-primary/10')
      }`}
    >
      <Text className="text-sm font-semibold text-primary">{value || '?'}</Text>
    </Pressable>
  );
}
