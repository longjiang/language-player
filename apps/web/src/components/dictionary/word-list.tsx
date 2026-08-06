'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ── WordListItem ─────────────────────────────────

export interface WordListItemProps {
  /** Primary display form in the target language's script. */
  head: string;
  /** Alternative forms (inflections, conjugations) shown after the head. */
  altForms?: string[];
  /** The surface form that was saved, if different from head (shown in parentheses). */
  contextForm?: string;
  /** Lazy-loaded inline definition component. Rendered below the head line. */
  definitionSlot?: ReactNode;
  /** Secondary text line — subtitle context, example sentence, etc. */
  contextSlot?: ReactNode;
  /** Source attribution or metadata line. */
  sourceSlot?: ReactNode;
  /** Icon or indicator rendered before the head (e.g., SRS dot). */
  prefix?: ReactNode;
  /** Action button rendered after the text block (e.g., bookmark, remove). */
  suffix?: ReactNode;
  /** Click handler for the entire row. */
  onClick?: () => void;
  /** When true, reduces padding and typography size for compact layouts (sidebars). */
  compact?: boolean;
}

/**
 * A single word row — head form + optional alt forms, definition, context, source.
 * Designed to be composed with slots for customization.
 */
export function WordListItem({
  head,
  altForms,
  contextForm,
  definitionSlot,
  contextSlot,
  sourceSlot,
  prefix,
  suffix,
  onClick,
  compact = false,
}: WordListItemProps) {
  return (
    <div
      className={`flex cursor-pointer items-center gap-2 rounded-lg transition-colors hover:bg-muted/50 ${
        compact ? 'px-2 py-1' : 'px-3 py-2 gap-3'
      }`}
      onClick={onClick}
    >
      {/* Prefix (SRS dot, icon, etc.) */}
      {prefix}

      {/* Word info */}
      <div className="min-w-0 flex-1">
        {/* Head + alt forms */}
        <div className={`flex items-center gap-1.5 ${compact ? '' : 'gap-2'}`}>
          <span className={compact ? 'text-sm font-semibold' : 'text-lg font-semibold'}>{head}</span>
          {contextForm && contextForm !== head && (
            <span className="text-xs text-muted-foreground">({contextForm})</span>
          )}
          {altForms && altForms.length > 0 && (
            <span className="text-xs text-muted-foreground">{altForms.join(', ')}</span>
          )}
        </div>

        {/* Inline definition */}
        {definitionSlot}

        {/* Context line — same size regardless of mode */}
        {contextSlot}

        {/* Source attribution */}
        {sourceSlot && (
          <div className="mt-1 text-xs text-muted-foreground/70">{sourceSlot}</div>
        )}
      </div>

      {/* Suffix (action button) */}
      {suffix}
    </div>
  );
}

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
 * A group of word items, optionally with a labeled heading and count badge.
 * When `label` is omitted, renders a bare list with no header.
 * `layout="grid"` renders the items as a responsive card grid instead of a
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
