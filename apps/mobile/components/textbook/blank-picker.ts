import { useCallback, useSyncExternalStore } from 'react';
import { useTextbookTask } from './task-provider';

export interface BlankPicker {
  /** The blank the next pick will fill, or null. */
  selected: string | null;
  /** Fill the selected blank, then advance to the next empty one. */
  pick: (value: string) => void;
  /** Responses by blank id, for dimming already-used options. */
  responses: Record<string, string>;
}

/**
 * Shared "tap an option to fill the selected blank" behaviour.
 *
 * The word bank and the picture sets are the same interaction with different
 * affordances, so they share this rather than each re-implementing the
 * advance-to-next-empty step. Advancing matters: the workbook prints a bank once
 * and reuses it across several blanks, so a student answers a run with one tap
 * each.
 */
export function useBlankPicker(): BlankPicker {
  const ctx = useTextbookTask();

  const selected = useSyncExternalStore(
    ctx!.selection.subscribe,
    useCallback(() => ctx!.selection.get(), [ctx]),
    useCallback(() => ctx!.selection.get(), [ctx]),
  );

  const responses = useSyncExternalStore(
    ctx!.store.subscribe,
    useCallback(() => ctx!.store.getResponsesSnapshot(), [ctx]),
    useCallback(() => ctx!.store.getResponsesSnapshot(), [ctx]),
  );

  const pick = useCallback(
    (value: string) => {
      if (!selected) return;
      ctx!.store.setValue(selected, value);
      const blanks = Object.values(ctx!.task.blanks ?? {}).filter((b) => b.kind !== 'given');
      const at = blanks.findIndex((b) => b.id === selected);
      const after = blanks.slice(at + 1).find((b) => !(responses[b.id] ?? '').trim());
      ctx!.selection.set(after?.id ?? null);
    },
    [ctx, selected, responses],
  );

  return { selected, pick, responses };
}
