'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shuffleScrabbleBlocks, type ScrabbleBlock } from '@langplayer/utils';

/**
 * Scrabble-mode block arrangement input (SPEC-066).
 *
 * The correct answer's characters are shuffled into letter blocks (one block
 * per code point, same size as the spell character boxes). The learner fills a
 * row of empty slots by dragging/tapping blocks:
 *   - a block taken from the pool is placed into the slot it is dropped on, or
 *     into the next (first) empty slot when released off the slot row, and
 *   - any interaction with a block already in a slot returns it to the pool.
 * Filling the LAST slot auto-submits the arranged word (no submit button, no
 * hint — unlike spell mode).
 *
 * When `keyboardEnabled` (a non-IME language per `supportsScrabbleKeyboard`),
 * a hidden physical-keyboard input is layered over the slots: each printable
 * keystroke moves a matching pool block into the next available slot, and
 * Backspace returns the rightmost filled block to the pool. The soft keyboard /
 * IME is never summoned (physical keyboard only) — the block pool stays the
 * source of truth, and typing just drives the same placement as a tap/drag.
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
  /**
   * Enable the physical-keyboard fill path (non-IME L2 per
   * `supportsScrabbleKeyboard`). When set, typing moves matching pool blocks
   * into the slots; soft keyboard / IME is not shown.
   */
  keyboardEnabled?: boolean;
}

interface DragState {
  blockId: number;
  /** The slot index this block was dragged from, or null when from the pool. */
  fromSlot: number | null;
  pointerId: number;
  /** Pointer position when the drag started (for the click-vs-drag threshold). */
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** True once the pointer has travelled beyond DRAG_THRESHOLD (a real drag). */
  moved: boolean;
}

/** Pointer travel (px) before a click counts as a visual drag (ghost). */
const DRAG_THRESHOLD = 5;

export function ScrabbleCharInput({
  answer,
  onSubmit,
  disabled = false,
  label,
  id,
  keyboardEnabled = false,
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
  const keyboardInputRef = useRef<HTMLInputElement | null>(null);

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

  const getSlotIndexAt = useCallback((e: React.PointerEvent) => {
    for (let i = 0; i < slotRefs.current.length; i += 1) {
      const node = slotRefs.current[i];
      if (!node) continue;
      const r = node.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        return i;
      }
    }
    return -1;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent, blockId: number, fromSlot: number | null) => {
    if (disabled || submittedRef.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const d: DragState = {
      blockId,
      fromSlot,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    };
    dragRef.current = d;
    setDrag(d);
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD;
    const next = { ...d, x: e.clientX, y: e.clientY, moved };
    dragRef.current = next;
    setDrag(next);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.fromSlot != null) {
      // The block came from inside a slot → return it to the pool.
      removeFromSlot(d.fromSlot);
    } else {
      // The block came from the pool:
      const target = getSlotIndexAt(e);
      if (target >= 0) {
        // Released over a slot → drop it there.
        placeBlock(d.blockId, target);
      } else {
        // Released off the slot row → drop it into the next available slot.
        placeBlock(d.blockId);
      }
    }
    dragRef.current = null;
    setDrag(null);
  }, [getSlotIndexAt, removeFromSlot, placeBlock]);

  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
  }, []);

  // ── Physical-keyboard fill (SPEC-066) ──────────────────────────────────
  // A hidden input is focused so printable keystrokes arrive here; each key
  // moves a matching pool block into the next empty slot (same placement as a
  // tap/drag), and Backspace returns the rightmost filled block to the pool.
  // The soft keyboard / IME is never shown — this path is for physical
  // keyboards on languages that don't need an IME.
  const handleKeyboardInput = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled || submittedRef.current) return;
    // Same IME guard as the spell input: never act mid-composition.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      // Return the rightmost filled block to the pool.
      let filled = -1;
      for (let i = slots.length - 1; i >= 0; i -= 1) {
        if (slots[i] != null) { filled = i; break; }
      }
      if (filled >= 0) removeFromSlot(filled);
      return;
    }
    if (e.key.length === 1) {
      // Case-insensitive: a shifted capital still moves the lowercase block.
      const typed = e.key;
      const match = pool.find((b) => b.char.length === 1 && b.char.toLowerCase() === typed.toLowerCase());
      if (match) {
        e.preventDefault();
        placeBlock(match.id);
      }
    }
  }, [disabled, pool, slots, placeBlock, removeFromSlot]);

  // Focus the hidden keyboard input while the keyboard-fill path is active so a
  // physical keyboard can be used without clicking first. Clicking a block (a
  // non-focusable div) keeps this input focused, so typing continues between
  // block taps.
  useEffect(() => {
    if (keyboardEnabled && !disabled && !submittedRef.current) {
      keyboardInputRef.current?.focus();
    }
  }, [keyboardEnabled, disabled]);

  const dragging = drag && drag.moved ? drag : null;

  return (
    <div className="relative w-full space-y-3">
      {/* Hidden physical-keyboard capture field. `pointer-events-none` keeps it
          from blocking the drag/tap surface; `tabIndex={-1}` keeps it out of
          tab order; autoFocus + the effect above give it focus on mount so a
          physical keyboard fills the slots immediately. */}
      {keyboardEnabled && (
        <input
          ref={keyboardInputRef}
          type="text"
          autoFocus
          tabIndex={-1}
          value=""
          onChange={() => {}}
          onKeyDown={handleKeyboardInput}
          aria-hidden="true"
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      )}

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
