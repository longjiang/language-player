'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { shuffleScrabbleBlocks, type ScrabbleBlock } from '@langplayer/utils';

/**
 * Scrabble-mode block arrangement input (SPEC-066).
 *
 * The correct answer's characters are shuffled into letter blocks (one block
 * per code point, same size as the spell character boxes). The learner fills a
 * row of empty slots by either:
 *   - tapping a block → it flies to the first empty slot, or
 *   - dragging a block onto a specific slot.
 * Filling the LAST slot auto-submits the arranged word (no submit button, no
 * hint — unlike spell mode). Tapping an occupied slot returns its block to the
 * pool so a misplaced block can be fixed before the last slot auto-submits.
 *
 * The block order is shuffled once when the answer changes (the parent remounts
 * this component per card/mode via a `key`), so the pool stays put while the
 * learner arranges. `onSubmit` is called with the arranged string the moment
 * every slot is filled.
 */
export interface ScrabbleCharInputProps {
  /** The correct answer (the blanked surface form). Drives block count + chars. */
  answer: string;
  /** Called with the arranged string when the LAST slot is filled. */
  onSubmit: (arranged: string) => void;
  disabled?: boolean;
  /** Accessible label for the group (slot row + block pool). */
  label?: string;
  /** Optional id forwarded to the slot-row region (for a `<label htmlFor>`). */
  id?: string;
}

interface DragState {
  blockId: number;
  /** The slot index this block was dragged from, or null when from the pool. */
  fromSlot: number | null;
  pointerId: number;
  x: number;
  y: number;
  moveCount: number;
}

export function ScrabbleCharInput({
  answer,
  onSubmit,
  disabled = false,
  label,
  id,
}: ScrabbleCharInputProps) {
  // Shuffle ONCE per answer (the component is remounted per card via a `key`).
  const [blocks] = useState<ScrabbleBlock[]>(() => shuffleScrabbleBlocks(answer));
  const answerChars = useMemo(() => Array.from(answer), [answer]);
  const slotCount = Math.max(1, answerChars.length);
  // `slots[i]` = block id placed in slot i, or null while empty.
  const [slots, setSlots] = useState<(number | null)[]>(() =>
    Array.from({ length: slotCount }, () => null),
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const submittedRef = useRef(false);

  // The block array is SHUFFLED in place, so array index ≠ block id. Look up
  // blocks by their stable id (never by array index) so the ghost and the
  // arranged string always use the actual block's character.
  const blockByKey = useMemo(() => {
    const map = new Map<number, ScrabbleBlock>();
    for (const b of blocks) map.set(b.id, b);
    return map;
  }, [blocks]);

  // Pool = blocks not currently placed in a slot.
  const pool = useMemo(() => {
    const used = new Set(slots.filter((v): v is number => v != null));
    return blocks.filter((b) => !used.has(b.id));
  }, [blocks, slots]);

  const buildArranged = useCallback(
    (next: (number | null)[]): string =>
      next.map((bid) => (bid == null ? '' : blockByKey.get(bid)?.char ?? '')).join(''),
    [blockByKey],
  );

  const maybeSubmit = useCallback((next: (number | null)[]) => {
    if (next.every((v) => v != null) && !submittedRef.current) {
      submittedRef.current = true;
      onSubmit(buildArranged(next));
    }
  }, [buildArranged, onSubmit]);

  /** Place a block id into a specific slot (defaults to the first empty slot). */
  const placeBlock = useCallback((blockId: number, targetSlot: number = -1) => {
    const next = [...slots];
    const desired = targetSlot >= 0 ? targetSlot : next.findIndex((v) => v == null);
    if (desired < 0) return; // no empty slot
    const existingIdx = next.indexOf(blockId);
    if (existingIdx !== -1) next[existingIdx] = null; // clear its old slot
    next[desired] = blockId; // displaces whatever was there (returns to pool)
    setSlots(next);
    maybeSubmit(next);
  }, [slots, maybeSubmit]);

  /** Remove the block from a slot — sent back to the pool. */
  const removeFromSlot = useCallback((slotIndex: number) => {
    if (slots[slotIndex] == null) return;
    const next = [...slots];
    next[slotIndex] = null;
    setSlots(next);
  }, [slots]);

  const finishDrag = useCallback((e: React.PointerEvent, d: DragState) => {
    let target = -1;
    for (let i = 0; i < slotRefs.current.length; i += 1) {
      const node = slotRefs.current[i];
      if (!node) continue;
      const r = node.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        target = i;
        break;
      }
    }
    if (target >= 0) {
      placeBlock(d.blockId, target);
    } else if (d.fromSlot != null) {
      // Dropped off the slots → return to the pool.
      removeFromSlot(d.fromSlot);
    }
  }, [placeBlock, removeFromSlot]);

  const onPointerDown = useCallback((e: React.PointerEvent, blockId: number, fromSlot: number | null) => {
    if (disabled || submittedRef.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const d: DragState = { blockId, fromSlot, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moveCount: 0 };
    dragRef.current = d;
    setDrag(d);
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const next = { ...d, x: e.clientX, y: e.clientY, moveCount: d.moveCount + 1 };
    dragRef.current = next;
    setDrag(next);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.moveCount > 0) {
      finishDrag(e, d);
    } else if (d.fromSlot != null) {
      removeFromSlot(d.fromSlot); // tap on an occupied slot → back to pool
    } else {
      placeBlock(d.blockId); // tap on a pool block → first empty slot
    }
    dragRef.current = null;
    setDrag(null);
  }, [finishDrag, removeFromSlot, placeBlock]);

  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
  }, []);

  const dragging = drag && drag.moveCount > 0 ? drag : null;

  return (
    <div className="w-full space-y-3">
      {/* Slots (one box per answer character) */}
      <div id={id} role="group" aria-label={label} className="flex flex-wrap items-center justify-center gap-1.5">
        {Array.from({ length: slotCount }).map((_, i) => {
          const blockId = slots[i];
          const block = blockId != null ? blockByKey.get(blockId) ?? null : null;
          const isBeingDraggedFromHere = dragging?.fromSlot === i;
          return (
            <div
              key={i}
              ref={(el) => { slotRefs.current[i] = el; }}
              onClick={() => { if (block) removeFromSlot(i); }}
              onPointerDown={(e) => { if (block) onPointerDown(e, block.id, i); }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              className={`flex h-11 w-10 items-center justify-center rounded-lg border text-lg font-medium transition-colors ${
                block ? 'border-primary bg-primary/5 text-foreground' : 'border-border'
              } ${block && !disabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
            >
              {block && !isBeingDraggedFromHere ? <span>{block.char}</span> : <span>&nbsp;</span>}
            </div>
          );
        })}
      </div>

      {/* Block pool */}
      <div className="flex flex-wrap items-center justify-center gap-1.5" aria-label={label ? `${label} — tap a block to place it` : undefined}>
        {pool.map((b) => {
          const isBeingDragged = dragging?.blockId === b.id;
          return (
            <div
              key={b.id}
              onPointerDown={(e) => onPointerDown(e, b.id, null)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              className={`flex h-11 w-10 select-none items-center justify-center rounded-lg border border-border bg-card text-lg font-medium shadow-sm transition-colors ${
                disabled ? 'cursor-default opacity-60' : 'cursor-grab active:cursor-grabbing'
              } ${isBeingDragged ? 'opacity-0' : ''}`}
            >
              {b.char}
            </div>
          );
        })}
      </div>

      {/* Floating drag ghost */}
      {dragging && (
        <div
          className="pointer-events-none fixed z-50 flex h-11 w-10 items-center justify-center rounded-lg border border-primary bg-card text-lg font-medium shadow-lg"
          style={{ left: dragging.x - 20, top: dragging.y - 22 }}
        >
          {blockByKey.get(dragging.blockId)?.char ?? ''}
        </div>
      )}
    </div>
  );
}
