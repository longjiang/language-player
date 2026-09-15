import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Animated, type LayoutChangeEvent, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { shuffleScrabbleBlocks, type ScrabbleBlock } from '@langplayer/utils';
import { srsLogger } from '@/lib/logger';

const { log } = srsLogger;

/** A point in window coordinates (what `absoluteX`/`absoluteY` report). */
interface Point {
  x: number;
  y: number;
}

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
 * When `keyboardEnabled` (a non-IME language per `supportsScrabbleKeyboard`), a
 * hidden focused `TextInput` with the soft keyboard suppressed
 * (`showSoftInputOnFocus={false}`, `caretHidden`) captures a PHYSICAL keyboard:
 * each printable keystroke moves a matching pool block into the next empty
 * slot, and Backspace pops the rightmost filled block. This is hardware-keyboard
 * only, so the on-screen keyboard is never summoned and the block pool stays the
 * source of truth — typing just drives the same placement as a tap/drag.
 *
 * **Gestures are react-native-gesture-handler, not `PanResponder`.** The card
 * body is a `ScrollView`, and on iOS the JS-responder route cannot win against
 * it: `onShouldBlockNativeResponder` is a no-op on iOS (it only exists on
 * Android — see RN's `PanResponder.js` and Fabric's `RCTMountingManager.mm`,
 * which merely calls `setIsJSResponder:`), `RCTScrollViewComponentView` only
 * disables scroll interaction for a JS responder that is an *ancestor* of the
 * scroll view, never a descendant, and a `PanResponder` grants the
 * ScrollView's termination request by default. So the blocks took no taps at
 * all, and a drag was terminated into a "tap" the moment the card scrolled.
 * RNGH gestures are native recognizers, so they do not depend on the JS
 * responder chain; the tile pan additionally `.blocksExternalGesture()`-es the
 * card's scroll gesture (`Gesture.Native()`, attached by the parent), which is
 * this repo's established answer to the same conflict (see
 * `components/reader/PaginatedReader.tsx` and `TranslationSplitHandle.tsx`).
 *
 * One `Pan` with `minDistance(0)` covers both interactions, exactly as the old
 * 8px rule did: a release that never moved is a tap, anything further is a drag
 * hit-tested against each slot's measured layout. The ghost block follows the
 * finger in the input container's own coordinate space (measured from the
 * container origin).
 */
export interface ScrabbleCharInputProps {
  /** The correct answer (the blanked surface form). Drives block count + chars. */
  answer: string;
  /** Called with the arranged string when the LAST slot is filled. */
  onSubmit: (arranged: string) => void;
  disabled?: boolean;
  /** Accessible label for the group (slot row + block pool). */
  label?: string;
  /**
   * Enable the physical-keyboard fill path (non-IME L2 per
   * `supportsScrabbleKeyboard`). When set, hardware typed characters move
   * matching pool blocks into the slots; the soft keyboard / IME is not shown.
   */
  keyboardEnabled?: boolean;
  /**
   * The card's native scroll gesture (`Gesture.Native()` around the ScrollView
   * that hosts this input). The tile pan blocks it so a drag on a block moves
   * the block instead of scrolling the card.
   */
  scrollGesture?: GestureType | null;
  /**
   * Fires while a tile gesture is in progress, so the host can also pin the
   * card's scroll (`scrollEnabled={false}`) for the duration.
   */
  onTileGestureActive?: (active: boolean) => void;
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
  scrollGesture?: GestureType | null;
  onDragStart: (block: ScrabbleBlock, fromSlot: number | null, at: Point) => void;
  onDragMove: (at: Point) => void;
  onDragRelease: (block: ScrabbleBlock, fromSlot: number | null, at: Point) => void;
  /** A drag that ended without success (recognizer cancelled) — snap back. */
  onDragCancel?: () => void;
  onTap: (block: ScrabbleBlock, fromSlot: number | null) => void;
  onGestureActive?: (active: boolean) => void;
  className: string;
  /** Optional onLayout forwarded to the root View (used to record slot rects). */
  onLayout?: (e: LayoutChangeEvent) => void;
}

function BlockTile({
  block,
  fromSlot,
  disabled,
  scrollGesture,
  onDragStart,
  onDragMove,
  onDragRelease,
  onDragCancel,
  onTap,
  onGestureActive,
  className,
  onLayout,
}: BlockTileProps) {
  const handlersRef = useRef({ onDragStart, onDragMove, onDragRelease, onDragCancel, onTap, onGestureActive });
  handlersRef.current = { onDragStart, onDragMove, onDragRelease, onDragCancel, onTap, onGestureActive };
  const layoutRef = useRef(onLayout);
  layoutRef.current = onLayout;

  const gesture = useMemo(() => {
    // Two recognizers, not one: a pan only reaches ACTIVE on a touch-move
    // event, so a pan alone would silently drop a tap that never moves a
    // pixel. `Exclusive` gives the drag priority and lets the tap recognise
    // once the drag has failed — i.e. when the finger lifts before the
    // threshold, which is exactly SPEC-066's "a short click that drifts a few
    // pixels still places the block".
    const drag = Gesture.Pan()
      .enabled(!disabled)
      // Same 8px threshold the input always used: below it, the release is a tap.
      .minDistance(8)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      // Required: these callbacks touch React state and `Animated` values, so
      // they must run on the JS thread (no worklets in this app — ADR-0016).
      .runOnJS(true)
      .onStart((e) => {
        log('[srs-scrabble] drag-start', { char: block.char, fromSlot, x: e.absoluteX, y: e.absoluteY });
        handlersRef.current.onGestureActive?.(true);
        handlersRef.current.onDragStart(block, fromSlot, { x: e.absoluteX, y: e.absoluteY });
      })
      .onUpdate((e) => {
        handlersRef.current.onDragMove({ x: e.absoluteX, y: e.absoluteY });
      })
      .onEnd((e) => {
        log('[srs-scrabble] drag-release', { char: block.char, fromSlot, x: e.absoluteX, y: e.absoluteY });
        handlersRef.current.onDragRelease(block, fromSlot, { x: e.absoluteX, y: e.absoluteY });
      })
      .onFinalize((_e, success) => {
        // A drag that was cancelled (a competing recognizer won, the system
        // interrupted it) must snap back, never place or clear a block.
        if (!success) handlersRef.current.onDragCancel?.();
        handlersRef.current.onGestureActive?.(false);
      });

    const tap = Gesture.Tap()
      .enabled(!disabled)
      // Generous, so a slow but motionless tap is still a tap; the drag's 8px
      // threshold is what actually separates the two.
      .maxDuration(2000)
      .maxDistance(12)
      .runOnJS(true)
      .onEnd((_e, success) => {
        log('[srs-scrabble] tap', { char: block.char, fromSlot, success });
        if (success) handlersRef.current.onTap(block, fromSlot);
      });

    // A drag on a block must not scroll the card. The scroll view's own
    // recognizer is a native gesture handler, so blocking it has to happen at
    // the native level — the JS responder cannot do it on iOS.
    return scrollGesture
      ? Gesture.Exclusive(drag.blocksExternalGesture(scrollGesture), tap.blocksExternalGesture(scrollGesture))
      : Gesture.Exclusive(drag, tap);
  }, [block, fromSlot, disabled, scrollGesture]);

  return (
    <GestureDetector gesture={gesture}>
      <View onLayout={layoutRef.current} className={className}>
        <Text className="text-lg font-medium text-foreground">{block.char}</Text>
      </View>
    </GestureDetector>
  );
}

export function ScrabbleCharInput({
  answer,
  onSubmit,
  disabled = false,
  label,
  keyboardEnabled = false,
  scrollGesture = null,
  onTileGestureActive,
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
  const kbInputRef = useRef<TextInput | null>(null);

  // Mount diagnostic (SPEC-066 device debugging): the block gestures are native
  // recognizers now, so the useful evidence is whether this component is on
  // screen at all and whether the host passed the card's scroll gesture down.
  useEffect(() => {
    log('[srs-scrabble] input mounted', {
      answer,
      slotCount,
      blocks: blocks.length,
      keyboardEnabled,
      scrollGesture: scrollGesture != null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const onDragStart = useCallback((_block: ScrabbleBlock, _fromSlot: number | null, at: Point) => {
    if (disabled || submittedRef.current) return;
    draggingIdRef.current = _block.id;
    setDraggingId(_block.id);
    // Measure the container's window origin so ghost/coordinates are container-local.
    containerRef.current?.measureInWindow((x, y) => {
      containerOrigin.current = { x, y };
    });
    // Put the ghost at the finger (window) position; transform converts below.
    setDragGhost({ x: at.x, y: at.y });
    ghostX.setValue(at.x);
    ghostY.setValue(at.y);
  }, [disabled, ghostX, ghostY]);

  const onDragMove = useCallback((at: Point) => {
    if (draggingIdRef.current == null) return;
    ghostX.setValue(at.x);
    ghostY.setValue(at.y);
    setDragGhost({ x: at.x, y: at.y });
  }, [ghostX, ghostY]);

  const onDragRelease = useCallback((_block: ScrabbleBlock, fromSlot: number | null, at: Point) => {
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
      if (at.x >= wx && at.x <= wx + layout.w && at.y >= wy && at.y <= wy + layout.h) {
        target = i;
        break;
      }
    }
    if (target >= 0) {
      placeBlock(blockId, target);
    } else if (fromSlot != null) {
      removeFromSlot(fromSlot);
    }
    log('[srs-scrabble] drag-release', { blockId, char: blockByKey.get(blockId)?.char ?? '', fromSlot, target, x: at.x, y: at.y, origin });
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragGhost(null);
  }, [placeBlock, removeFromSlot, blockByKey]);

  const onTap = useCallback((block: ScrabbleBlock, fromSlot: number | null) => {    if (disabled || submittedRef.current) return;
    log('[srs-scrabble] tap', { char: block.char, id: block.id, fromSlot, disabled, submitted: submittedRef.current, slots });
    if (fromSlot != null) removeFromSlot(fromSlot);
    else placeBlock(block.id);
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragGhost(null);
  }, [disabled, removeFromSlot, placeBlock, slots]);

  /**
   * A drag the recognizer cancelled — the arrangement must be left exactly as
   * it was. (The old `onPanResponderTerminate` called `onTap` here, so a drag
   * the ScrollView interrupted silently placed or cleared a block.)
   */
  const onDragCancel = useCallback(() => {
    if (draggingIdRef.current == null) return;
    log('[srs-scrabble] drag-cancelled', { blockId: draggingIdRef.current });
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragGhost(null);
  }, []);

  // ── Physical-keyboard fill (SPEC-066) ──────────────────────────────────
  // A hidden focused TextInput (soft keyboard suppressed) receives hardware
  // keystrokes; each inserted character moves a matching pool block into the
  // next empty slot, and Backspace pops the rightmost filled block. The field is
  // cleared after every insertion so it only ever holds the latest character.
  const handleKbChangeText = useCallback((text: string) => {
    if (disabled || submittedRef.current) return;
    const chars = Array.from(text);
    if (chars.length > 0) {
      // Case-insensitive so a shifted capital still moves the lowercase block.
      const typed = chars[chars.length - 1]!;
      const match = pool.find((b) => b.char.length === 1 && b.char.toLowerCase() === typed.toLowerCase());
      if (match) placeBlock(match.id);
    }
    kbInputRef.current?.clear();
  }, [disabled, pool, placeBlock]);

  const handleKbKeyPress = useCallback((e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (disabled || submittedRef.current) return;
    if (e.nativeEvent.key === 'Backspace') {
      let filled = -1;
      for (let i = slots.length - 1; i >= 0; i -= 1) {
        if (slots[i] != null) { filled = i; break; }
      }
      if (filled >= 0) removeFromSlot(filled);
    }
  }, [disabled, slots, removeFromSlot]);

  // Focus the hidden field while the keyboard-fill path is active so a hardware
  // keyboard can be used without tapping first.
  useEffect(() => {
    if (keyboardEnabled && !disabled && !submittedRef.current) {
      kbInputRef.current?.focus();
    }
  }, [keyboardEnabled, disabled]);

  const slotBase = 'h-11 w-10 items-center justify-center rounded-lg border';
  const poolBase = 'h-11 w-10 items-center justify-center rounded-lg border border-border bg-card shadow-sm';

  return (
    <View
      ref={containerRef}
      collapsable={false}
      className="w-full gap-3"
    >
      {/* Hidden physical-keyboard capture field. Soft keyboard suppressed
          (`showSoftInputOnFocus={false}`) + `caretHidden` so only a hardware
          keyboard drives it; the on-screen keyboard is never summoned. */}
      {keyboardEnabled && (
        <TextInput
          ref={kbInputRef}
          autoFocus
          showSoftInputOnFocus={false}
          caretHidden
          autoComplete="off"
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          multiline={false}
          onChangeText={handleKbChangeText}
          onKeyPress={handleKbKeyPress}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        />
      )}

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
              scrollGesture={scrollGesture}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragRelease={onDragRelease}
              onDragCancel={onDragCancel}
              onTap={onTap}
              onGestureActive={onTileGestureActive}
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
            scrollGesture={scrollGesture}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragRelease={onDragRelease}
            onDragCancel={onDragCancel}
            onTap={onTap}
            onGestureActive={onTileGestureActive}
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
