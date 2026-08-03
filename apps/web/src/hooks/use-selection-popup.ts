'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TextSelectionInfo {
  /** Selected text as rendered (annotations are `select-none`, so this matches
   *  the source text in the common case). */
  text: string;
  /** Viewport rect of the selection — anchor for the dictionary popup. */
  rect: { x: number; y: number; width: number; height: number };
}

/**
 * Watches the browser's native text selection inside a container and reports
 * non-collapsed selections as `selection` (with the range's viewport rect so a
 * popup can be anchored to it).
 *
 * The selection is cleared automatically when it collapses or moves outside
 * the container. `clear()` also collapses the browser selection so a dismissed
 * popup cannot be re-triggered by a stray click on the old highlight.
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
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      const text = sel.toString();
      if (!text.trim()) return;
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      setSelection((prev) =>
        prev?.text === text && prev.rect.x === rect.left && prev.rect.y === rect.top
          ? prev
          : { text, rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } }
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

    // Keep the popup honest: if the selection collapses or moves outside this
    // container, hide the menu.
    const onSelectionChange = () => {
      setSelection((prev) => {
        if (!prev) return prev;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
        const range = sel.getRangeAt(0);
        return container.contains(range.commonAncestorContainer) ? prev : null;
      });
    };

    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('selectionchange', onSelectionChange);

    return () => {
      document.removeEventListener('mouseup', onPointerUp);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, []);

  return { containerRef, selection, clear };
}
