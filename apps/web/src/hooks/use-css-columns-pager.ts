'use client';

/**
 * CSS-columns pager (SPEC-077).
 *
 * Renders a window of blocks (current page ± a few estimated pages) into a
 * CSS multi-column container whose columns ARE pages. Page breaks come from
 * the browser's column layout — read back from geometry (`offsetLeft`), never
 * from per-block height measurement. Page turns inside the window are pure
 * CSS transforms. Windows are rebuilt (double-buffered: the old pager stays
 * visible until the new one is measured) only when the reader leaves the
 * window's middle band or jumps.
 *
 * Global page numbering uses a partial break map: page-start block indices
 * verified by measurement, plus chars-per-page estimates for unmeasured
 * stretches. The current page number is exact within continuously-read
 * measured stretches (windows overlap), matching the estimate-based behavior
 * of the previous paginators for far jumps.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlockStream, ReaderLocation } from '@/lib/block-stream';
import { logwarn } from '@/lib/logger';

/** Estimated page capacity in chars before the first measurement. */
export const DEFAULT_CHARS_PER_PAGE = 400;
/** Estimated average chars per block (for block-range estimates). */
export const EST_BLOCK_CHARS = 40;
/** Estimated pages kept mounted behind / ahead of the current page. */
export const PAGES_BEHIND = 2;
export const PAGES_AHEAD = 2;
/** Gutter between columns (pages), in px. */
export const COLUMN_GAP = 40;
/** Retry cap for window extension when a page start can't be resolved. */
const MAX_EXTEND_RETRIES = 2;

export type BuildMode = 'jump' | 'forward' | 'backward' | 'restore';

export interface ActiveWindow<B> {
  winStart: number;
  winEnd: number;
  blocks: B[];
  /** Column-start block indices (the pager's own pagination): [winStart, …]. */
  localBreaks: number[];
  /** Global page number (1-based) of the window's first column. */
  basePage: number;
}

export interface PendingWindow<B> {
  winStart: number;
  winEnd: number;
  blocks: B[];
  mode: BuildMode;
  anchor: number;
}

// ── Pure pager math (unit-tested) ────────────────────────────────────────

/**
 * Global page number (1-based) of the page containing `blockIndex`'s start.
 * Exact page-start breaks are counted exactly; unmeasured stretches between
 * them (and unmeasured prefixes/tails) are estimated via chars-per-page.
 */
export function globalPageOfBlock(
  breaks: readonly number[],
  charsBefore: (i: number) => number,
  divisor: number,
  blockIndex: number,
): number {
  const div = Math.max(1, divisor);
  let page = 1;
  let cursor = -1;
  for (const b of breaks) {
    if (b > blockIndex) break;
    const gapChars = charsBefore(b) - (cursor >= 0 ? charsBefore(cursor + 1) : 0);
    // Every break starts a new page; the gap content between consecutive
    // breaks occupies at least one page of estimated size.
    page += Math.max(1, Math.ceil(gapChars / div));
    cursor = b;
  }
  if (blockIndex > cursor) {
    const tailChars = charsBefore(blockIndex) - (cursor >= 0 ? charsBefore(cursor + 1) : 0);
    // Tail blocks start on the last break's page; only overflow adds pages.
    page += Math.max(0, Math.ceil(tailChars / div) - 1);
  }
  return Math.max(1, page);
}

/** Block containing the `targetChars`-th character (last block with
 *  `charsBefore(i) <= targetChars`). Returns the last block for targets past
 *  the end. */
export function blockIndexAtChars(
  blockCount: number,
  charsBefore: (i: number) => number,
  targetChars: number,
): number {
  if (blockCount <= 0) return 0;
  let lo = 0;
  let hi = blockCount - 1;
  let res = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (charsBefore(mid) <= targetChars) {
      res = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return res;
}

/** Last break index ≤ `blockIndex`, or null. */
export function lastBreakAtOrBefore(breaks: readonly number[], blockIndex: number): number | null {
  let lo = 0;
  let hi = breaks.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (breaks[mid]! <= blockIndex) {
      res = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return res >= 0 ? breaks[res]! : null;
}

/** First break index > `blockIndex`, or null. */
export function firstBreakAfter(breaks: readonly number[], blockIndex: number): number | null {
  let lo = 0;
  let hi = breaks.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (breaks[mid]! > blockIndex) {
      res = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return res >= 0 ? breaks[res]! : null;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export interface CssColumnsPagerOptions {
  /** Where to open the reader (defaults to the stream start). */
  initialLocation?: ReaderLocation | null;
  /**
   * Layout identity — anything that changes rendered block metrics (zoom,
   * leading, typeface, translation column, ruby, interlinear definitions, …).
   * When it changes, the break map is invalidated and the current window is
   * re-measured, restoring the anchor block.
   */
  layoutIdentity?: string | number;
  /** RTL books mirror the page column direction. */
  rtl?: boolean;
}

export interface CssColumnsPager<B> {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  activePagerRef: React.RefObject<HTMLDivElement | null>;
  pendingPagerRef: React.RefObject<HTMLDivElement | null>;
  active: ActiveWindow<B> | null;
  pending: PendingWindow<B> | null;
  /** Stream index of the visible page's first block. */
  pageStart: number;
  /** True while a window build/measure is in flight. */
  busy: boolean;
  /** [start, end) stream index range of the visible page. */
  visibleRange: readonly [number, number] | null;
  hasPrev: boolean;
  hasNext: boolean;
  /** Global page number of the visible page (estimate outside measured ranges). */
  pageNumber: number;
  totalPagesEstimate: number;
  /** Measured chars-per-page divisor for the current layout. */
  divisor: number;
  /** Pager geometry (px). Width uses generous slack columns. */
  pager: { width: number; height: number; columnWidth: number; columnGap: number };
  /** Column pitch (page width + gutter) in px. */
  pitch: number;
  /** Number of columns the pager is sized for. */
  widthCols: number;
  /** CSS transform aligning the visible page's column with the viewport. */
  transform: string;
  /** Jump to the page starting at `blockIndex` (must be a page start in the
   *  current window; in-window transform change, no rebuild). Used by the
   *  search-highlight refinement. Returns false when not applicable. */
  revealBreak: (blockIndex: number) => boolean;
  jumpTo: (loc: ReaderLocation) => void;
  nextPage: () => void;
  prevPage: () => void;
}

interface WindowMeasurement {
  /** Local column-start block indices, including winStart. */
  breaks: number[];
  divisor: number;
  basePage: number;
}

export function useCssColumnsPager<B>(
  stream: BlockStream<B> | null,
  opts: CssColumnsPagerOptions = {},
): CssColumnsPager<B> {
  const { layoutIdentity = 0, rtl = false } = opts;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activePagerRef = useRef<HTMLDivElement | null>(null);
  const pendingPagerRef = useRef<HTMLDivElement | null>(null);

  const [active, setActive] = useState<ActiveWindow<B> | null>(null);
  const [pending, setPending] = useState<PendingWindow<B> | null>(null);
  const [pageStart, setPageStart] = useState(0);
  const [busy, setBusy] = useState(false);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [divisor, setDivisor] = useState(DEFAULT_CHARS_PER_PAGE);

  const genRef = useRef(0);
  const streamRef = useRef(stream);
  streamRef.current = stream;
  const activeRef = useRef(active);
  activeRef.current = active;
  const pageStartRef = useRef(0);
  const globalBreaksRef = useRef<number[]>([]);
  const divisorRef = useRef(DEFAULT_CHARS_PER_PAGE);
  const pitchRef = useRef(0);
  const layoutKeyRef = useRef('');
  const retryRef = useRef(0);

  // ── Viewport measurement (resize re-paginates; anchor is restored) ──
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const w = el.clientWidth;
      const h = el.clientHeight;
      setViewport(v => (v.w === w && v.h === h ? v : { w, h }));
    };
    const ro = new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    });
    ro.observe(el);
    update();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Sync the column pitch (page width + gutter) with the viewport width.
  useEffect(() => {
    const w = Math.round(viewport.w);
    pitchRef.current = w > 0 ? w + COLUMN_GAP : 0;
  }, [viewport.w]);

  // Layout key: anything that invalidates measured breaks.
  const layoutKey = useMemo(
    () => `${layoutIdentity}|${viewport.w}|${viewport.h}`,
    [layoutIdentity, viewport.w, viewport.h],
  );

  // ── Measure helpers ──

  const measureWindow = useCallback((el: HTMLElement, winStart: number): WindowMeasurement | null => {
    const pitch = pitchRef.current;
    if (!pitch || pitch <= 0) return null;
    const children = Array.from(el.children) as HTMLElement[];
    const breaks: number[] = [];
    let prevPage = -1;
    for (let i = 0; i < children.length; i++) {
      const p = Math.round(children[i]!.offsetLeft / pitch);
      if (p !== prevPage) breaks.push(winStart + i);
      prevPage = p;
    }
    if (breaks.length === 0) breaks.push(winStart);

    // Re-derive chars-per-page from up to 3 full pages inside this window
    // (skip the first page — winStart may be mid-page). Keep the old divisor
    // when the window is too small to sample. The charsBefore reference must
    // stay bound to the stream (class methods use `this`).
    const stream = streamRef.current;
    const cb = stream ? stream.charsBefore.bind(stream) : null;
    let nextDivisor = divisorRef.current;
    if (cb) {
      const samples: number[] = [];
      for (let k = 1; k + 1 < breaks.length && samples.length < 3; k++) {
        const chars = cb(breaks[k + 1]!) - cb(breaks[k]!);
        if (chars > 0) samples.push(chars);
      }
      if (samples.length > 0) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        nextDivisor = Math.max(50, Math.min(50000, Math.round(avg)));
      }
    }
    const basePage = stream && cb
      ? globalPageOfBlock(globalBreaksRef.current, cb, nextDivisor, winStart)
      : 1;
    return { breaks, divisor: nextDivisor, basePage };
  }, []);

  /** Record verified page-start breaks (every measured break except winStart,
   *  whose predecessor is outside the window) into the global break map. */
  const mergeVerifiedBreaks = useCallback((localBreaks: number[]) => {
    const newBreaks = localBreaks.slice(1);
    if (newBreaks.length === 0) return;
    const cur = globalBreaksRef.current;
    const merged: number[] = [];
    let i = 0;
    let j = 0;
    while (i < cur.length && j < newBreaks.length) {
      if (cur[i]! < newBreaks[j]!) merged.push(cur[i++]!);
      else if (cur[i]! > newBreaks[j]!) merged.push(newBreaks[j++]!);
      else {
        merged.push(cur[i++]!);
        j += 1;
      }
    }
    while (i < cur.length) merged.push(cur[i++]!);
    while (j < newBreaks.length) merged.push(newBreaks[j++]!);
    globalBreaksRef.current = merged;
  }, []);

  /** Resolve the visible page start for a freshly measured window. */
  const resolvePageStart = useCallback((mode: BuildMode, anchor: number, breaks: number[]): number | null => {
    if (mode === 'forward') return firstBreakAfter(breaks, anchor);
    if (mode === 'backward') return lastBreakAtOrBefore(breaks, anchor - 1);
    return lastBreakAtOrBefore(breaks, anchor);
  }, []);

  /** First ~40 chars of a block, for navigation verdict logs. */
  const blockSnippet = useCallback((blocks: unknown[], blockIndex: number, winStart: number): string => {
    const stream = streamRef.current;
    const block = blocks[blockIndex - winStart];
    if (!stream || !block) return '';
    const text = stream.blockText(block as never);
    return text ? text.slice(0, 40).replace(/\s+/g, ' ') : '';
  }, []);

  // ── Window build ──

  const buildWindow = useCallback(async (anchor: number, mode: BuildMode) => {
    const stream = streamRef.current;
    if (!stream) return;
    const gen = ++genRef.current;
    setBusy(true);
    try {
      await stream.warm(0, Math.max(1, stream.blockCount));
      if (gen !== genRef.current) return;
      const safeAnchor = Math.max(0, Math.min(anchor, Math.max(0, stream.blockCount - 1)));
      const div = divisorRef.current;
      const cb = stream.charsBefore.bind(stream);
      const behindChars = (PAGES_BEHIND + 1) * div;
      const aheadChars = (PAGES_AHEAD + 2) * div;
      const anchorChars = cb(safeAnchor);
      // Jumps (TOC/search/link/restore) put the target AT THE TOP of the
      // revealed page: the window starts at the anchor, so its first column
      // begins with the clicked chapter — matching real readers. Landing on
      // the page merely CONTAINING the target would leave it at the bottom
      // of a page that starts with the previous chapter. Forward/backward
      // recenters keep the anchor in the window's middle band.
      const isJump = mode === 'jump' || mode === 'restore';
      let winStart = isJump
        ? safeAnchor
        : blockIndexAtChars(stream.blockCount, cb, Math.max(0, anchorChars - behindChars));
      if (!isJump) {
        // Snap the window start to a verified page start when the candidate
        // is inside or near measured territory, so page numbers stay exact.
        const estBlocksPerPage = Math.max(8, Math.round(div / EST_BLOCK_CHARS));
        const snap = lastBreakAtOrBefore(globalBreaksRef.current, winStart);
        if (snap !== null && winStart - snap <= 2 * estBlocksPerPage) winStart = snap;
      }
      const winEnd = Math.min(
        stream.blockCount,
        blockIndexAtChars(stream.blockCount, cb, anchorChars + aheadChars) + 1,
      );
      const blocks = await stream.blocks(winStart, winEnd);
      if (gen !== genRef.current) return;
      const estPage = 1 + Math.floor(anchorChars / Math.max(1, div));
      logwarn(`Pager: window [${winStart}, ${winEnd}) mode=${mode} anchor=${safeAnchor} blocks=${blocks.length} estPage=${estPage}`);
      setPending({ winStart, winEnd, blocks, mode, anchor: safeAnchor });
    } catch (e) {
      if (gen !== genRef.current) return;
      logwarn(`Pager: window build failed (mode=${mode})`, e);
      setBusy(false);
    }
  }, []);

  // ── Reset + initial build on stream change ──
  useEffect(() => {
    genRef.current += 1;
    globalBreaksRef.current = [];
    divisorRef.current = DEFAULT_CHARS_PER_PAGE;
    setDivisor(DEFAULT_CHARS_PER_PAGE);
    retryRef.current = 0;
    pageStartRef.current = 0;
    setPageStart(0);
    setActive(null);
    setPending(null);
    setBusy(false);
    if (!stream) return;
    const loc = optsRef.current.initialLocation;
    const anchor = loc ? stream.locationToStreamIndex(loc) : 0;
    void buildWindow(anchor, 'jump');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  // ── Measure: pending pager → promote; active pager → re-measure ──
  useEffect(() => {
    if (viewport.w < 200 || viewport.h < 100) return;
    // Layout identity or viewport changed → measured breaks are stale.
    if (layoutKey !== layoutKeyRef.current) {
      layoutKeyRef.current = layoutKey;
      globalBreaksRef.current = [];
    }
    const gen = genRef.current;

    if (pending) {
      const el = pendingPagerRef.current;
      if (!el) return;
      const p = pending;
      const id = requestAnimationFrame(() => requestAnimationFrame(() => {
        if (genRef.current !== gen) return;
        if (pendingRef.current !== p) return;
        const m = measureWindow(el, p.winStart);
        if (!m) return;
        mergeVerifiedBreaks(m.breaks);
        divisorRef.current = m.divisor;
        setDivisor(m.divisor);
        let ps = resolvePageStart(p.mode, p.anchor, m.breaks);
        if (ps === null && retryRef.current < MAX_EXTEND_RETRIES && streamRef.current) {
          retryRef.current += 1;
          const blockCount = streamRef.current.blockCount;
          const extendBy = Math.max(16, Math.round((divisorRef.current / EST_BLOCK_CHARS) * 4));
          const newAnchor = p.mode === 'forward'
            ? Math.min(blockCount - 1, p.anchor + extendBy)
            : Math.max(0, p.anchor - extendBy);
          logwarn(`Pager: target NOT in view! mode=${p.mode} anchor=${p.anchor} — page start unresolved, extending window (anchor → ${newAnchor})`);
          void buildWindow(newAnchor, p.mode);
          return; // keep the old window visible and busy
        }
        retryRef.current = 0;
        if (ps === null) ps = p.winStart;
        // Navigation verdict: for jump/restore builds the anchor IS the
        // navigation target — report whether its block starts on the page
        // being revealed (splittable paragraphs refine to the exact column
        // later via the search-highlight refinement).
        if (p.mode === 'jump' || p.mode === 'restore') {
          const col = m.breaks.indexOf(ps);
          const visibleEnd = col >= 0 && col + 1 < m.breaks.length ? m.breaks[col + 1]! : p.winEnd;
          const inView = p.anchor >= ps && p.anchor < visibleEnd;
          logwarn(`${inView ? 'Pager: target in view!' : 'Pager: target NOT in view!'} mode=${p.mode} anchor=${p.anchor} target="${blockSnippet(p.blocks, p.anchor, p.winStart)}" visible=[${ps}, ${visibleEnd}) first="${blockSnippet(p.blocks, ps, p.winStart)}" page=${m.basePage + Math.max(0, col)} col=${col} pitch=${pitchRef.current} transform=${-Math.max(0, col) * pitchRef.current}px window=[${p.winStart}, ${p.winEnd})`);
        }
        pageStartRef.current = ps;
        setPageStart(ps);
        setActive({ winStart: p.winStart, winEnd: p.winEnd, blocks: p.blocks, localBreaks: m.breaks, basePage: m.basePage });
        setPending(null);
        setBusy(false);
      }));
      return () => cancelAnimationFrame(id);
    }

    if (active) {
      const el = activePagerRef.current;
      if (!el) return;
      const a = active;
      const id = requestAnimationFrame(() => requestAnimationFrame(() => {
        // No gen check here: in-window page turns bump gen to cancel pending
        // builds, and this re-measure must survive them. The identity check
        // below drops it if the window was replaced meanwhile.
        if (activeRef.current !== a) return;
        const m = measureWindow(el, a.winStart);
        if (!m) return;
        mergeVerifiedBreaks(m.breaks);
        divisorRef.current = m.divisor;
        setDivisor(m.divisor);
        // Anchor restore: keep the reader on the same text after reflow.
        const anchor = pageStartRef.current;
        const ps = lastBreakAtOrBefore(m.breaks, anchor) ?? m.breaks[0] ?? a.winStart;
        if (ps !== pageStartRef.current) {
          pageStartRef.current = ps;
          setPageStart(ps);
        }
        setActive(prev => (prev === a ? { ...prev, localBreaks: m.breaks, basePage: m.basePage } : prev));
      }));
      return () => cancelAnimationFrame(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, layoutKey]);

  // ── Page turns ──

  const cancelPending = useCallback(() => {
    genRef.current += 1;
    setPending(null);
    setBusy(false);
  }, []);

  const nextPage = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    const breaks = a.localBreaks;
    const col = breaks.indexOf(pageStartRef.current);
    if (col < 0) return;
    if (col + 1 < breaks.length) {
      const ps = breaks[col + 1]!;
      pageStartRef.current = ps;
      setPageStart(ps);
      logwarn(`Pager: turn next → pageStart=${ps} first="${blockSnippet(a.blocks, ps, a.winStart)}"`);
      cancelPending();
      return;
    }
    // At the window's last page — only rebuild when the book continues.
    if (a.winEnd >= (streamRef.current?.blockCount ?? 0)) return;
    void buildWindow(pageStartRef.current, 'forward');
  }, [buildWindow, cancelPending, blockSnippet]);

  const prevPage = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    const breaks = a.localBreaks;
    const col = breaks.indexOf(pageStartRef.current);
    if (col < 0) return;
    if (col > 0) {
      const ps = breaks[col - 1]!;
      pageStartRef.current = ps;
      setPageStart(ps);
      logwarn(`Pager: turn prev → pageStart=${ps} first="${blockSnippet(a.blocks, ps, a.winStart)}"`);
      cancelPending();
      return;
    }
    // At the window's first page — only rebuild when the book continues.
    if (a.winStart === 0) return;
    void buildWindow(pageStartRef.current, 'backward');
  }, [buildWindow, cancelPending, blockSnippet]);

  const jumpTo = useCallback((loc: ReaderLocation) => {
    const stream = streamRef.current;
    if (!stream) return;
    const idx = stream.locationToStreamIndex(loc);
    if (idx < 0 || idx >= stream.blockCount) return;
    retryRef.current = 0;
    void buildWindow(idx, 'jump');
  }, [buildWindow]);

  /** Reveal the page that starts at a specific break (in-window only). */
  const revealBreak = useCallback((blockIndex: number): boolean => {
    const a = activeRef.current;
    if (!a) return false;
    if (!a.localBreaks.includes(blockIndex)) return false;
    pageStartRef.current = blockIndex;
    setPageStart(blockIndex);
    return true;
  }, []);

  // ── Derived values ──

  const col = active ? active.localBreaks.indexOf(pageStart) : -1;
  const visibleRange = useMemo((): readonly [number, number] | null => {
    if (!active) return null;
    const c = active.localBreaks.indexOf(pageStart);
    const end = c >= 0 && c + 1 < active.localBreaks.length ? active.localBreaks[c + 1]! : active.winEnd;
    return [pageStart, Math.max(pageStart, end)] as const;
  }, [active, pageStart]);

  const hasPrev = active ? col > 0 || active.winStart > 0 : false;
  const hasNext = active
    ? col >= 0 && (col < active.localBreaks.length - 1 || active.winEnd < (stream?.blockCount ?? 0))
    : false;
  const pageNumber = active ? active.basePage + Math.max(0, col) : 1;

  const widthCols = useMemo(() => {
    const w = active ?? pending;
    if (!w || !stream || divisor <= 0) return 0;
    const chars = stream.charsBefore(w.winEnd) - stream.charsBefore(w.winStart);
    return Math.max(4, Math.ceil(chars / Math.max(1, divisor)) + 8);
  }, [active, pending, stream, divisor]);

  const pitch = Math.max(1, pitchRef.current);
  const pager = {
    width: widthCols > 0 ? widthCols * pitch - COLUMN_GAP + 1 : 0,
    height: Math.max(1, Math.round(viewport.h)),
    columnWidth: Math.max(1, Math.round(viewport.w)),
    columnGap: COLUMN_GAP,
  };  const transform = active
    ? rtl
      ? `translateX(${Math.max(0, widthCols - 1 - Math.max(0, col)) * pitch}px)`
      : `translateX(${-Math.max(0, col) * pitch}px)`
    : 'translateX(0px)';

  const totalPagesEstimate = useMemo(() => {
    if (!stream || divisor <= 0) return 0;
    return Math.max(1, Math.ceil(stream.totalChars() / divisor));
  }, [stream, divisor]);

  return {
    viewportRef,
    activePagerRef,
    pendingPagerRef,
    active,
    pending,
    pageStart,
    busy,
    visibleRange,
    hasPrev,
    hasNext,
    pageNumber,
    totalPagesEstimate,
    divisor,
    pager,
    pitch,
    widthCols,
    transform,
    revealBreak,
    jumpTo,
    nextPage,
    prevPage,
  };
}
