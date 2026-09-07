'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TextSelectionInfo {
  /** Selected text as rendered (annotations are `select-none`, so this matches
   *  the source text in the common case). */
  text: string;
  /** UTF-16 character offset of the selection start within the tokenized
   *  source text (select-none annotations excluded). Null when the offset
   *  can't be determined from the DOM. */
  startOffset: number | null;
  /** Viewport rect of the selection — anchor for the dictionary popup. */
  rect: { x: number; y: number; width: number; height: number };
}

/** True when a text node lives inside a `select-none` annotation (ruby
 *  readings, quick glosses, interlinear definitions, quiz blanks) — those are
 *  excluded from selections and from the source-text offset mapping. */
function isSelectNoneText(node: Node): boolean {
  return !!node.parentElement?.closest('.select-none');
}

/**
 * Resolve a Range boundary to a text node. Element-node boundaries (e.g.
 * keyboard selection landing between spans) are moved to the first text node
 * inside the child they point at; boundaries with no text (end of container)
 * are returned unresolved so the caller can fall back.
 */
function normalizeBoundary(node: Node, offset: number): { node: Node; offset: number } {
  if (node.nodeType === Node.TEXT_NODE) return { node, offset };
  const child = node.childNodes[offset] as Node | undefined;
  if (!child) return { node, offset };
  const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
  const firstText = walker.nextNode();
  return firstText ? { node: firstText, offset: 0 } : { node, offset };
}

/**
 * UTF-16 offset of a Range's start within the container's selectable text.
 * Walks text nodes in document order, skipping `select-none` annotations, and
 * adds the range's in-node offset once the boundary node is reached.
 */
function selectionStartOffset(container: Node, range: Range): number | null {
  const boundary = normalizeBoundary(range.startContainer, range.startOffset);
  if (boundary.node.nodeType !== Node.TEXT_NODE) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current === boundary.node) return total + boundary.offset;
    if (!isSelectNoneText(current)) {
      total += current.textContent?.length ?? 0;
    }
    current = walker.nextNode();
  }
  return null;
}

/**
 * Watches the browser's native text selection inside a container and reports
 * non-collapsed selections as `selection` (with the range's viewport rect so a
 * popup can be anchored to it).
 *
 * `selection` tracks the live native selection: it is set when a valid
 * non-collapsed selection appears inside the container, and cleared whenever
 * that selection goes away on the same discrete triggers (mouseup / keyup /
 * touch-settle) — e.g. when the user clicks away to cancel it. This guarantees
 * the tooltip can never remain visible without a real selection (SPEC-033
 * §States). It is also cleared explicitly via `clear()` — which likewise
 * collapses the browser selection so a dismissed popup cannot be re-triggered
 * by a stray click on the old highlight.
 *
 * There is deliberately no selectionchange auto-close: clicking or dragging
 * inside the popup dialog collapses/replaces the underlying text selection,
 * which would otherwise unmount the popup mid-interaction. The dictionary popup
 * holds its own `selectionLookup` state, so clearing `selection` on a mouseup
 * inside the dialog never unmounts it.
 *
 * Touch devices (iPhone/iPad Safari): iOS selects text by long-press +
 * selection handles and does not reliably fire `mouseup` afterwards, so touch
 * detection tracks active touches (`touchstart`/`touchend`/`touchcancel`) and
 * only captures once every finger is off the screen AND the selection has been
 * quiet for a short settle window. `selectionchange` events that arrive while
 * a finger is still down (mid-gesture) are ignored.
 */
export function useSelectionPopup<T extends Element>() {
  const containerRef = useRef<T | null>(null);
  const [selection, setSelection] = useState<TextSelectionInfo | null>(null);

  const clear = useCallback(() => {
    setSelection(null);
    // Collapse the native selection too — otherwise a dismissed popup would
    // re-open on the next mouseup over the still-highlighted text.
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const capture = () => {
      const sel = window.getSelection();
      // No valid selection: the native selection was collapsed (e.g. the user
      // clicked away to cancel it), moved outside the container, or is empty.
      // Clear the reported selection so the tooltip can never stay visible
      // without a real selection (SPEC-033 §States). We only ever clear on the
      // same discrete triggers that set it (mouseup / keyup / touch-settle) —
      // never on `selectionchange` auto-close — so the dictionary popup (which
      // holds its own `selectionLookup` state) is never unmounted mid-interaction.
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const text = sel.toString();
      if (!text.trim()) {
        setSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setSelection(null);
        return;
      }
      const startOffset = selectionStartOffset(container, range);
      setSelection((prev) =>
        prev?.text === text && prev.rect.x === rect.left && prev.rect.y === rect.top
          ? prev
          : { text, startOffset, rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } }
      );
    };

    // mouseup runs before the selection is fully settled in some browsers, so
    // defer the read by one task.
    const onPointerUp = () => window.setTimeout(capture, 0);

    // Keyboard selection (Shift + arrows / Home / End / PgUp / PgDn).
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown') {
        window.setTimeout(capture, 0);
      }
    };

    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    let touchTimer: number | null = null;
    let activeTouches = 0;

    const scheduleTouchCapture = () => {
      if (touchTimer) clearTimeout(touchTimer);
      touchTimer = window.setTimeout(() => {
        touchTimer = null;
        // Only open once every finger is off the screen — the quiet timer can
        // expire during a stationary hold on a selection handle, and opening a
        // modal then would interrupt the gesture.
        if (activeTouches > 0) return;
        capture();
      }, 400);
    };

    const onTouchStart = () => {
      activeTouches++;
    };
    const onTouchEnd = () => {
      if (activeTouches > 0) activeTouches--;
      // Finger is up — start the settle window for the final selection.
      scheduleTouchCapture();
    };
    const onTouchCancel = () => {
      if (activeTouches > 0) activeTouches--;
      scheduleTouchCapture();
    };
    const onSelectionChange = () => {
      // Ignore changes while a finger is down (mid-gesture); the touchend
      // handler starts the settle timer once the finger lifts.
      if (activeTouches > 0) return;
      scheduleTouchCapture();
    };

    if (isTouch) {
      document.addEventListener('touchstart', onTouchStart);
      document.addEventListener('touchend', onTouchEnd);
      document.addEventListener('touchcancel', onTouchCancel);
      document.addEventListener('selectionchange', onSelectionChange);
    } else {
      document.addEventListener('mouseup', onPointerUp);
      document.addEventListener('keyup', onKeyUp);
    }

    return () => {
      if (touchTimer) clearTimeout(touchTimer);
      if (isTouch) {
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('touchcancel', onTouchCancel);
        document.removeEventListener('selectionchange', onSelectionChange);
      } else {
        document.removeEventListener('mouseup', onPointerUp);
        document.removeEventListener('keyup', onKeyUp);
      }
    };
  }, []);

  return { containerRef, selection, clear };
}
