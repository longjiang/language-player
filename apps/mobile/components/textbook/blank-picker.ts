import { useCallback, useSyncExternalStore } from 'react';
import { useTextbookTask } from './task-provider';

export interface BlankPicker {
  /** The blank the next pick will fill, or null. */
  selected: string | null;
  /** Fill the selected blank. The selection stays where it is. */
  pick: (value: string) => void;
  /** Responses by blank id, for dimming already-used options. */
  responses: Record<string, string>;
}

/**
 * Shared "tap an option to fill the selected blank" behaviour.
 *
 * The word bank and the picture sets are the same interaction with different affordances, so
 * they share this rather than each filling in its own way.
 *
 * **The selection does not move after a fill.** It used to advance to the next empty blank,
 * which answered a printed run of blanks with one tap each — but it also decided where the
 * student was working: an option tapped to *correct* an earlier answer took them away from the
 * blank they were on, and the blank they meant to change stayed as it was. The student picks
 * the blank; filling it leaves them there.
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
      const blank = ctx!.task.blanks?.[selected];

      // A multi-select blank stays selected and toggles picks, because the student
      // is choosing a set rather than answering a run of slots.
      if (blank?.multiple) {
        const current = (responses[selected] ?? '')
          .split(/[、,，]/)
          .map((part) => part.trim())
          .filter(Boolean);
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        ctx!.store.setValue(selected, next.join('、'));
        return;
      }

      ctx!.store.setValue(selected, value);
    },
    [ctx, selected, responses],
  );

  return { selected, pick, responses };
}
