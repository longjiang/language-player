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
 *
 * Baseline-math note: each row renders its translation as a SINGLE-line Text
 * with no pinned lineHeight, so its on-canvas baseline sits at the raw font
 * ascent. The wrapping probe, by contrast, pins `lineHeight: lh2` and its
 * reported `ascender` includes the half-leading — subtracting THAT (as the
 * code once did) over-shifted the rows 2–5px and accrued line after line on
 * iOS. We subtract the single-line ascent (measured on a second,
 * lineHeight-free probe) so the reference exactly matches how the row paints.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { LayoutChangeEvent, TextLayoutEvent } from 'react-native';
import { lineOffsets, type GridLine, type TextLayoutLine } from '@/lib/aligned-translation';
import { readerLogger } from '@/lib/logger';

const { log } = readerLogger;

export interface AlignedTranslationProps {
  /** Translation text (L1). */
  text: string;
  /** The L2 block's measured line grid (from TokenizedText's onLineGrid). */
  l2Lines: GridLine[];
  /** Translation font size (px) — the column's existing size. */
  trFontSize: number;
  /** Translation line height (px) — used for translation lines that flow
   *  below the aligned L2 grid (when the translation wraps to more lines than
   *  the L2 paragraph). Defaults to `round(trFontSize × READER_DEFAULT_LEADING)`. */
  trLineHeight?: number;
  /** Tailwind color class for the translation text (e.g. text-muted-foreground). */
  className?: string;
  /** Active translation-sentence char range in `text` (SPEC-082 Task 4 tap
   *  highlight) — applied to whichever sliced lines it intersects. */
  highlight?: { start: number; end: number } | null;
}

/** Baseline offset from the L2 line's top. RN reports the per-line ascent in
 *  `ascender` on both platforms (verified on the iOS TextKit 2 layout path:
 *  constant per line while `y` varies), matching Android's `-getLineAscent`.
 *  For the native ruby paragraph the native reporter provides the same
 *  semantics with the ruby band already included. This is the TARGET baseline
 *  we align the translation to.
 */
export function lineBaselineOffset(ln: GridLine): number {
  return ln.ascender;
}

interface ProbeState {
  /** Which text/size/grid this measurement belongs to (staleness guard). */
  key: string;
  lines: TextLayoutLine[];
}

function AlignedTranslationImpl({
  text,
  l2Lines,
  trFontSize,
  trLineHeight,
  className = 'text-muted-foreground',
  highlight = null,
}: AlignedTranslationProps) {
  const naturalTrLineHeight = trLineHeight ?? Math.round(trFontSize * 1.625);
  const [probe, setProbe] = useState<ProbeState | null>(null);
  // The TRANSLATION font's raw single-line ascent. The wrapping probe below
  // pins `lineHeight: lh2`, so its reported per-line `ascender` includes the
  // half-leading (`ascent + (lh2 − (ascent+descent)) / 2`). But each row's
  // translation is rendered as a pixel-identical SINGLE-line Text: one glyph
  // run, top-aligned, its baseline at the raw font ascent — NOT at the
  // half-leading-inflated ascender (that mismatch over-shifted the rows
  // 2–5px and accrued line after line). So we measure the raw ascent on the
  // same single-line shape the rows render and subtract THAT from the L2
  // target. Kept on state so the sliced render is only committed once the
  // alignment reference is known.
  const [naturalAscent, setNaturalAscent] = useState<number | null>(null);
  // TEMP DIAG (issue: intermittent extra paragraph gap in the side-by-side
  // EPUB reader): capture the rendered column height so we can compare the
  // stand-in (pre-measure) vs aligned (post-measure) heights against the L2
  // grid height. Remove once the cause is confirmed.
  const [diagH, setDiagH] = useState<number | null>(null);
  const handleDiagLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setDiagH((prev) => (prev === h ? prev : h));
  }, []);

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
  // Natural single-line render metrics — a single "Ag中" run at the same font
  // with no pinned lineHeight, matching EXACTLY how each row renders its
  // translation line (top-aligned, baseline at raw ascent). Invalidates when
  // the font size changes.
  const handleNaturalProbeLayout = useCallback((e: TextLayoutEvent) => {
    const l0 = e.nativeEvent.lines[0];
    if (!l0) return;
    setNaturalAscent((prev) => (prev === l0.ascender ? prev : l0.ascender));
  }, []);

  const ready = probe != null && probe.key === probeKey && probe.lines.length > 0;
  const offsets = useMemo(
    () => (ready ? lineOffsets(text, probe!.lines) : []),
    [ready, text, probe],
  );

  // TEMP DIAG (issue: intermittent extra paragraph gap in the side-by-side
  // EPUB reader). Logs the render mode (stand-in pre-measure vs aligned) and
  // the rendered column height vs the L2 grid height. When the translation
  // column is taller than the L2 grid the block is inflated and the next
  // paragraph is pushed down — an apparent "extra line between paragraphs".
  useEffect(() => {
    if (!__DEV__) return;
    const aligned = ready && naturalAscent != null;
    const gridH = l2Lines.length > 0
      ? Math.round(l2Lines[l2Lines.length - 1]!.y + l2Lines[l2Lines.length - 1]!.height)
      : 0;
    log(`[AlignedTranslation] DIAG mode=${aligned ? 'aligned' : 'standIn'} textLen=${text.length} trLines=${probe?.lines.length ?? 'n/a'} l2Lines=${l2Lines.length} lh2=${Math.round(lh2)} alignRows=${aligned ? Math.min(probe!.lines.length, l2Lines.length) : 'n/a'} colH=${diagH ?? 'n/a'} l2GridH=${gridH}`);
  }, [ready, naturalAscent, text, probe, l2Lines, lh2, diagH]);

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

  // Natural single-line ascent probe (hidden). The rows slice `text` by the
  // wrapping probe's lines; their rendered baselines come from THIS probe.
  const naturalProbeEl = (
    <Text
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        opacity: 0,
        fontSize: trFontSize,
      }}
      className={className}
      numberOfLines={1}
      onTextLayout={handleNaturalProbeLayout}
    >
      {'Ag中'}
    </Text>
  );

  // alignmentReady: wrapped lines known AND the single-line baseline known.
  // Until both land, render the layout-neutral stand-in (same font and pitch).
  const alignmentReady = ready && naturalAscent != null;

  if (!alignmentReady) {
    // One-frame stand-in: same size and line spacing as the aligned rows, so
    // the swap to sliced rows is layout-neutral.
    return (
      <View onLayout={handleDiagLayout}>
        {probeEl}
        {naturalProbeEl}
        <Text className={className} style={{ fontSize: trFontSize, lineHeight: lh2 }}>{text}</Text>
      </View>
    );
  }

  // The translation typically wraps to MORE visual lines than the L2
  // paragraph (the L2 column is wider and the translation is narrower). Pair
  // the first `l2Lines.length` translation lines 1:1 with the L2 lines so
  // they stay baseline-aligned, and let any REMAINING translation lines flow
  // tightly below at the translation's natural line height. This shows the
  // whole translation (SPEC-087 §3) without the old all-rows-at-lh2 pile-up
  // that produced huge blank gaps between lines.
  const alignedCount = Math.min(probe!.lines.length, l2Lines.length);
  const leftoverStart = alignedCount < probe!.lines.length
    ? (offsets[alignedCount - 1]?.end ?? text.length)
    : text.length;
  const leftover = leftoverStart < text.length ? text.slice(leftoverStart) : '';
  const leftoverHl =
    highlight && leftoverStart < text.length && highlight.end > leftoverStart
      ? {
          start: Math.max(0, highlight.start - leftoverStart),
          end: Math.min(leftover.length, highlight.end - leftoverStart),
        }
      : null;

  return (
    <View onLayout={handleDiagLayout}>
      {probeEl}
      {naturalProbeEl}
      {probe!.lines.slice(0, alignedCount).map((ln, j) => {
        const off = offsets[j] ?? { start: 0, end: 0 };
        const lineText = text.slice(off.start, off.end);
        // This row pairs with L2 line j (per-line — the ruby band can shift
        // the first line differently from the rest). The shift puts the
        // translation line's single-line baseline on the L2 line's baseline.
        // We subtract the SINGLE-LINE baseline (naturalAscent), not the
        // wrapping probe's half-leading-inflated ascender.
        const l2Line = l2Lines[Math.min(j, l2Lines.length - 1)] ?? l2Lines[l2Lines.length - 1]!;
        const shift = lineBaselineOffset(l2Line) - naturalAscent!;
        if (j === 0) {
          const l2Prev = j + 1 < l2Lines.length ? lineBaselineOffset(l2Lines[j + 1]!) : null;
          log(`[AlignedTranslation] trLines=${probe!.lines.length} l2Lines=${l2Lines.length} trFontSize=${trFontSize} lh2=${lh2} l2Asc0=${lineBaselineOffset(l2Lines[0]!)} l2Asc1=${l2Prev} trNaturalAsc=${naturalAscent} shift0=${shift}`);
        }
        const hl = highlight && highlight.start < off.end && highlight.end > off.start;
        return (
          // Rows stack at the L2 line PITCH (lh2): RN's reported line
          // `height` can exceed the pitch by a few px on iOS, so rows sized
          // by it drift from the L2 grid every line. The translation line
          // renders with NO pinned lineHeight (natural single line), so its
          // on-canvas baseline is exactly `naturalAscent` from its top and
          // `shift` lands it on the L2 baseline unambiguously.
          <View key={j} style={{ height: lh2 }}>
            <Text
              numberOfLines={1}
              className={className}
              style={{ fontSize: trFontSize, marginTop: shift }}
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
      {leftover ? (
        <Text className={className} style={{ fontSize: trFontSize, lineHeight: naturalTrLineHeight }}>
          {leftoverHl ? (
            <>
              {leftoverHl.start > 0 && <Text>{leftover.slice(0, leftoverHl.start)}</Text>}
              <Text className="bg-primary/15">
                {leftover.slice(leftoverHl.start, leftoverHl.end)}
              </Text>
              {leftoverHl.end < leftover.length && <Text>{leftover.slice(leftoverHl.end)}</Text>}
            </>
          ) : (
            leftover
          )}
        </Text>
      ) : null}
    </View>
  );
}

/** Memoized: the reader re-renders its whole page on scroll-window changes,
 *  tokenCache batches, and sync updates; the props here are stable per
 *  layout (l2Lines is stored once per grid signature), so skipping equal
 *  prop sets keeps the translation column from re-rendering with the page. */
export const AlignedTranslation = memo(AlignedTranslationImpl);
