import { useCallback, useEffect, useRef, useState } from 'react';
import { selectionStartOffset } from './selection-utils';

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

/**
 * Watches the browser's native text selection inside a container and reports
 * non-collapsed selections as `selection`. Ported from apps/web's
 * useSelectionPopup (SPEC-033) so the extension's tokenized subtitle lines
 * match the web's drag-select → dictionary popup interaction.
 *
 * The popup owns its own dismissal; the selection is only cleared explicitly
 * via `clear()` (which also collapses the native selection so a dismissed
 * popup cannot be re-triggered by a stray click on the old highlight). There
 * is deliberately no selectionchange auto-close.
 */
export function useSelectionPopup<T extends Element>(enabled = true) {
  const containerRef = useRef<T | null>(null);
  const [selection, setSelection] = useState<TextSelectionInfo | null>(null);

  const clear = useCallback(() => {
    setSelection(null);
    // Collapse the native selection too — otherwise a dismissed popup would
    // re-open on the next mouseup over the still-highlighted text.
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const capture = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      const text = sel.toString();
      if (!text.trim()) return;
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
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
        if (activeTouches > 0) return;
        capture();
      }, 400);
    };

    const onTouchStart = () => {
      activeTouches++;
    };
    const onTouchEnd = () => {
      if (activeTouches > 0) activeTouches--;
      scheduleTouchCapture();
    };
    const onTouchCancel = () => {
      if (activeTouches > 0) activeTouches--;
      scheduleTouchCapture();
    };
    const onSelectionChange = () => {
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
  }, [enabled]);

  return { containerRef, selection, clear };
}
