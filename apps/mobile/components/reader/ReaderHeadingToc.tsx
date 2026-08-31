import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import type { ContentBlock } from '@/lib/parse-markdown';

/** One heading entry in the reader TOC — a heading text block's stream index. */
export interface ReaderHeading {
  /** Index of the heading block in the block stream (navigation target). */
  blockIndex: number;
  text: string;
  /** Heading depth (1–6). */
  depth: number;
}

/** Extract headings from a markdown block stream (h1–h6) for the TOC button. */
export function extractHeadings(blocks: ContentBlock[] | null): ReaderHeading[] {
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
 * highlighted, together with its ancestor headings, mirroring the EPUB chapter
 * tree's active-entry behaviour.
 */
export function ReaderHeadingToc({ headings, activeIndex, onSelect }: ReaderHeadingTocProps) {
  // Active section: the last heading at or before the reader's block.
  let current = -1;
  for (let i = 0; i < headings.length; i++) {
    if (activeIndex != null && headings[i]!.blockIndex <= activeIndex) current = i;
    else break;
  }
  // Ancestor path: headings before `current` whose depth is strictly smaller
  // than every heading after them up to `current` (the parent chain).
  const ancestors = new Set<number>();
  if (current >= 0) {
    let minDepth = headings[current]!.depth;
    for (let i = current - 1; i >= 0; i--) {
      if (headings[i]!.depth < minDepth) {
        ancestors.add(i);
        minDepth = headings[i]!.depth;
      }
    }
  }
  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
      {headings.map((h, i) => {
        const isCurrent = i === current;
        const isActive = ancestors.has(i);
        return (
          <Pressable
            key={`${h.blockIndex}-${i}`}
            onPress={() => onSelect(h)}
            className={`px-3 py-1.5 active:bg-muted ${isCurrent ? 'bg-primary/10' : ''}`}
            style={{ paddingLeft: 12 + Math.max(0, h.depth - 1) * 16 }}
            accessibilityRole="button"
          >
            <Text
              numberOfLines={1}
              className={`text-sm ${
                isCurrent
                  ? 'font-medium text-primary'
                  : isActive
                    ? 'text-primary/80'
                    : 'text-foreground'
              }`}
            >
              {h.text}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
