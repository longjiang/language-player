'use client';

import React, { useCallback, useSyncExternalStore } from 'react';
import type { Bank } from '@langplayer/textbooks';
import { useTextbookTask } from './task-provider';
import { useT } from '@/hooks/use-t';

/**
 * The option pool a `choose` blank draws from.
 *
 * Tapping an option fills the currently selected blank; tapping a blank in the
 * passage selects it. This mirrors the printed workbook, where the bank is
 * printed once and the blanks are numbered.
 *
 * When `allowReuse` is false, options already used elsewhere are dimmed. That is
 * a per-bank flag rather than a global rule: the B ➊ key genuinely reuses the
 * letter `a`, so it is data, not an assumption.
 */
export function WordBank({ bank }: { bank: Bank }) {
  const ctx = useTextbookTask();
  const t = useT();

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

  const usedValues = new Set(Object.values(responses).filter(Boolean));

  const pick = (item: string) => {
    if (selected) {
      ctx!.store.setValue(selected, item);
      // Move straight to the next empty blank so a run of answers is one tap each.
      const blanks = Object.values(ctx!.task.blanks ?? {}).filter((b) => b.kind !== 'given');
      const at = blanks.findIndex((b) => b.id === selected);
      const after = blanks.slice(at + 1).find((b) => !(responses[b.id] ?? '').trim());
      ctx!.selection.set(after?.id ?? null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {bank.items.map((item) => {
          const consumed = !bank.allowReuse && usedValues.has(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => pick(item)}
              className={`rounded-md border border-border px-3 py-1.5 text-sm transition-colors ${
                consumed
                  ? 'bg-muted/40 text-muted-foreground line-through'
                  : 'bg-card text-foreground hover:bg-muted'
              }`}
            >
              {item}
            </button>
          );
        })}
      </div>
      {!selected && (
        <p className="text-xs text-muted-foreground">{t('msg.please_select_option')}</p>
      )}
    </div>
  );
}
