'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ── WordList ─────────────────────────────────────

export type WordListLayout = 'stack' | 'grid';

export interface WordListProps {
  /** Section heading (e.g., "Today", "Earlier"). Omit to hide the header. */
  label?: string;
  /** Count badge shown next to the heading. Only shown when label is provided. */
  count?: number;
  /** Rendered word rows or cards. */
  children: ReactNode;
  /** 'stack' (default) — single-column vertical list (space-y-1).
   *  'grid' — responsive card grid (grid-cols-1 → sm:grid-cols-2). */
  layout?: WordListLayout;
  /** Responsive grid template classes when layout="grid" (merged over the
   *  default "sm:grid-cols-2", e.g. "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"). */
  columns?: string;
  /** Extra classes for the list/grid container (overrides default spacing). */
  className?: string;
}

/**
 * A group of dictionary entry cards, optionally with a labeled heading and
 * count badge. When `label` is omitted, renders a bare list with no header.
 * `layout="grid"` renders the cards as a responsive grid instead of a
 * vertical stack, so labeled grid sections (saved words, related words) share
 * the same header + body pattern.
 */
export function WordList({
  label,
  count,
  children,
  layout = 'stack',
  columns,
  className,
}: WordListProps) {
  const bodyClass =
    layout === 'grid'
      ? cn('grid grid-cols-1 gap-3 sm:grid-cols-2', columns, className)
      : cn('space-y-1', className);

  if (!label) {
    return <div className={bodyClass}>{children}</div>;
  }
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-muted-foreground">{label}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {count ?? 0}
        </span>
      </div>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}
