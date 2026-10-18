'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
  /** The displayed order, readable synchronously: a dragover preview and the drop that follows
   *  it run in one React batch, so the drop cannot read the preview from `order` state yet. */
  const orderRef = useRef<string[]>(authored);
  orderRef.current = order;
  const setPreview = (next: string[]) => {
    orderRef.current = next;
    setOrder(next);
  };
  const [dragId, setDragId] = useState<string | null>(null);
  /** The drag source, readable synchronously by the next drag event (state lags a render). */
  const dragRef = useRef<string | null>(null);
  /** Set on a drop so the following dragend does not undo the drop as a cancelled drag. */
  const dropped = useRef(false);

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

  /** Write the current arrangement into the position blanks — the only write a drop does. */
  const persist = useCallback(
    (next: string[]) => {
      next.forEach((id, index) => {
        const row = byId.get(id)!;
        if (!row.locked) ctx.store.setValue(row.blankId, String(index + 1));
      });
    },
    [byId, ctx],
  );

  /** Keyboard moves commit immediately; a drag only previews until it is dropped. */
  const commit = (next: string[]) => {
    if (!sameOrder(next, orderRef.current)) setPreview(next);
    persist(next);
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
    <ol
      className="flex flex-col gap-2"
      onDragOver={(event) => {
        if (dragRef.current) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!dragRef.current) return;
        event.preventDefault();
        persist(orderRef.current);
        dropped.current = true;
        dragRef.current = null;
        setDragId(null);
      }}
    >
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
            data-dragging={dragId === id ? 'true' : undefined}
            onDragOver={(event) => {
              const active = dragRef.current;
              if (row.locked || !active) return;
              event.preventDefault();
              event.stopPropagation();
              // Live preview: the rows under the pointer move out of the way, and the dragged
              // row takes the slot it would land in (rendered as the dashed drop zone below).
              const next = moveRow(orderRef.current, rows, active, id);
              if (!sameOrder(next, orderRef.current)) setPreview(next);
            }}
            onDrop={(event) => {
              if (row.locked) return;
              event.preventDefault();
              event.stopPropagation();
              persist(orderRef.current);
              dropped.current = true;
              dragRef.current = null;
              setDragId(null);
            }}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
              dragId === id
                ? 'border-dashed border-primary bg-primary/5 opacity-50'
                : verdict === 'correct'
                  ? 'border-green-600 bg-green-500/10'
                  : verdict === 'incorrect'
                    ? 'border-destructive bg-destructive/10'
                    : 'border-border bg-card'
            }`}
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
                  dropped.current = false;
                  dragRef.current = id;
                  // The handle is draggable only so a drag starts from it; the drag image should
                  // be the whole row, not the grip. (The row is not itself draggable, so dragging
                  // the description picker or selecting the topic never moves the list.)
                  const rowElement = (event.currentTarget as HTMLElement).closest(
                    '[data-order-row]',
                  ) as HTMLElement | null;
                  if (rowElement) {
                    const rect = rowElement.getBoundingClientRect();
                    event.dataTransfer.setDragImage(
                      rowElement,
                      event.clientX - rect.left,
                      event.clientY - rect.top,
                    );
                  }
                  setDragId(id);
                }}
                onDragEnd={() => {
                  // A cancelled drag (Escape, drop outside the list) restores the stored order;
                  // a drop has already persisted the previewed order, so this is a no-op then.
                  if (!dropped.current) {
                    const stored = orderFromPositions(rows, responses);
                    if (!sameOrder(orderRef.current, stored)) setPreview(stored);
                  }
                  dropped.current = false;
                  dragRef.current = null;
                  setDragId(null);
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
