'use client';

import { useRef, useState, type PointerEvent, type MouseEvent } from 'react';

/**
 * Draggable vertical handle for the readers' text|translation splitter.
 *
 * Sits in the boundary between the L2 tokenized column and the L1 translation
 * column on side-by-side rows. Dragging it updates a shared, persisted ratio
 * (`display.translationSplit`): the caller stores the ratio, the handle only
 * reports deltas anchored to its parent row's measured width. Because every
 * block shares the same setting, dragging one handle resizes every block's
 * columns at once.
 *
 * The handle is deliberately slim and neutral — a faint highlight on hover /
 * drag plus a col-resize cursor — so per-block rows stay visually quiet until
 * the user interacts. Pointer capture keeps the drag tracking even when the
 * pointer leaves the small hit area.
 */
export function TranslationSplitHandle({
  ratio,
  onChange,
  onCommit,
  min = 0.3,
  max = 0.7,
  className = '',
}: {
  /** Current left-column (L2) fraction, 0–1. */
  ratio: number;
  /** Called with a new left-column fraction on each pointer move. */
  onChange: (ratio: number) => void;
  /** Called ONCE with the final fraction when the drag ends. */
  onCommit?: (ratio: number) => void;
  /** Clamp bounds for the left-column fraction. */
  min?: number;
  max?: number;
  className?: string;
}) {
  const [active, setActive] = useState(false);
  const dragAnchor = useRef<{ width: number; end: number } | null>(null);

  const clamp = (r: number) => Math.min(max, Math.max(min, r));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const row = e.currentTarget.parentElement;
    if (!row) return;
    dragAnchor.current = { width: row.getBoundingClientRect().width, end: e.clientX };
    setActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragAnchor.current) return;
    const delta = e.clientX - dragAnchor.current.end;
    const width = Math.max(1, dragAnchor.current.width);
    const next = clamp(ratio + delta / width);
    if (next !== ratio) onChange(next);
  };

  const stop = (e: PointerEvent<HTMLDivElement>) => {
    dragAnchor.current = null;
    setActive(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // Commit the latest rendered ratio once, on release / cancel.
    onCommit?.(ratio);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => stop(e);
  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => stop(e);

  const preventClickDefault = (e: MouseEvent<HTMLDivElement>) => e.preventDefault();

  return (
    <div
      role="separator"
      aria-label="Language text and translation divider"
      className={`group/divider relative hidden lg:block self-stretch w-4 -mx-1 flex-none cursor-col-resize select-none touch-none transition-colors ${active ? 'bg-primary/40' : ''} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={preventClickDefault}
      onContextMenu={preventClickDefault}
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-1 right-1 rounded-sm transition-colors group-hover/divider:bg-primary/20 group-active/divider:bg-primary/40"
        aria-hidden="true"
      />
    </div>
  );
}
