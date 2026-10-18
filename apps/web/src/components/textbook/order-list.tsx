'use client';

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { GripVertical } from 'lucide-react';
import {
  moveRow,
  moveRowBy,
  orderFromPositions,
  sameOrder,
  type OrderListItem,
  type OrderListStimulus,
} from '@langplayer/textbooks';
import { TokenizedText } from '@/components/tokenized-text';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useTextbookTask } from './task-provider';
import { BlankField } from './blank-field';

/**
 * A list of rows the student drags into the recording's order (SPEC-095, D ➋).
 *
 * The workbook printed a table whose first column was a blank for the position (1–5) and whose
 * third was a blank for the row's description. Picking a number from a dropdown asks the student
 * to translate an ordering into digits; dragging the rows is the exercise. The description
 * picker stays — that is matching, not ordering.
 *
 * **The position is still a stored blank.** A drop writes each row's 1-based index into its
 * position blank, so grading, the answer key and the green/red verdicts are the existing
 * per-blank machinery and nothing about the response model changed. The first run of a fresh
 * task seeds the authored arrangement, so submitting without dragging grades the list the
 * student can see rather than five empty blanks.
 *
 * A `locked` row is the printed worked example (D ➋'s ① 路线 = 1): it keeps its slot, has no drag
 * handle, and its given blank is never written. Its row is green after submit, like any other
 * row in the right slot.
 */
export function OrderList({ stimulus }: { stimulus: OrderListStimulus }) {
  const ctx = useTextbookTask()!;
  const t = useT();
  const { l2 } = useLanguage();

  const rows = stimulus.items;
  const authored = useMemo(() => rows.map((row) => row.id), [rows]);
  const byId = useMemo(
    () => new Map<string, OrderListItem>(rows.map((row) => [row.id, row] as const)),
    [rows],
  );

  const getResponses = useCallback(() => ctx.store.getResponsesSnapshot(), [ctx]);
  const responses = useSyncExternalStore(ctx.store.subscribe, getResponses, getResponses);
  const getResult = useCallback(() => ctx.store.getResult(), [ctx]);
  const result = useSyncExternalStore(ctx.store.subscribe, getResult, getResult);

  const [order, setOrder] = useState<string[]>(authored);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // The stored positions are the truth (a reload, or this component's own writes); the authored
  // order is only the fallback while they are incomplete. `sameOrder` keeps the effect from
  // re-rendering forever: `orderFromPositions` builds a fresh array every read.
  useEffect(() => {
    const stored = orderFromPositions(rows, responses);
    setOrder((previous) => (sameOrder(previous, stored) ? previous : stored));
  }, [rows, responses]);

  // A fresh task: the list already shows an arrangement, so record it as the answer the student
  // starts from. Only when every draggable row is empty — a restored order is never overwritten.
  useEffect(() => {
    const draggable = rows.filter((row) => !row.locked);
    if (draggable.some((row) => responses[row.blankId])) return;
    rows.forEach((row, index) => {
      if (!row.locked) ctx.store.setValue(row.blankId, String(index + 1));
    });
  }, [rows, responses, ctx]);

  const commit = (next: string[]) => {
    if (sameOrder(next, order)) return;
    setOrder(next);
    next.forEach((id, index) => {
      const row = byId.get(id)!;
      if (!row.locked) ctx.store.setValue(row.blankId, String(index + 1));
    });
  };

  const verdictFor = (rowId: string): 'correct' | 'incorrect' | null => {
    if (!result) return null;
    const row = byId.get(rowId)!;
    const blank = ctx.task.blanks?.[row.blankId];
    if (blank?.kind === 'given') return 'correct';
    const verdict = result.blanks.find((entry) => entry.blankId === row.blankId);
    return verdict?.correct ? 'correct' : 'incorrect';
  };

  return (
    <ol className="flex flex-col gap-2">
      {order.map((id) => {
        const row = byId.get(id)!;
        const verdict = verdictFor(id);
        const description = row.descriptionBlankId
          ? ctx.task.blanks?.[row.descriptionBlankId]
          : undefined;
        return (
          <li
            key={id}
            data-order-row={id}
            data-verdict={verdict ?? undefined}
            onDragOver={(event) => {
              if (row.locked || !dragId) return;
              event.preventDefault();
              setOverId(id);
            }}
            onDragLeave={() => setOverId((current) => (current === id ? null : current))}
            onDrop={(event) => {
              if (row.locked) return;
              event.preventDefault();
              const from = event.dataTransfer.getData('text/plain') || dragId;
              if (from) commit(moveRow(order, rows, from, id));
              setDragId(null);
              setOverId(null);
            }}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
              verdict === 'correct'
                ? 'border-green-600 bg-green-500/10'
                : verdict === 'incorrect'
                  ? 'border-destructive bg-destructive/10'
                  : overId === id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card'
            } ${dragId === id ? 'opacity-50' : ''}`}
          >
            {row.locked ? (
              // A worked example: the grip is printed but inert, so the row reads as part of the
              // same list without pretending it can move.
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground/40"
                aria-hidden
              >
                <GripVertical className="h-4 w-4" />
              </span>
            ) : (
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', id);
                  setDragId(id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onKeyDown={(event) => {
                  // Keyboard path: a drag handle nobody can drag is not an affordance.
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    commit(moveRowBy(order, rows, id, -1));
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    commit(moveRowBy(order, rows, id, 1));
                  }
                }}
                aria-label={t('label.drag_to_reorder')}
                className="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" aria-hidden />
              </button>
            )}

            <span className="min-w-0 flex-1 text-lg text-foreground">
              <TokenizedText text={row.text} l2Code={l2.code} inline />
            </span>

            {description && (
              <span className="shrink-0">
                <BlankField blank={description} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
