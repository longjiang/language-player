/**
 * Per-line baseline-aligned translation for the side-by-side reader rows
 * (SPEC-082 web `AlignedTranslation` parity, mobile adaptation).
 *
 * The web version renders each translation line in a flex row whose height
 * is exactly one L2 line box, with an invisible anchor reproducing the L2
 * font/size and `align-items: baseline` pulling the smaller translation
 * line onto the L2 line's baseline. React Native's Yoga baseline alignment
 * does not survive the nested View token layout, so this component computes
 * the same geometry explicitly:
 *
 *   - The L2 line grid comes from `onLineGrid` on the block's TokenizedText:
 *     for ruby paragraphs it is measured natively on the paragraph's own
 *     TextKit 2 layout WITH the ruby annotations (the reading band pushes
 *     the base text's baseline down inside each pinned line box, so a
 *     ruby-free RN Text cannot reproduce it); the plain inline-Text path
 *     reports RN's own lines. Rows use each L2 line's own height and
 *     baseline (`l2Lines[j].height` / `l2Lines[j].ascender`).
 *   - The translation is sliced into its visual lines on a hidden probe
 *     Text with the translation font and `lineHeight = L2 line pitch`
 *     (`onTextLayout` reports each line's text and metrics directly).
 *   - Each translation line renders in a row of exactly its L2 line box,
 *     shifted by `l2Line.ascender − lineAscender` so its baseline coincides
 *     with the L2 line's baseline, whatever the two fonts' metrics are.
 *
 * Rows are only rendered once the probe has measured (the same measure-then-
 * render two-phase the web component uses); until then, a plain paragraph
 * with the same font size and line spacing stands in, so the swap is
 * layout-neutral. When no L2 grid is available (non-paragraph render paths,
 * e.g. Expo Go / Android view columns) the reader falls back to the plain
 * translation column and never mounts this component.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { TextLayoutEvent } from 'react-native';
import { lineOffsets, type GridLine, type TextLayoutLine } from '@/lib/aligned-translation';

export interface AlignedTranslationProps {
  /** Translation text (L1). */
  text: string;
  /** The L2 block's measured line grid (from TokenizedText's onLineGrid). */
  l2Lines: GridLine[];
  /** Translation font size (px) — the column's existing size. */
  trFontSize: number;
  /** Tailwind color class for the translation text (e.g. text-muted-foreground). */
  className?: string;
  /** Active translation-sentence char range in `text` (SPEC-082 Task 4 tap
   *  highlight) — applied to whichever sliced lines it intersects. */
  highlight?: { start: number; end: number } | null;
}

interface ProbeState {
  /** Which text/size/grid this measurement belongs to (staleness guard). */
  key: string;
  lines: TextLayoutLine[];
}

/** Baseline offset from the line's top. RN reports the per-line ascent in
 *  `ascender` on both platforms (verified on the iOS TextKit 2 layout path:
 *  constant per line while `y` varies), matching Android's `-getLineAscent`.
 *  For the native ruby paragraph the native reporter provides the same
 *  semantics with the ruby band already included. */
export function lineBaselineOffset(ln: GridLine): number {
  return ln.ascender;
}

function AlignedTranslationImpl({
  text,
  l2Lines,
  trFontSize,
  className = 'text-muted-foreground',
  highlight = null,
}: AlignedTranslationProps) {
  const [probe, setProbe] = useState<ProbeState | null>(null);

  // L2 line pitch: consecutive line tops (probe spacing + stand-in line
  // height). For a single-line block the only measure is the line's height.
  const lh2 =
    l2Lines.length > 1
      ? l2Lines[1]!.y - l2Lines[0]!.y
      : l2Lines.length === 1
        ? l2Lines[0]!.height
        : 0;
  const probeKey = `${text}:${trFontSize}:${lh2}`;

  const handleProbeLayout = useCallback(
    (e: TextLayoutEvent) => {
      const lines = e.nativeEvent.lines;
      setProbe((prev) =>
        prev && prev.key === probeKey && prev.lines === lines ? prev : { key: probeKey, lines },
      );
    },
    [probeKey],
  );

  const ready = probe != null && probe.key === probeKey && probe.lines.length > 0;
  const offsets = useMemo(
    () => (ready ? lineOffsets(text, probe!.lines) : []),
    [ready, text, probe],
  );

  if (!text || lh2 <= 0) {
    return <Text className={className} style={{ fontSize: trFontSize }}>{text}</Text>;
  }

  // Probe (hidden, out of flow) — same font and line box as the rows, so it
  // wraps exactly like the rendered lines and reports each line's text and
  // ascender. Stays mounted: width changes (rotation, zoom, splitter drag)
  // re-wrap it automatically and re-fire onTextLayout.
  const probeEl = (
    <Text
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        opacity: 0,
        fontSize: trFontSize,
        lineHeight: lh2,
      }}
      className={className}
      onTextLayout={handleProbeLayout}
    >
      {text}
    </Text>
  );

  if (!ready) {
    // One-frame stand-in: same size and line spacing as the aligned rows, so
    // the swap to sliced rows is layout-neutral.
    return (
      <View>
        {probeEl}
        <Text className={className} style={{ fontSize: trFontSize, lineHeight: lh2 }}>{text}</Text>
      </View>
    );
  }

  return (
    <View>
      {probeEl}
      {probe!.lines.map((ln, j) => {
        const off = offsets[j] ?? { start: 0, end: 0 };
        const lineText = text.slice(off.start, off.end);
        // This row pairs with L2 line j: its own box height and baseline
        // (per-line — the ruby band can shift the first line differently
        // from the rest). The shift puts the translation line's baseline on
        // the L2 line's baseline; negative when the translation font's
        // ascent is larger.
        const l2Line = l2Lines[Math.min(j, l2Lines.length - 1)] ?? l2Lines[l2Lines.length - 1]!;
        const shift = lineBaselineOffset(l2Line) - lineBaselineOffset(ln);
        const hl = highlight && highlight.start < off.end && highlight.end > off.start;
        return (
          <View key={j} style={{ height: l2Line.height }}>
            <Text
              numberOfLines={1}
              className={className}
              style={{ fontSize: trFontSize, lineHeight: lh2, marginTop: shift }}
            >
              {hl ? (
                <>
                  {off.start < highlight!.start && (
                    <Text>{lineText.slice(0, highlight!.start - off.start)}</Text>
                  )}
                  <Text className="bg-primary/15">
                    {lineText.slice(
                      Math.max(0, highlight!.start - off.start),
                      Math.min(lineText.length, highlight!.end - off.start),
                    )}
                  </Text>
                  {highlight!.end < off.end && (
                    <Text>{lineText.slice(highlight!.end - off.start)}</Text>
                  )}
                </>
              ) : (
                lineText
              )}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Memoized: the reader re-renders its whole page on scroll-window changes,
 *  tokenCache batches, and sync updates; the props here are stable per
 *  layout (l2Lines is stored once per grid signature), so skipping equal
 *  prop sets keeps the translation column from re-rendering with the page. */
export const AlignedTranslation = memo(AlignedTranslationImpl);
