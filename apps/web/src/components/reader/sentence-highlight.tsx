'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { renderInlineMarkdown } from '@/components/text-action-panels';
import {
  buildSentenceMap,
  sentenceIndexAt,
  type SentenceMap,
} from '@langplayer/utils';

export interface SentenceHighlightCtx {
  /** L2↔translation sentence map for this block (null when unaligned). */
  map: SentenceMap | null;
  /** Index into `map.pairs` of the hovered L2 sentence, or null. */
  activeSentence: number | null;
  /** Wire into TokenizedText's onTokenHover. */
  onTokenHover: (range: { start: number; end: number } | null) => void;
}

/**
 * Per-block hover state for the reader's translation-sentence highlight.
 * Hovering a token in the L2 text highlights the translation sentence that
 * contains it. Each block gets its own instance (state must live in a
 * component because blocks render inside a map).
 */
export function SentenceHighlightBlock({
  text,
  translation,
  children,
}: {
  /** L2 block text. */
  text: string;
  /** L2→L1 translation of the block. */
  translation?: string | null;
  children: (ctx: SentenceHighlightCtx) => ReactNode;
}) {
  const [activeSentence, setActiveSentence] = useState<number | null>(null);

  const map = useMemo(
    () => (text && translation ? buildSentenceMap(text, translation) : null),
    [text, translation],
  );

  const onTokenHover = useCallback((range: { start: number; end: number } | null) => {
    setActiveSentence(range && map ? sentenceIndexAt(map, range.start) : null);
  }, [map]);

  return <>{children({ map, activeSentence, onTokenHover })}</>;
}

/**
 * Renders a translation as sentence spans so the active sentence can be
 * highlighted. Falls back to plain text when no map exists. The spans always
 * cover the full translation (sentences render in order, not per pair), and
 * each segment keeps its inline-markdown rendering.
 */
export function SegmentedTranslation({
  text,
  map,
  active,
}: {
  /** The full translation string. */
  text: string;
  map: SentenceMap | null;
  /** Index into `map.pairs` of the active L2 sentence. */
  active: number | null;
}) {
  if (!map) return <>{text}</>;

  // Which translation sentence does the active pair point at?
  const pair = active != null ? map.pairs[active] : undefined;
  const activeTrIndex = pair
    ? map.tr.findIndex(t => t.start === pair.tr.start)
    : -1;

  return (
    <>
      {map.tr.map((seg, i) => (
        <span
          key={i}
          className={i === activeTrIndex ? 'rounded-sm bg-primary/10' : undefined}
        >
          {renderInlineMarkdown(text.slice(seg.start, seg.end))}
        </span>
      ))}
    </>
  );
}
