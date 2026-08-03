/**
 * Whole-book paginator (SPEC-032).
 *
 * Page breaks are computed lazily over the global block stream — the page
 * under the cursor is measured in a hidden container (same technique as
 * ReaderPanel), and the overflowing block becomes the next page's start.
 * Moving backward re-walks cached block heights, so paging back after having
 * read forward never re-measures the same blocks. A page may span spine-item
 * boundaries (no forced breaks), matching a continuous reader.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EpubBook } from '@/lib/epub-book';
import type { BookLocation, EpubBlock } from '@/lib/epub-book-types';
import { epubLog, epubWarn } from '@/lib/epub-log';

export interface PageBlock {
  loc: BookLocation;
  block: EpubBlock;
}

/** Max blocks rendered into the hidden measuring window at once. */
const WINDOW_LIMIT = 240;

interface UsePaginatedBookOptions {
  /** Fixed chrome height (page nav, padding) subtracted from the viewport. */
  chromeHeight?: number;
  /**
   * Re-measure page breaks whenever this value changes. Pass a value derived
   * from display settings that change rendered block heights (translation
   * column, phonetics/ruby), so cached heights never outlive the layout they
   * were measured for.
   */
  measureNonce?: string | number;
}

export function usePaginatedBook(book: EpubBook | null, opts?: UsePaginatedBookOptions) {
  const chromeHeight = opts?.chromeHeight ?? 150;
  const measureNonce = opts?.measureNonce ?? 0;
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const [window, setWindow] = useState<PageBlock[]>([]);
  const [pageBlocks, setPageBlocks] = useState<PageBlock[]>([]);
  const [measuring, setMeasuring] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPagesEstimate, setTotalPagesEstimate] = useState(0);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  const modeRef = useRef<'forward' | 'backward'>('forward');
  const baseRef = useRef<BookLocation | null>(null);
  const pageStartRef = useRef<BookLocation | null>(null);
  const pageEndRef = useRef<BookLocation | null>(null);
  const heightsRef = useRef(new Map<string, number>());
  const widthRef = useRef(0);
  const pageHeightRef = useRef(600);
  const charsPerPageRef = useRef(400);
  const totalCharsRef = useRef(0);
  const genRef = useRef(0);
  const fetchRef = useRef(0); // guards against stale async fetches
  const prevBookRef = useRef<EpubBook | null>(null);

  // ── Viewport measurement (resize invalidates page breaks) ──
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setViewport(v => (v.w === w && v.h === h ? v : { w, h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Reset on book change ──
  // Guard with prevBookRef: React 18 dev StrictMode double-invokes mount
  // effects, and a second reset would bump gen/fetch and invalidate the only
  // in-flight fetchWindow (whose result is dropped by the stale guard below),
  // leaving measuring=true forever — the infinite spinner.
  useEffect(() => {
    if (prevBookRef.current === book) return;
    prevBookRef.current = book;
    genRef.current += 1;
    fetchRef.current += 1;
    heightsRef.current.clear();
    pageStartRef.current = null;
    pageEndRef.current = null;
    setPageNumber(1);
    setPageBlocks([]);
    setWindow([]);
    totalCharsRef.current = 0;
    setTotalPagesEstimate(0);
    setMeasuring(true);
    if (book) {
      void book.totalTextLength().then(total => {
        if (total > 0) {
          totalCharsRef.current = total;
          setTotalPagesEstimate(Math.max(1, Math.ceil(total / charsPerPageRef.current)));
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  // Width change → block heights are width-dependent, drop the cache.
  useEffect(() => {
    if (viewport.w > 0 && Math.abs(viewport.w - widthRef.current) > 2) {
      widthRef.current = viewport.w;
      heightsRef.current.clear();
    }
    pageHeightRef.current = Math.max(120, viewport.h - chromeHeight);
  }, [viewport, chromeHeight]);

  /** Fetch a window of PageBlocks starting at `from`, forward or backward. */
  const fetchWindow = useCallback(async (
    from: BookLocation,
    dir: 'forward' | 'backward',
    limit: number,
  ): Promise<PageBlock[]> => {
    if (!book) return [];
    epubLog(`fetchWindow start spine=${from.spineIndex} block=${from.blockIndex} dir=${dir} limit=${limit}`);
    const out: PageBlock[] = [];
    if (dir === 'forward') {
      let s = from.spineIndex;
      let b = from.blockIndex;
      while (s < book.spine.length && out.length < limit) {
        const blocks = await book.getBlocks(s);
        while (b < blocks.length && out.length < limit) {
          out.push({ loc: { spineIndex: s, blockIndex: b, offset: 0 }, block: blocks[b]! });
          b += 1;
        }
        s += 1;
        b = 0;
      }
    } else {
      let s = from.spineIndex;
      let b = from.blockIndex - 1;
      while (s >= 0 && out.length < limit) {
        const blocks = await book.getBlocks(s);
        if (b < 0) {
          s -= 1;
          if (s >= 0) {
            const prev = await book.getBlocks(s);
            b = prev.length - 1;
          }
          continue;
        }
        while (b >= 0 && out.length < limit) {
          out.unshift({ loc: { spineIndex: s, blockIndex: b, offset: 0 }, block: blocks[b]! });
          b -= 1;
        }
      }
    }
    if (out.length === 0) {
      epubWarn(`fetchWindow returned 0 blocks (dir=${dir}, from spine ${from.spineIndex}) — the page will not render`);
    } else {
      epubLog(`fetchWindow done: ${out.length} blocks (dir=${dir})`);
    }
    return out;
  }, [book]);

  /** Characters of book text before a location (uses cached spine text). */
  const charsBefore = useCallback(async (loc: BookLocation): Promise<number> => {
    if (!book) return 0;
    let sum = 0;
    for (let i = 0; i < loc.spineIndex; i++) {
      sum += (await book.spineTextData(i)).text.length;
    }
    const { starts } = await book.spineTextData(loc.spineIndex);
    return sum + (starts[loc.blockIndex] ?? 0) + loc.offset;
  }, [book]);

  const estimatePageNumber = useCallback(async (loc: BookLocation) => {
    const before = await charsBefore(loc);
    return Math.max(1, Math.floor(before / Math.max(1, charsPerPageRef.current)) + 1);
  }, [charsBefore]);

  // ── Measure the current window and derive the page ──
  useEffect(() => {
    if (!window.length || !measureRef.current) {
      if (!window.length) {
        // Spinner hangs when this stays true: either the fetch is still in
        // flight (see "fetchWindow start" without "done") or it returned 0
        // blocks (see the fetchWindow warning).
        epubWarn('measure skipped: window is empty — measuring stays true');
      }
      return;
    }
    const gen = genRef.current;
    const mode = modeRef.current;
    const base = baseRef.current;
    const pageHeight = pageHeightRef.current;
    setMeasuring(true);

    const run = () => {
      if (gen !== genRef.current) return;
      const measureEl = measureRef.current;
      if (!measureEl) return;
      // The measure container must have the same width as the visible column
      // or block heights (and therefore page breaks) will be wrong.
      const contentWidth = viewportRef.current?.clientWidth ?? 0;
      if (contentWidth > 0) measureEl.style.width = `${contentWidth}px`;
      const children = Array.from(measureEl.children) as HTMLElement[];
      if (children.length === 0) {
        epubLog('measure: container has no children yet — clearing measuring');
        setMeasuring(false);
        return;
      }
      // Record heights for every measured block.
      for (let i = 0; i < children.length; i++) {
        const key = `${window[i]!.loc.spineIndex}:${window[i]!.loc.blockIndex}`;
        heightsRef.current.set(key, children[i]!.offsetHeight);
      }

      if (mode === 'forward') {
        let acc = 0;
        let endIdx = children.length;
        for (let i = 0; i < children.length; i++) {
          const h = children[i]!.offsetHeight;
          if (acc + h > pageHeight && acc > 0) {
            endIdx = i;
            break;
          }
          acc += h;
        }
        const start = base ?? window[0]!.loc;
        const end = endIdx < window.length ? window[endIdx]!.loc : null;
        pageStartRef.current = start;
        pageEndRef.current = end;
        const pageChars = window
          .slice(0, endIdx)
          .reduce((n, p) => n + (p.block.kind === 'text' ? p.block.text.length : 0), 0);
        if (pageChars > 0) {
          charsPerPageRef.current = (charsPerPageRef.current * 3 + pageChars) / 4;
        }
        if (totalCharsRef.current > 0) {
          setTotalPagesEstimate(Math.max(1, Math.ceil(totalCharsRef.current / charsPerPageRef.current)));
        }
        const page = window.slice(0, endIdx);
        epubLog(`measured forward: ${children.length} children → ${page.length} page blocks (spine ${start.spineIndex} block ${start.blockIndex})`);
        setPageBlocks(page);
        void estimatePageNumber(start).then(n => {
          if (gen === genRef.current) setPageNumber(n);
        });
      } else {
        // Backward: walk from the end; prevStart = first block that fits
        // together with everything after it.
        let acc = 0;
        let prevStart = 0;
        for (let i = children.length - 1; i >= 0; i--) {
          const h = children[i]!.offsetHeight;
          if (acc + h > pageHeight && acc > 0) {
            prevStart = i + 1;
            break;
          }
          acc += h;
        }
        if (prevStart === 0 && children.length === WINDOW_LIMIT) {
          // Window wasn't enough — extend backward and retry.
          const b = base ?? window[0]!.loc;
          epubLog(`measure backward: window too small (${children.length} children) — extending backward`);
          void fetchWindow(b, 'backward', WINDOW_LIMIT * 2).then(entries => {
            if (gen !== genRef.current) {
              epubWarn(`backward-extension fetch dropped (stale: gen=${gen} vs genRef=${genRef.current})`);
              return;
            }
            if (entries.length === 0) setMeasuring(false);
            setWindow(entries);
          });
          return;
        }
        const start = window[prevStart]!.loc;
        const end = base;
        pageStartRef.current = start;
        pageEndRef.current = end;
        const page = window.slice(prevStart);
        epubLog(`measured backward: ${children.length} children → ${page.length} page blocks (spine ${start.spineIndex} block ${start.blockIndex})`);
        setPageBlocks(page);
        void estimatePageNumber(start).then(n => {
          if (gen === genRef.current) setPageNumber(n);
        });
      }
      setMeasuring(false);
    };

    const id = requestAnimationFrame(() => requestAnimationFrame(run));
    return () => cancelAnimationFrame(id);
  }, [window, viewport, fetchWindow, estimatePageNumber, measureNonce]);

  /** Jump to a location (TOC, search, links, restore). */
  const jumpTo = useCallback((loc: BookLocation) => {
    if (!book) return;
    epubLog(`jumpTo spine=${loc.spineIndex} block=${loc.blockIndex} offset=${loc.offset}`);
    genRef.current += 1;
    const gen = genRef.current;
    modeRef.current = 'forward';
    baseRef.current = loc;
    setMeasuring(true);
    setPageBlocks([]);
    const fetchGen = ++fetchRef.current;
    void fetchWindow(loc, 'forward', WINDOW_LIMIT).then(entries => {
      if (fetchGen !== fetchRef.current || gen !== genRef.current) {
        epubWarn(`fetchWindow result dropped (stale: fetchGen=${fetchGen} vs fetchRef=${fetchRef.current}, gen=${gen} vs genRef=${genRef.current}) — a newer jump/reset superseded it`);
        return;
      }
      // Empty result (no content after this location) must not leave the
      // spinner up forever — the measure effect can't run on an empty
      // window, so clear the measuring flag here.
      if (entries.length === 0) setMeasuring(false);
      setWindow(entries);
    });
    void estimatePageNumber(loc).then(n => {
      if (gen === genRef.current) setPageNumber(n);
    });
  }, [book, fetchWindow, estimatePageNumber]);

  const nextPage = useCallback(() => {
    const end = pageEndRef.current;
    if (end) jumpTo(end);
  }, [jumpTo]);

  const prevPage = useCallback(() => {
    if (!book) return;
    const base = pageStartRef.current;
    if (!base) return;
    epubLog(`prevPage → spine=${base.spineIndex} block=${base.blockIndex} offset=${base.offset}`);
    genRef.current += 1;
    const gen = genRef.current;
    modeRef.current = 'backward';
    baseRef.current = base;
    setMeasuring(true);
    setPageBlocks([]);
    const fetchGen = ++fetchRef.current;
    void fetchWindow(base, 'backward', WINDOW_LIMIT).then(entries => {
      if (fetchGen !== fetchRef.current || gen !== genRef.current) {
        epubWarn(`backward fetch result dropped (stale: fetchGen=${fetchGen} vs fetchRef=${fetchRef.current}, gen=${gen} vs genRef=${genRef.current}) — a newer jump/reset superseded it`);
        return;
      }
      if (entries.length === 0) setMeasuring(false);
      setWindow(entries);
    });
  }, [book, fetchWindow]);

  return {
    viewportRef,
    measureRef,
    /** The blocks rendered into the hidden measuring container. */
    measureWindow: window,
    pageBlocks,
    measuring,
    pageNumber,
    totalPagesEstimate,
    pageStart: pageStartRef.current,
    hasPrev: pageStartRef.current
      ? pageStartRef.current.spineIndex > 0 || pageStartRef.current.blockIndex > 0
      : false,
    hasNext: !!pageEndRef.current,
    jumpTo,
    nextPage,
    prevPage,
  };
}
