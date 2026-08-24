'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { renderInlineMarkdown } from '@/components/text-action-panels';
import { SegmentedTranslation } from '@/components/reader/sentence-highlight';
import { TRANSLATION_FACTOR } from '@/lib/reader-text-size';
import { log, logwarn } from '@/lib/logger';
import type { SentenceMap } from '@langplayer/utils';

/**
 * Per-line baseline-aligned translation for the paginated readers.
 *
 * The translation column keeps its smaller font but is sliced into its
 * visual lines (measured on a hidden probe with the same width and font) and
 * rendered as flex rows that sit on the L2 block's line grid. Each row
 * contains an invisible anchor that reproduces the L2 font / size / line
 * height (same font stack + "Ag中" glyphs, so CJK and Latin metrics both
 * resolve like the L2 text), and `align-items: baseline` pulls the smaller
 * translation line's baseline onto the anchor's baseline — i.e. the L2
 * line's baseline, whatever the two fonts' metrics are.
 *
 * Rows are spaced by the measured inter-base gaps of the L2 block, so the
 * grid holds even when ruby annotations (phonetics) or interlinear
 * definitions inflate individual L2 lines: the base text's line boxes are
 * recovered from the full line boxes by filtering out the thin annotation /
 * definition boxes and offsetting by the ruby band above each base line.
 *
 * With phonetics (ruby) on, the measured grid rows are the base text's
 * content boxes (ruby splits the inline contexts), so each L2 baseline sits
 * `halfLeading + ascent` below its row top — exactly as in the ruby-off
 * grid (line boxes). The row grid therefore starts halfLeading BELOW the
 * first base top (`topPad = band − halfLeading`, ≈0 without ruby): the
 * translation baseline then lands on the L2 baselines with the same
 * (sub-pixel) offset the ruby-off layout already has.
 *
 * Falls back to a plain paragraph when the layout can't be measured or the
 * translation is stacked below the L2 text (narrow viewports), where the
 * line grid can't be shared.
 */

interface LineSlice {
  /** Offsets into the translation text (whitespace-trimmed). */
  start: number;
  end: number;
}

interface LineLayout {
  /** Spacer height (px) after each L2 line, incl. the last. */
  gaps: number[];
  /** The translation's visual lines, sliced on the probe. */
  lines: LineSlice[];
  /** Offset (px) from the translation column top to the first row's start:
   *  `band − halfLeading`, where band is the first line's ruby-band height
   *  (the ruby-on line box grows upward past the base text) and halfLeading
   *  is the L2 line box's half-leading. With ruby on the measured grid rows
   *  are content-box tops, so the rows must start halfLeading BELOW the
   *  base tops to reproduce the ruby-off baseline geometry; without ruby
   *  band ≈ halfLeading (or 0), so the offset is ≈0 and nothing changes. */
  topPad: number;
  /** The L2 text's rendered font metrics (px). */
  l2FontSize: number;
  l2LineHeight: number;
  anchorFont: { family: string; weight: string; style: string };
}

export interface AlignedTranslationProps {
  /** The translation text (L1). */
  text: string;
  /** L2↔translation sentence map (from SentenceHighlightBlock). */
  map: SentenceMap | null;
  /** Index into `map.pairs` of the hovered L2 sentence, or null. */
  active: number | null;
  /** Ref to the L2 text element whose line grid we align to. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Layout identity — re-measure when it changes (zoom, ruby, fonts…). */
  measureNonce?: string | number;
  /** Translation font size as a multiplier of the L2 rendered size
   *  (defaults to `TRANSLATION_FACTOR`). */
  translationFactor?: number;
}

/** Text nodes that don't carry the L2 base line: ruby annotations and the
 *  interlinear definition / byeonggi slots (both use `text-[0.55em]`). */
function isAuxiliary(node: Text, anchor: HTMLElement): boolean {
  for (let el = node.parentElement; el && el !== anchor; el = el.parentElement) {
    if (el.tagName === 'RT') return true;
    if (el.classList.contains('text-[0.55em]')) return true;
  }
  return false;
}

/** First non-whitespace text node of the L2 content (skips annotations). */
function firstTextNode(root: HTMLElement): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    if (text.data.trim().length && !isAuxiliary(text, root)) return text;
  }
  return null;
}

/** Rects of all line boxes under `root`, restricted to text nodes matching
 *  `keep` (default: all). */
function textRects(root: HTMLElement, keep?: (node: Text) => boolean): DOMRect[] {
  const out: DOMRect[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    if (!text.data.length) continue;
    if (keep && !keep(text)) continue;
    range.selectNodeContents(text);
    for (const r of Array.from(range.getClientRects())) out.push(r);
  }
  return out;
}

/** Top of the single character at `offset` in `node`. */
function charTop(node: Text, offset: number): number {
  const range = document.createRange();
  range.setStart(node, offset);
  range.setEnd(node, Math.min(node.length, offset + 1));
  return range.getBoundingClientRect().top;
}

/** One visual line of the translation, rendered as sentence spans so the
 *  active-sentence hover highlight still works across sliced lines. */
function renderSlicedLine(
  text: string,
  line: LineSlice,
  map: SentenceMap | null,
  active: number | null,
): ReactNode {
  const clean = (s: number, e: number) => text.slice(s, e).replace(/\r\n/g, ' ').replace(/\n/g, ' ');
  if (!map) return renderInlineMarkdown(clean(line.start, line.end));
  const pair = active != null ? map.pairs[active] : undefined;
  const activeTrIndex = pair ? map.tr.findIndex(t => t.start === pair.tr.start) : -1;
  const out: ReactNode[] = [];
  for (let i = 0; i < map.tr.length; i++) {
    const seg = map.tr[i]!;
    const s = Math.max(seg.start, line.start);
    const e = Math.min(seg.end, line.end);
    if (s >= e) continue;
    out.push(
      <span key={i} className={i === activeTrIndex ? 'rounded-sm bg-primary/10' : undefined}>
        {renderInlineMarkdown(clean(s, e))}
      </span>,
    );
  }
  return out;
}

export function AlignedTranslation({
  text,
  map,
  active,
  anchorRef,
  measureNonce = 0,
  translationFactor = TRANSLATION_FACTOR,
}: AlignedTranslationProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<LineLayout | null>(null);
  // The L2 block's first-line text-indent (px) — e.g. the EPUB reader's
  // `[&_p]:indent-[1em]`. Mirrored onto the stacked (narrow-screen) fallback
  // so the translation starts at the same indentation as the tokenized text.
  const [l2TextIndent, setL2TextIndent] = useState(0);
  // Short text preview so log lines from different blocks are distinguishable.
  const tag = text.slice(0, 24).replace(/\s+/g, ' ');

  // Read the anchor's rendered first-line indent whenever the layout identity
  // changes (the indent lives on the L2 block's element, not the column div).
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const base = firstTextNode(anchor);
    const el = base?.parentElement ?? anchor;
    const ti = parseFloat(getComputedStyle(el).textIndent);
    setL2TextIndent(isFinite(ti) && ti > 0 ? ti : 0);
  }, [anchorRef, measureNonce]);

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    const root = rootRef.current;
    const probe = probeRef.current;
    log(`[AlignedTranslation] measure:start tag="${tag}" textLen=${text.length} anchor=${!!anchor} root=${!!root} probe=${!!probe}`);
    if (!anchor || !root || !probe || !text) {
      logwarn(`[AlignedTranslation] measure:bail reason=missing-element tag="${tag}" anchor=${!!anchor} root=${!!root} probe=${!!probe} textLen=${text.length}`);
      setLayout(null);
      return;
    }
    try {
      // Side-by-side only: the translation column must start at the L2's top
      // for the row grid to pair up. Stacked (below) layouts fall back.
      const aRect = anchor.getBoundingClientRect();
      const rRect = root.getBoundingClientRect();
      const topDelta = Math.round(aRect.top - rRect.top);
      if (Math.abs(topDelta) > 4) {
        log(`[AlignedTranslation] measure:bail reason=not-side-by-side tag="${tag}" anchorTop=${Math.round(aRect.top)} rootTop=${Math.round(rRect.top)} delta=${topDelta}`);
        setLayout(null);
        return;
      }
      log(`[AlignedTranslation] measure:side-by-side-ok tag="${tag}" anchorTop=${Math.round(aRect.top)} rootTop=${Math.round(rRect.top)} delta=${topDelta}`);

      // The L2 base text's font metrics (the first real text node's chain —
      // inline token spans inherit the TokenizedText font-size/leading).
      const base = firstTextNode(anchor);
      if (!base) {
        log(`[AlignedTranslation] measure:bail reason=no-base-text-node tag="${tag}"`);
        setLayout(null);
        return;
      }
      const cs = getComputedStyle(base.parentElement!);
      const f2 = parseFloat(cs.fontSize);
      const lh2 = parseFloat(cs.lineHeight);
      log(`[AlignedTranslation] measure:l2-metrics tag="${tag}" fontFamily="${cs.fontFamily}" fontSize=${f2} lineHeight=${lh2} (computed of ${base.parentElement!.tagName}.${base.parentElement!.className.slice(0, 30)})`);
      if (!isFinite(f2) || !isFinite(lh2) || f2 <= 0 || lh2 <= 0) {
        log(`[AlignedTranslation] measure:bail reason=bad-metrics tag="${tag}" f2=${f2} lh2=${lh2}`);
        setLayout(null);
        return;
      }
      // `zoom` (headings) scales rendered size without changing computed
      // values — fold the nearest zoomed ancestor in.
      let z = 1;
      for (let el: HTMLElement | null = base.parentElement; el && el !== anchor; el = el.parentElement) {
        const zv = parseFloat(getComputedStyle(el).zoom);
        if (isFinite(zv) && zv > 0) { z = zv; break; }
      }
      const f2r = f2 * z;
      const lh2r = lh2 * z;
      log(`[AlignedTranslation] measure:zoom tag="${tag}" z=${z} f2Rendered=${f2r} lh2Rendered=${lh2r}`);

      // Line boxes of the whole L2 block. With interlinear definitions the
      // tokens are inline-flex columns, so individual glyph rects are only
      // ~font-size tall, not the full line box. Pick the most frequent
      // "glyph-sized" height (≈ the L2 font size) as the base-text run. Truly
      // tiny boxes (the 0.55em interlinear gloss/def slots and ruby-band
      // gaps, both well under half the font size) drop out; the one full-block
      // rect (the L2 block's own tall box) is off-mode and also drops.
      const fullRange = document.createRange();
      fullRange.selectNodeContents(anchor);
      const fullRects = Array.from(fullRange.getClientRects());
      const heights = fullRects.map(r => r.height);
      const minGlyph = Math.max(4, f2r * 0.45);
      const nonTiny = fullRects.filter(r => r.height >= minGlyph).map(r => r.height);
      const freq = new Map<number, number>();
      for (const h of nonTiny) {
        const key = Math.round(h);
        freq.set(key, (freq.get(key) ?? 0) + 1);
      }
      let run = 0;
      let runMode = nonTiny.length ? Math.round(nonTiny[0]!) : 0;
      for (const [key, count] of freq) {
        if (count > run) { run = count; runMode = key; }
      }
      const lineRects = fullRects.filter(r => Math.abs(r.height - runMode) < Math.max(2.5, runMode * 0.2));
      log(`[AlignedTranslation] measure:l2-line-grid tag="${tag}" fullRects=${fullRects.length} f2R=${Math.round(f2r * 10) / 10} minGlyph=${Math.round(minGlyph * 10) / 10} glyphCandidates=${nonTiny.length} runModH=${runMode} (x${run}) glyphRects=${lineRects.length} rectHeights=${heights.map(h => Math.round(h * 10) / 10).join(',')}`);
      if (lineRects.length === 0) {
        log(`[AlignedTranslation] measure:bail reason=no-base-lines tag="${tag}" fullRects=${fullRects.length}`);
        setLayout(null);
        return;
      }
      // Cluster line boxes by horizontal offset — each line box spans the
      // full line width but only the glyph-containing rects survive; group
      // them by row (thin ruby-annotation and 0.55em zones are distinct
      // offsets) and union each row's bounds to derive a single base line.
      interface Row { top: number; bottom: number; right: number; }
      const TOL = 8;
      const rows: Row[] = [];
      for (const r of lineRects) {
        const cur = rows.find(x => Math.abs(x.top - r.top) <= TOL && Math.abs(x.bottom - r.bottom) <= TOL);
        if (cur) {
          cur.right = Math.max(cur.right, r.right);
          cur.bottom = Math.max(cur.bottom, r.bottom);
        } else {
          rows.push({ top: r.top, bottom: r.bottom, right: r.right });
        }
      }
      rows.sort((a, b) => a.top - b.top);
      // Ruby annotations sit above each line's base text — measure the band
      // so the align rows land on the base lines, not the annotation tops.
      const rtRects = textRects(anchor, n => !!n.parentElement?.closest?.('rt'));
      const baseTops = rows.map(r => {
        let band = 0;
        for (const rr of rtRects) {
          if (rr.top >= r.top - 1 && rr.bottom <= r.bottom + 1) {
            band = Math.max(band, rr.bottom - r.top);
          }
        }
        return r.top + band;
      });
      log(`[AlignedTranslation] measure:base-tops tag="${tag}" rtRects=${rtRects.length} rows=${rows.length} tops=${baseTops.map(t => Math.round(t)).join(',')}`);

      // L2 font's content height (ascent + descent), measured on canvas —
      // exact for the real fonts (falls back to 1em). With ruby on, the
      // measured grid rows are the base text's CONTENT boxes (ruby splits
      // the inline contexts), so the L2 baseline sits `halfLeading + ascent`
      // below each row top, exactly as it does in the ruby-off grid (line
      // boxes). The translation rows therefore start halfLeading BELOW the
      // base tops, not on them: pad = band − halfLeading, where band is the
      // first line's ruby band (ruby expands the line box upward past the
      // content). Without ruby the band is ≈0 (line-box rows) or ≈halfLeading
      // (content-box rows), so the offset clamps to ≈0 and nothing changes.
      let contentH = f2r;
      try {
        const ctx = document.createElement('canvas').getContext('2d');
        if (ctx) {
          ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${f2r}px ${cs.fontFamily}`;
          const tm = ctx.measureText('Ag中');
          if (isFinite(tm.fontBoundingBoxAscent) && isFinite(tm.fontBoundingBoxDescent)) {
            contentH = tm.fontBoundingBoxAscent + tm.fontBoundingBoxDescent;
          }
        }
      } catch { /* canvas unavailable — keep the 1em fallback */ }
      const halfLeading = Math.max(0, (lh2r - contentH) / 2);
      const topPad = Math.min(lh2r, Math.max(0, baseTops[0]! - rRect.top - halfLeading));
      log(`[AlignedTranslation] measure:top-pad tag="${tag}" contentH=${Math.round(contentH * 10) / 10} halfLeading=${Math.round(halfLeading * 10) / 10} band0=${Math.round((baseTops[0]! - rRect.top) * 10) / 10} topPad=${Math.round(topPad * 10) / 10}`);

      // Inter-base gaps: what separates consecutive L2 baselines, plus the
      // last line's tail (interlinear definitions extend it downward).
      const gaps: number[] = [];
      for (let j = 0; j < baseTops.length - 1; j++) {
        gaps.push(Math.max(0, baseTops[j + 1]! - baseTops[j]! - lh2r));
      }
      const lastBottom = rows[rows.length - 1]!.bottom;
      const lastGap = Math.max(0, lastBottom - baseTops[baseTops.length - 1]! - lh2r);
      gaps.push(Math.min(lastGap, lh2r * 0.6));
      log(`[AlignedTranslation] measure:gaps tag="${tag}" lh2=${Math.round(lh2r)} gaps=${gaps.map(g => Math.round(g * 10) / 10).join(',')}`);

      // Slice the translation into its visual lines on a hidden probe that
      // shares the column width and the translation column's own font
      // (the L1/UI font — the probe must wrap exactly like the rendered
      // lines, whose font it inherits from the column).
      const rcs = getComputedStyle(root);
      const trSize = f2r * translationFactor;
      probe.style.fontFamily = rcs.fontFamily;
      probe.style.fontWeight = rcs.fontWeight;
      probe.style.fontStyle = rcs.fontStyle;
      probe.style.fontSize = `${trSize}px`;
      probe.style.lineHeight = `${lh2r}px`;
      const node = probe.firstChild as Text | null;
      const lines: LineSlice[] = [];
      if (node && node.length > 0) {
        const probeRange = document.createRange();
        probeRange.selectNodeContents(probe);
        const rects = Array.from(probeRange.getClientRects());
        log(`[AlignedTranslation] measure:probe tag="${tag}" fontFamily="${rcs.fontFamily}" trSize=${Math.round(trSize * 10) / 10} lh=${Math.round(lh2r)} probeRects=${rects.length} probeWidth=${Math.round(probe.getBoundingClientRect().width)} probeTextLen=${node.length}`);
        // Slice by grouping consecutive chars whose computed top is the same
        // VISUAL line. The previous implementation binary-searched each
        // getClientRects() rect and used `rect.bottom` as the line boundary,
        // but the first rect's bottom spans TWO visual lines for CJK text (a
        // getClientRects() quirk), so two lines merged into slice 0 — the
        // first rendered line was ~2× the column width and clipped at the
        // right edge (only line 0 was affected, since later rects happened to
        // be one line each). Probing each char's own top is independent of the
        // rect geometry and gives exactly one slice per line.
        const pushLine = (s: number, e: number) => {
          // Trim leading/trailing whitespace (incl. newlines) from the slice.
          while (s < e && /\s/.test(text[s]!)) s++;
          while (e > s && /\s/.test(text[e - 1]!)) e--;
          if (e > s) lines.push({ start: s, end: e });
        };
        let lineStart = 0;
        let lineTop: number | null = null;
        for (let i = 0; i < node.length; i++) {
          const t = charTop(node, i);
          if (lineTop === null) {
            lineTop = t;
          } else if (Math.abs(t - lineTop) > 1) {
            // The char moved to a new visual line (its top jumped by ~one
            // line box). Close the current line and start a new one.
            pushLine(lineStart, i);
            lineStart = i;
            lineTop = t;
          }
        }
        pushLine(lineStart, node.length);
        log(`[AlignedTranslation] measure:slices tag="${tag}" count=${lines.length} ${lines.map((l, i) => `${i}:${l.start}-${l.end}:"${text.slice(l.start, l.end).slice(0, 18)}"`).join(' | ')}`);
      } else {
        log(`[AlignedTranslation] measure:slices tag="${tag}" probeEmptyOrNoText`);
      }

      setLayout({
        gaps,
        lines,
        topPad,
        l2FontSize: f2r,
        l2LineHeight: lh2r,
        anchorFont: { family: cs.fontFamily, weight: cs.fontWeight, style: cs.fontStyle },
      });
      log(`[AlignedTranslation] measure:ready tag="${tag}" l2Lines=${gaps.length} trLines=${lines.length} f2=${Math.round(f2r)} lh2=${Math.round(lh2r)}`);
    } catch (err) {
      logwarn(`[AlignedTranslation] measure:bail reason=exception tag="${tag}" err=${(err as Error)?.message ?? String(err)}`);
      setLayout(null);
    }
  }, [anchorRef, text, tag, translationFactor]);

  useLayoutEffect(() => {
    measure();
  }, [measure, measureNonce]);

  // Re-measure when the L2 column resizes (width changes re-wrap lines).
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(anchor);
    return () => ro.disconnect();
  }, [anchorRef, measure]);

  // Fonts arriving late change metrics and wrapping — re-align once loaded.
  useEffect(() => {
    let alive = true;
    document.fonts?.ready?.then(() => {
      if (alive) requestAnimationFrame(() => measure());
    });
    return () => { alive = false; };
  }, [measure]);

  // Post-layout probe of the RENDERED row geometry — confirms the rows land
  // on the L2 line grid (each row ≈ lh2, spacers = gaps) and that the
  // translation baselines fall inside their rows (not overflowing).
  useEffect(() => {
    if (!layout) return;
    const rowsEl = rowsRef.current;
    if (!rowsEl) return;
    const id = requestAnimationFrame(() => {
      const children = Array.from(rowsEl.children) as HTMLElement[];
      const rowHeights = children.map(c => Math.round(c.offsetHeight));
      const rowsStyle =
        children.length > 0
          ? getComputedStyle(children[0]!)
          : null;
      // First non-empty row's translation baseline vs its row box: confirm the
      // translation glyph sits within the row (baseline top < row bottom).
      let transBaselineInfo = 'n/a';
      const firstLineSpan = children[0]?.querySelector(':scope > span:nth-child(2)') as HTMLElement | null;
      if (firstLineSpan) {
        const boxTop = children[0]!.getBoundingClientRect().top;
        const sp = getComputedStyle(firstLineSpan);
        const fs = parseFloat(sp.fontSize);
        const lh = parseFloat(sp.lineHeight);
        const spTop = firstLineSpan.getBoundingClientRect().top;
        // approx baseline = top + ascent(~0.8*fontSize)
        transBaselineInfo = `rowTop=${Math.round(boxTop)} spanTop=${Math.round(spTop)} fs=${Math.round(fs * 10) / 10} lh=${Math.round(lh)} baseline≈${Math.round(spTop + 0.8 * fs)}`;
      }
      log(`[AlignedTranslation] render:row-heights tag="${tag}" children=${rowHeights.length} heights=${rowHeights.join(',')} rowStyleH=${rowsStyle?.height ?? 'n/a'} ${transBaselineInfo}`);
    });
    return () => cancelAnimationFrame(id);
  }, [layout, tag]);

  if (!layout) {
    // Plain fallback: unpaired paragraph (same as the pre-alignment column).
    // `l2TextIndent` carries the L2 block's first-line indent (EPUB
    // indent-[1em]) so the stacked translation starts at the same x-offset.
    return (
      <div ref={rootRef} className="relative" style={l2TextIndent > 0 ? { textIndent: l2TextIndent } : undefined}>
        <div ref={probeRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 w-full">{text}</div>
        {map ? <SegmentedTranslation text={text} map={map} active={active} /> : <>{text}</>}
      </div>
    );
  }

  const { gaps, lines, topPad, l2FontSize, l2LineHeight, anchorFont } = layout;
  const rows = Math.max(gaps.length, lines.length);
  // Each grid row is EXACTLY one L2 line height (a fixed height, so flex
  // baseline alignment repositions the translation to the L2 baseline instead
  // of inflating the row past one grid unit). The invisible anchor reproduces
  // the L2 font/size so its baseline = the L2 line's baseline; `align-items:
  // baseline` pulls the smaller translation line onto it. The row never grows
  // beyond l2LineHeight because its height is explicit.
  const rowStyle: CSSProperties = { height: `${l2LineHeight}px` };
  const anchorStyle: CSSProperties = {
    flex: 'none',
    display: 'inline-block',
    width: 0,
    // `min-width: auto` (the flexbox default) would otherwise resolve to the
    // anchor's content min-content width ("Ag中" at the L2 size ≈ 34px), so
    // the anchor occupies real space and the translation span (`flex-1`) gets
    // column width − ~34px. Every line slice is computed on a `w-full` probe
    // at the FULL column width, so each slice clips that ~34px at the right
    // edge. Pin min-width to 0 so the anchor is truly 0-wide and the span gets
    // the full column width, matching the probe.
    minWidth: 0,
    lineHeight: 1,
    overflow: 'visible',
    visibility: 'hidden',
    fontFamily: anchorFont.family,
    fontWeight: anchorFont.weight,
    fontStyle: anchorFont.style,
    fontSize: `${l2FontSize}px`,
  };

  return (
    <div ref={rootRef} className="relative">
      <div ref={probeRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 w-full">{text}</div>
      {/* `topPad` drops the rows onto the L2 baseline geometry: with ruby on
          the grid rows are content-box tops, so the rows start halfLeading
          below them (≈0 without ruby — padding, not a child, keeps the
          row-children layout intact). */}
      <div ref={rowsRef} style={{ paddingTop: `${topPad}px` }}>
        {Array.from({ length: rows }).map((_, j) => (
          <Fragment key={j}>
            <div className="flex items-baseline" style={rowStyle}>
              {j < gaps.length && (
                <span aria-hidden="true" className="select-none" style={anchorStyle}>
                  Ag中
                </span>
              )}
              {j < lines.length && (
                <span
                  className="min-w-0 flex-1 overflow-hidden whitespace-nowrap"
                  style={{ fontSize: `${l2FontSize * translationFactor}px`, lineHeight: `${l2LineHeight}px` }}
                >
                  {renderSlicedLine(text, lines[j]!, map, active)}
                </span>
              )}
            </div>
            {gaps[j]! > 0.5 && <div aria-hidden="true" style={{ height: `${gaps[j]}px` }} />}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
