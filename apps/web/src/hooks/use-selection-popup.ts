'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TextSelectionInfo {
  /** Selected text as rendered (annotations are `select-none`, so this matches
   *  the source text in the common case). */
  text: string;
  /** Viewport rect of the selection — anchor for the action popup. */
  rect: { x: number; y: number; width: number; height: number };
}

/**
 * Watches the browser's native text selection inside a container and reports
 * non-collapsed selections as `selection` (with the range's viewport rect so a
 * popup can be anchored to it).
 *
 * Dismissal is fully handled here:
 * - mousedown outside the container (the popup must stopPropagation on its own
 *   mousedowns so clicks on the menu itself don't dismiss it)
 * - the selection collapsing or moving outside the container
 * - Escape, or any scroll
 *
 * The popup root should be rendered through a portal (e.g. to document.body)
 * and attach the returned `menuRef` to it. While the mouse is pressed on the
 * popup, a focus-driven selection collapse (Firefox/Safari collapse the text
 * selection when a button takes focus) is ignored so the button's click event
 * still completes.
 */
export function useSelectionPopup<T extends Element>() {
  const containerRef = useRef<T | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const [selection, setSelection] = useState<TextSelectionInfo | null>(null);

  // After an outside mousedown dismisses the popup, the mouseup that follows
  // would re-capture the (still-valid) selection and immediately reopen it.
  // Swallow exactly one capture after an outside mousedown.
  const suppressNextCaptureRef = useRef(false);
  // True while the mouse is pressed on the popup menu itself.
  const menuPressedRef = useRef(false);

  const clear = useCallback(() => setSelection(null), []);

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
    const onPointerUp = () => {
      window.setTimeout(() => {
        menuPressedRef.current = false;
        if (suppressNextCaptureRef.current) {
          suppressNextCaptureRef.current = false;
          return;
        }
        capture();
      }, 0);
    };

    // Keyboard selection (Shift + arrows / Home / End / PgUp / PgDn).
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown') {
        window.setTimeout(capture, 0);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null);
    };

    // Capture phase so this runs before the popup's own mousedown handlers.
    // Clicking outside the tokenized block dismisses the popup; pressing on
    // the popup marks the interaction so a selection collapse doesn't close
    // it mid-click.
    const onMouseDownCapture = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) {
        menuPressedRef.current = true;
        return;
      }
      if (container.contains(target)) return;
      suppressNextCaptureRef.current = true;
      setSelection(null);
    };

    // Keep the popup honest: if the selection collapses or moves outside this
    // container, hide the menu.
    const onSelectionChange = () => {
      setSelection((prev) => {
        if (!prev) return prev;
        // The user is mid-press on a menu item — some browsers collapse the
        // selection when a button takes focus. Wait for the click to land.
        if (menuPressedRef.current) return prev;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
        const range = sel.getRangeAt(0);
        return container.contains(range.commonAncestorContainer) ? prev : null;
      });
    };

    // Reposition (or dismiss) when the page scrolls under a fixed popup.
    const onScroll = () => setSelection(null);

    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDownCapture, true);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('scroll', onScroll, true);

    return () => {
      document.removeEventListener('mouseup', onPointerUp);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDownCapture, true);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  return { containerRef, menuRef, selection, clear };
}
