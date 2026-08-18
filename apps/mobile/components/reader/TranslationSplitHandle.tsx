import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

/**
 * Draggable vertical handle for the readers' text|translation splitter
 * (SPEC-082 Task 3, web `translation-split-handle.tsx` parity).
 *
 * Sits in the boundary between the L2 tokenized column and the L1 translation
 * column on side-by-side rows. Dragging it updates a shared, persisted ratio
 * (`display.translationSplit`). Because every block shares the same setting,
 * dragging one handle resizes every block's columns at once.
 *
 * The split is derived DIRECTLY from the pointer's x-position within the row
 * on each move — `ratio = (cursorX - rowLeft) / rowWidth` — with no delta
 * accumulation, so the handle tracks the cursor 1:1. The row's window x is
 * derived at drag start from the handle's own window rect and the current
 * ratio: `rowLeft = handleCenterX - rowWidth * ratio`.
 *
 * `onChange` fires on every move (live re-split, no persistence); `onCommit`
 * fires ONCE on release so the caller can persist + re-measure page breaks.
 */
export function TranslationSplitHandle({
  ratio,
  rowWidth,
  onChange,
  onCommit,
  min = 0.3,
  max = 0.7,
  hidden = false,
}: {
  /** Current left-column (L2) fraction, 0–1. */
  ratio: number;
  /** Width of the row the handle sits in (content width). */
  rowWidth: number;
  /** Called with a new left-column fraction on each move. */
  onChange: (ratio: number) => void;
  /** Called ONCE with the final fraction when the drag ends. */
  onCommit?: (ratio: number) => void;
  /** Clamp bounds for the left-column fraction. */
  min?: number;
  max?: number;
  /** Hide the visible grip but keep the draggable touch target (EPUB). */
  hidden?: boolean;
}) {
  const [active, setActive] = useState(false);
  const handleRef = useRef<View>(null);
  const dragStateRef = useRef<{ rowLeft: number; rowWidth: number } | null>(null);

  const clamp = (r: number) => Math.min(max, Math.max(min, r));

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-3, 3])
    .onStart((e) => {
      setActive(true);
      handleRef.current?.measureInWindow((hx, _hy, hw) => {
        if (rowWidth <= 0) return;
        // The handle center sits at rowLeft + rowWidth*ratio — derive rowLeft.
        const rowLeft = hx + hw / 2 - rowWidth * ratio;
        dragStateRef.current = { rowLeft, rowWidth };
        const next = clamp((e.absoluteX - rowLeft) / rowWidth);
        if (next !== ratio) onChange(next);
      });
    })
    .onUpdate((e) => {
      const s = dragStateRef.current;
      if (!s || s.rowWidth <= 0) return;
      const next = clamp((e.absoluteX - s.rowLeft) / s.rowWidth);
      if (next !== ratio) onChange(next);
    })
    .onEnd(() => {
      dragStateRef.current = null;
      setActive(false);
      onCommit?.(ratio);
    })
    .onFinalize(() => {
      dragStateRef.current = null;
      setActive(false);
    });

  return (
    <GestureDetector gesture={pan}>
      <View
        ref={handleRef}
        collapsable={false}
        className="w-4 flex-none self-stretch"
        style={{
          marginHorizontal: -4,
          backgroundColor: active ? ICON_PRIMARY : 'transparent',
        }}
        accessibilityRole="adjustable"
        accessibilityLabel="Language text and translation divider"
      >
        {(!hidden || active) && (
          <View
            pointerEvents="none"
            className="absolute inset-y-0 left-1 right-1 rounded-sm"
            style={{ backgroundColor: active ? ICON_PRIMARY : ICON_MUTED, opacity: active ? 0.5 : 0.15 }}
          />
        )}
      </View>
    </GestureDetector>
  );
}
