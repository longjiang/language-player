import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Animated, PanResponder, type GestureResponderEvent, type PanResponderGestureState, type LayoutChangeEvent } from 'react-native';
import { shuffleScrabbleBlocks, type ScrabbleBlock } from '@langplayer/utils';
import { srsLogger } from '@/lib/logger';

const { log } = srsLogger;

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
 *
 * Drag uses React Native's PanResponder (no extra dependency): a ghost block
 * follows the finger in the input container's own coordinate space (measured
 * from the container origin), and on release the release point is hit-tested
 * against each slot's measured layout. A move under ~8px is a tap.
 */
export interface ScrabbleCharInputProps {
  /** The correct answer (the blanked surface form). Drives block count + chars. */
  answer: string;
  /** Called with the arranged string when the LAST slot is filled. */
  onSubmit: (arranged: string) => void;
  disabled?: boolean;
  /** Accessible label for the group (slot row + block pool). */
  label?: string;
}

interface SlotLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BlockTileProps {
  block: ScrabbleBlock;
  fromSlot: number | null;
  disabled: boolean;
  onDragStart: (block: ScrabbleBlock, fromSlot: number | null, e: GestureResponderEvent) => void;
  onDragMove: (e: GestureResponderEvent, g: PanResponderGestureState) => void;
  onDragRelease: (block: ScrabbleBlock, fromSlot: number | null, e: GestureResponderEvent, g: PanResponderGestureState) => void;
  onTap: (block: ScrabbleBlock, fromSlot: number | null) => void;
  className: string;
  /** Optional onLayout forwarded to the root View (used to record slot rects). */
  onLayout?: (e: LayoutChangeEvent) => void;
}

function BlockTile({
  block,
  fromSlot,
  disabled,
  onDragStart,
  onDragMove,
  onDragRelease,
  onTap,
  className,
  onLayout,
}: BlockTileProps) {
  const handlersRef = useRef({ onDragStart, onDragMove, onDragRelease, onTap });
  handlersRef.current = { onDragStart, onDragMove, onDragRelease, onTap };
  const movedRef = useRef(false);
  const layoutRef = useRef(onLayout);
  layoutRef.current = onLayout;

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    // The review card lives inside a ScrollView. Once this block claims the
    // JS responder, block the NATIVE responder (the ScrollView's pan
    // recognizer) from stealing/cancelling the touch — otherwise a drag on a
    // block is treated as a scroll and neither onDragMove nor onTap fires
    // (SPEC-066 scrabble drag).
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (e) => {
      movedRef.current = false;
      handlersRef.current.onDragStart(block, fromSlot, e);
      log('[srs-scrabble] grant', { char: block.char, fromSlot });
    },
    onPanResponderMove: (e, g) => {
      if (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) movedRef.current = true;
      handlersRef.current.onDragMove(e, g);
    },
    onPanResponderRelease: (e, g) => {
      log('[srs-scrabble] release', { char: block.char, fromSlot, moved: movedRef.current, dx: g.dx, dy: g.dy });
      if (movedRef.current) {
        handlersRef.current.onDragRelease(block, fromSlot, e, g);
      } else {
        handlersRef.current.onTap(block, fromSlot);
      }
      movedRef.current = false;
    },
    onPanResponderTerminate: () => {
      log('[srs-scrabble] terminate', { char: block.char, fromSlot });
      handlersRef.current.onTap(block, fromSlot); // snap back / treat as tap
      movedRef.current = false;
    },
  }), [block, fromSlot, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View
      {...panResponder.panHandlers}
      onLayout={layoutRef.current}
      className={className}
    >
      <Text className="text-lg font-medium text-foreground">{block.char}</Text>
    </View>
  );
}

export function ScrabbleCharInput({
  answer,
  onSubmit,
  disabled = false,
  label,
}: ScrabbleCharInputProps) {
  // Shuffle ONCE per answer (the component is remounted per card via a `key`).
  const [blocks] = useState<ScrabbleBlock[]>(() => shuffleScrabbleBlocks(answer));
  const answerChars = useMemo(() => Array.from(answer), [answer]);
  const slotCount = Math.max(1, answerChars.length);
  // `slots[i]` = block id placed in slot i, or null while empty.
  const [slots, setSlots] = useState<(number | null)[]>(() =>
    Array.from({ length: slotCount }, () => null),
  );
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<View | null>(null);
  const containerOrigin = useRef({ x: 0, y: 0 });
  const slotLayouts = useRef<(SlotLayout | null)[]>([]);
  const submittedRef = useRef(false);
  const draggingIdRef = useRef<number | null>(null);
  const ghostX = useRef(new Animated.Value(0)).current;
  const ghostY = useRef(new Animated.Value(0)).current;

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
    setSlots((prev) => {
      const next = [...prev];
      const desired = targetSlot >= 0 ? targetSlot : next.findIndex((v) => v == null);
      if (desired < 0) return prev; // no empty slot
      const existingIdx = next.indexOf(blockId);
      if (existingIdx !== -1) next[existingIdx] = null; // clear its old slot
      next[desired] = blockId; // displaces whatever was there (returns to pool)
      log('[srs-scrabble] place', { blockId, char: blockByKey.get(blockId)?.char ?? '', targetSlot: desired, slots: next });
      maybeSubmit(next);
      return next;
    });
  }, [maybeSubmit, blockByKey]);

  /** Remove the block from a slot — sent back to the pool. */
  const removeFromSlot = useCallback((slotIndex: number) => {
    setSlots((prev) => {
      if (prev[slotIndex] == null) return prev;
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  }, []);

  const recordSlotLayout = useCallback((i: number) => (e: LayoutChangeEvent) => {
    slotLayouts.current[i] = {
      x: e.nativeEvent.layout.x,
      y: e.nativeEvent.layout.y,
      w: e.nativeEvent.layout.width,
      h: e.nativeEvent.layout.height,
    };
  }, []);

  const onDragStart = useCallback((_block: ScrabbleBlock, _fromSlot: number | null, e: GestureResponderEvent) => {
    if (disabled || submittedRef.current) return;
    draggingIdRef.current = _block.id;
    setDraggingId(_block.id);
    // Measure the container's window origin so ghost/coordinates are container-local.
    containerRef.current?.measureInWindow((x, y) => {
      containerOrigin.current = { x, y };
    });
    // Put the ghost at the finger (window) position; transform converts below.
    setDragGhost({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
    ghostX.setValue(e.nativeEvent.pageX);
    ghostY.setValue(e.nativeEvent.pageY);
  }, [disabled, ghostX, ghostY]);

  const onDragMove = useCallback((_e: GestureResponderEvent, g: PanResponderGestureState) => {
    if (draggingIdRef.current == null) return;
    ghostX.setValue(g.moveX);
    ghostY.setValue(g.moveY);
    setDragGhost({ x: g.moveX, y: g.moveY });
  }, [ghostX, ghostY]);

  const onDragRelease = useCallback((_block: ScrabbleBlock, fromSlot: number | null, _e: GestureResponderEvent, g: PanResponderGestureState) => {
    const blockId = draggingIdRef.current;
    if (blockId == null) return;
    const origin = containerOrigin.current;
    // Hit-test the release point (window coords) against each slot's window rect.
    let target = -1;
    for (let i = 0; i < slotLayouts.current.length; i += 1) {
      const layout = slotLayouts.current[i];
      if (!layout) continue;
      const wx = origin.x + layout.x;
      const wy = origin.y + layout.y;
      if (g.moveX >= wx && g.moveX <= wx + layout.w && g.moveY >= wy && g.moveY <= wy + layout.h) {
        target = i;
        break;
      }
    }
    if (target >= 0) {
      placeBlock(blockId, target);
    } else if (fromSlot != null) {
      removeFromSlot(fromSlot);
    }
    log('[srs-scrabble] drag-release', { blockId, char: blockByKey.get(blockId)?.char ?? '', fromSlot, target, moveX: g.moveX, moveY: g.moveY, origin });
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragGhost(null);
  }, [placeBlock, removeFromSlot, blockByKey]);

  const onTap = useCallback((block: ScrabbleBlock, fromSlot: number | null) => {
    if (disabled || submittedRef.current) return;
    log('[srs-scrabble] tap', { char: block.char, id: block.id, fromSlot, disabled, submitted: submittedRef.current, slots });
    if (fromSlot != null) removeFromSlot(fromSlot);
    else placeBlock(block.id);
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragGhost(null);
  }, [disabled, removeFromSlot, placeBlock, slots]);

  const slotBase = 'h-11 w-10 items-center justify-center rounded-lg border';
  const poolBase = 'h-11 w-10 items-center justify-center rounded-lg border border-border bg-card shadow-sm';

  return (
    <View
      ref={containerRef}
      collapsable={false}
      className="w-full gap-3"
    >
      {/* Slots (one box per answer character) */}
      <View className="flex-row flex-wrap items-center justify-center gap-1.5" accessibilityLabel={label}>
        {Array.from({ length: slotCount }).map((_, i) => {
          const blockId = slots[i];
          const block = blockId != null ? blockByKey.get(blockId) ?? null : null;
          return (
            <BlockTile
              key={i}
              block={block ?? { id: -1, char: '' }}
              fromSlot={i}
              disabled={disabled || !block}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragRelease={onDragRelease}
              onTap={onTap}
              className={`${slotBase} ${block ? 'border-primary bg-primary/5' : 'border-border'} ${block ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
              onLayout={recordSlotLayout(i)}
            />
          );
        })}
      </View>

      {/* Block pool */}
      <View className="flex-row flex-wrap items-center justify-center gap-1.5" accessibilityLabel={label ? `${label} — tap a block to place it` : undefined}>
        {pool.map((b) => (
          <BlockTile
            key={b.id}
            block={b}
            fromSlot={null}
            disabled={disabled}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragRelease={onDragRelease}
            onTap={onTap}
            className={`${poolBase} ${disabled ? 'opacity-60' : 'cursor-grab active:cursor-grabbing'} ${draggingId === b.id ? 'opacity-20' : ''}`}
          />
        ))}
      </View>

      {/* Floating drag ghost — positioned in the container's coordinate space. */}
      {dragGhost && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            zIndex: 50,
            top: 0,
            left: 0,
            // Convert window coords → container-local by removing the origin.
            transform: [
              { translateX: Animated.subtract(ghostX, containerOrigin.current.x + 20) },
              { translateY: Animated.subtract(ghostY, containerOrigin.current.y + 22) },
            ],
            opacity: 0.9,
          }}
          className="h-11 w-10 items-center justify-center rounded-lg border border-primary bg-card shadow-lg"
        >
          <Text className="text-lg font-medium text-foreground">
            {draggingId != null ? blockByKey.get(draggingId)?.char ?? '' : ''}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}
