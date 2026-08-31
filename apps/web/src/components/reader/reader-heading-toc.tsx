'use client';

import type { ReaderBlock } from '@/lib/parse-markdown';

/** One heading entry in the reader TOC — a heading text block's stream index. */
export interface ReaderHeading {
  /** Index of the heading block in the block stream (navigation target). */
  blockIndex: number;
  text: string;
  /** Heading depth (1–6). */
  depth: number;
}

/** Extract headings from a markdown block stream (h1–h6) for the TOC button. */
export function extractHeadings(blocks: ReaderBlock[] | null): ReaderHeading[] {
  if (!blocks) return [];
  const out: ReaderHeading[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.kind === 'text' && b.type === 'heading') {
      out.push({ blockIndex: i, text: b.text, depth: b.depth ?? 1 });
    }
  }
  return out;
}

interface ReaderHeadingTocProps {
  headings: ReaderHeading[];
  /** Active heading (the nearest heading not past the reader's current block). */
  activeIndex?: number | null;
  /** Navigate to a heading's block. */
  onSelect: (heading: ReaderHeading) => void;
}

/**
 * Heading-based table of contents for the notes/web reader (SPEC-087 §8).
 * Headings render as a nested list — indentation reflects the heading depth —
 * and the entry containing (or immediately before) the reader's position is
 * highlighted, mirroring the EPUB chapter tree's active-entry behaviour.
 */
export function ReaderHeadingToc({ headings, activeIndex, onSelect }: ReaderHeadingTocProps) {
  let activeDepth = Infinity;
  return (
    <div className="p-2">
      {headings.map((h, i) => {
        // Determine whether this heading is on the path to the active entry
        // (the deepest heading whose block index is <= activeIndex). Its
        // ancestors (smaller depth, earlier index, not yet passed) highlight.
        const isActive =
          activeIndex != null
          && activeIndex >= h.blockIndex
          && h.depth < activeDepth;
        if (isActive) activeDepth = h.depth;
        const isCurrent = h.blockIndex === activeIndex;
        return (
          <button
            key={`${h.blockIndex}-${i}`}
            onClick={() => onSelect(h)}
            className={`block w-full text-left rounded px-3 py-1.5 text-sm transition-colors hover:bg-muted ${
              isCurrent
                ? 'bg-primary/10 text-primary font-medium'
                : isActive
                  ? 'text-primary/80'
                  : 'text-foreground'
            }`}
            style={{ paddingLeft: `${12 + Math.max(0, h.depth - 1) * 16}px` }}
          >
            {h.text}
          </button>
        );
      })}
    </div>
  );
}
