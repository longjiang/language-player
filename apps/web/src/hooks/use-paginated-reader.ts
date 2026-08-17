/**
 * Unified web reader paginator — one measurement-based implementation for
 * all three web readers (notes, web reader, EPUB). Consolidates ReaderPanel's
 * inline pagination and the EPUB `usePaginatedBook` windowed paginator.
 *
 * Two modes behind one surface:
 *
 * - `full` (markdown: notes + web reader): the whole block stream is known
 *   synchronously; page breaks are measured over all blocks on every layout
 *   change; page numbers and the total are exact.
 * - `windowed` (EPUB): blocks are fetched lazily per spine item; only a
 *   window around the current page is measured, block heights are cached,
 *   and the total page count is an estimate (SPEC-032 semantics).
 *
 * The hook also owns the visible page's tokenization and translation caches,
 * so every reader shares one lemmatize/translate policy.
 *
 * This is the measurement-based predecessor of SPEC-077's CSS-columns pager:
 * the component surface (PaginatedReader) is already the one SPEC-077 plans,
 * so the future migration swaps only this hook's internals.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LemmatizedToken } from '@langplayer/shared';
import { md5 } from '@langplayer/utils';
import type { ReaderBlock, MarkdownBlock, TextBlock } from '@/lib/parse-markdown';
import type { EpubBook } from '@/lib/epub-book';
import { epubBlocksToReaderBlocks } from '@/lib/epub-reader-blocks';
import type {
  BookLocation,
} from '@/lib/epub-book-types';
import { epubLog, epubWarn } from '@/lib/epub-log';

/** Location of a block in its reader's block stream. */
export type ReaderLoc = BookLocation | { blockIndex: number };

/**
 * One block in the pager's unified stream. Every web reader (notes, web
 * reader, EPUB) renders the same markdown block stream (`ReaderBlock`), so
 * items are `text` or `markdown` — images/tables/code arrive as markdown
 * blocks and render via ReactMarkdown. `loc` carries the reader's position.
 */
export type ReaderPageItem =
  | { key: string; kind: 'text'; text: string; block: TextBlock; loc: ReaderLoc }
  | { key: string; kind: 'markdown'; block: MarkdownBlock; loc: ReaderLoc };

/** Per-block render context handed to `renderBlock` by PaginatedReader. */
export interface BlockRenderCtx {
  tokens: LemmatizedToken[] | undefined;
  translation: string | undefined;
  isTranslating: boolean;
}

/** Max blocks rendered into the hidden measuring window at once (EPUB). */
const WINDOW_LIMIT = 240;

/**
 * A block's height plus which spine document it belongs to — the two inputs
 * the page-break math needs. `heights[i]` must align index-for-index with
 * the block window.
 */
export interface BreakInput {
  height: number;
  spineIndex: number;
}

/**
 * True when block `i` is the first block of a new spine document. A new spine
 * document always begins on a fresh page (EPUB-native semantics — in 1Q84 each
 * chapter is its own XHTML file), so a block that crosses a spine boundary is
 * a hard page start even when it would otherwise fit on the current page.
 */
export function startsNewSpine(win: BreakInput[], i: number): boolean {
  return i > 0 && win[i]!.spineIndex !== win[i - 1]!.spineIndex;
}

/**
 * Compute the index of the first block that does NOT fit on the first page of
 * the forward window (i.e. `endIdx` — the page is `win[0..endIdx)`). Progress
 * is stopped by either a page-height overflow or a spine boundary, whichever
 * occurs first. The spine-boundary rule means a chapter/document title never
 * shares a page with the previous document's tail.
 */
export function computeForwardEnd(
  win: BreakInput[],
  pageHeight: number,
): number {
  let acc = 0;
  for (let i = 0; i < win.length; i++) {
    const h = win[i]!.height;
    if (startsNewSpine(win, i) && acc > 0) return i;
    if (acc + h > pageHeight && acc > 0) return i;
    acc += h;
  }
  return win.length;
}

/**
 * Compute the first block (lowest index) of the visible page when paging
 * backward: `page = win[prevStart..end]`. Two distinct triggers:
 *  - height overflow: block i doesn't fit with everything after it, so it
 *    belongs to the previous page → the visible page starts at i+1;
 *  - spine boundary: block i opens a new spine document (a hard page start)
 *    → the visible page starts at i.
 */
export function computeBackwardStart(
  win: BreakInput[],
  pageHeight: number,
): number {
  let acc = 0;
  for (let i = win.length - 1; i >= 0; i--) {
    const h = win[i]!.height;
    if (acc + h > pageHeight && acc > 0) return i + 1;
    if (startsNewSpine(win, i) && acc > 0) return i;
    acc += h;
  }
  return 0;
}

interface PageBlock {
  loc: BookLocation;
  block: ReaderBlock;
}

export interface UsePaginatedReaderOptions {
  /** Markdown stream (notes / web reader). Mutually exclusive with `book`. */
  blocks?: ReaderBlock[] | null;
  /** Whole-book stream (EPUB). Mutually exclusive with `blocks`. */
  book?: EpubBook | null;
  /** Desired reading location (EPUB restore / TOC / search / links). */
  location?: BookLocation | null;
  /** Increment to re-apply `location` after a jump. */
  jumpNonce?: number;
  /** Called whenever the visible page's start changes. */
  onLocationChange?: (loc: ReaderLoc) => void;
  onLemmatize: (texts: string[]) => Promise<LemmatizedToken[][]>;
  onPageTranslate: (texts: string[]) => Promise<Record<string, string>>;
  /** Whether the translation column should be fetched/displayed. */
  showTranslation: boolean;
  /**
   * Layout identity — re-measure page breaks whenever it changes (text zoom,
   * translation column, ruby estimate), because block heights changed.
   */
  measureNonce?: string | number;
  /** Chrome (nav bar, padding) subtracted from the viewport height. */
  chromeHeight?: number;
}

export interface UsePaginatedReaderReturn {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  measureRef: React.RefObject<HTMLDivElement | null>;
  /** Blocks rendered into the hidden measuring container. */
  measureWindow: ReaderPageItem[];
  /** Blocks of the visible page. */
  pageBlocks: ReaderPageItem[];
  /** True while page breaks are being (re)measured or a window is loading. */
  measuring: boolean;
  /** Current page number, 1-based. */
  page: number;
  /** Exact (markdown) or estimated (EPUB) total page count. */
  totalPages: number;
  totalPagesIsEstimate: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  nextPage: () => void;
  prevPage: () => void;
  /** Jump to a location in the stream (EPUB: BookLocation; markdown: block index). */
  jumpTo: (loc: ReaderLoc) => void;
  /** Lemmatized tokens for the visible page, keyed by item key. */
  tokenCache: Record<string, LemmatizedToken[]>;
  /** Translations for the visible page, keyed by item key. */
  blockTranslations: Record<string, string>;
  isTranslating: boolean;
  loadingTokens: boolean;
}

export function usePaginatedReader(opts: UsePaginatedReaderOptions): UsePaginatedReaderReturn {
  const {
    blocks,
    book,
    location,
    jumpNonce,
    onLocationChange,
    onLemmatize,
    onPageTranslate,
    showTranslation,
    measureNonce = 0,
    chromeHeight = 0,
  } = opts;
  const mode: 'full' | 'windowed' = book ? 'windowed' : 'full';

  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  // ── Shared caches (visible page) ──
  const [tokenCache, setTokenCache] = useState<Record<string, LemmatizedToken[]>>({});
  const [blockTranslations, setBlockTranslations] = useState<Record<string, string>>({});
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const tokenGenRef = useRef(0);
  const translateGenRef = useRef(0);

  // ── Viewport size (both modes; resize re-paginates) ──
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
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

  // ═══════════════════════════════════════════════════════════════════════
  // Full mode (markdown: notes + web reader) — all blocks measured at once,
  // exact page numbers.
  // ═══════════════════════════════════════════════════════════════════════
  const items = useMemo<ReaderPageItem[] | null>(() => {
    if (mode !== 'full') return null;
    if (!blocks) return null;
    return blocks.map((block, i): ReaderPageItem =>
      block.kind === 'markdown'
        ? { key: `m:${i}`, kind: 'markdown', block, loc: { blockIndex: i } }
        : { key: `m:${i}`, kind: 'text', text: block.text, block, loc: { blockIndex: i } },
    );
  }, [mode, blocks]);

  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasMeasured, setHasMeasured] = useState(false);
  const prevBlocksRef = useRef<ReaderBlock[] | null | undefined>(undefined);

  // Reset caches when the stream changes (new note / re-tokenize).
  useEffect(() => {
    if (mode !== 'full') return;
    if (prevBlocksRef.current === blocks) return;
    prevBlocksRef.current = blocks;
    setTokenCache({});
    setBlockTranslations({});
    setPageBreaks([]);
    setPageIndex(0);
    setHasMeasured(false);
  }, [mode, blocks]);

  // Measure the whole stream: render all blocks hidden, walk offsetTop/
  // offsetHeight to find block-index page breaks. Re-runs on content change,
  // layout identity change, and resize.
  useEffect(() => {
    if (mode !== 'full') return;
    if (!blocks || blocks.length === 0) {
      setPageBreaks([]);
      setPageIndex(0);
      setHasMeasured(true);
      return;
    }
    const el = measureRef.current;
    if (!el) return;
    const vp = viewportRef.current;
    if (!vp || vp.clientWidth <= 0) return;
    const pageHeight = Math.max(120, vp.clientHeight - chromeHeight);
    el.style.width = `${vp.clientWidth}px`;
    el.style.height = `${pageHeight}px`;

    // Double rAF to ensure layout is complete.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const children = Array.from(el.children) as HTMLElement[];
        if (children.length === 0) {
          setPageBreaks([]);
          setPageIndex(0);
          setHasMeasured(true);
          return;
        }
        const breaks: number[] = [];
        let accumulated = 0;
        let prevBottom = 0;
        for (let i = 0; i < children.length; i++) {
          const c = children[i]!;
          const top = c.offsetTop;
          const h = c.offsetHeight;
          // Real vertical gap to the previous block (collapsed margins
          // included) — from geometry, not per-block getComputedStyle.
          const gap = i === 0 ? 0 : Math.max(0, top - prevBottom);
          const blockHeight = h + gap;
          if (accumulated + blockHeight > pageHeight && accumulated > 0) {
            breaks.push(i);
            accumulated = blockHeight;
          } else {
            accumulated += blockHeight;
          }
          prevBottom = top + h;
        }
        setPageBreaks(breaks);
        setPageIndex(0);
        setHasMeasured(true);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [mode, blocks, measureNonce, chromeHeight, viewport]);

  const clampedPageIndex = Math.min(pageIndex, Math.max(0, pageBreaks.length));
  const fullPageBlocks = useMemo<ReaderPageItem[]>(() => {
    if (mode !== 'full' || !items || items.length === 0 || !hasMeasured) return [];
    const start = clampedPageIndex === 0 ? 0 : pageBreaks[clampedPageIndex - 1]!;
    const end = clampedPageIndex < pageBreaks.length ? pageBreaks[clampedPageIndex]! : items.length;
    return items.slice(start, end);
  }, [mode, items, hasMeasured, pageBreaks, clampedPageIndex]);

  const fullNextPage = useCallback(() => {
    setPageIndex(p => Math.min(p + 1, pageBreaks.length));
  }, [pageBreaks.length]);
  const fullPrevPage = useCallback(() => {
    setPageIndex(p => Math.max(0, p - 1));
  }, []);
  const fullJumpTo = useCallback((loc: ReaderLoc) => {
    if (!('blockIndex' in loc)) return;
    const target = loc.blockIndex;
    let p = 0;
    for (let b = 0; b < pageBreaks.length; b++) {
      if (pageBreaks[b]! <= target) p = b + 1;
      else break;
    }
    setPageIndex(p);
  }, [pageBreaks]);

  // Report the visible page's first block as the reader location.
  const lastFullLocKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'full' || !onLocationChange) return;
    const first = fullPageBlocks[0];
    if (!first) return;
    const key = first.key;
    if (lastFullLocKeyRef.current === key) return;
    lastFullLocKeyRef.current = key;
    const streamIndex = (first.loc as { blockIndex: number }).blockIndex;
    onLocationChange({ blockIndex: streamIndex });
  }, [mode, fullPageBlocks, onLocationChange]);

  // ═══════════════════════════════════════════════════════════════════════
  // Windowed mode (EPUB whole book) — lazy windows, cached heights, estimated
  // totals. Ported from usePaginatedBook (SPEC-032).
  // ═══════════════════════════════════════════════════════════════════════
  const [win, setWin] = useState<PageBlock[]>([]);
  const [pageBlocks, setPageBlocks] = useState<PageBlock[]>([]);
  const [measuring, setMeasuring] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPagesEstimate, setTotalPagesEstimate] = useState(0);

  const winModeRef = useRef<'forward' | 'backward'>('forward');
  const baseRef = useRef<BookLocation | null>(null);
  const pageStartRef = useRef<BookLocation | null>(null);
  const pageEndRef = useRef<BookLocation | null>(null);
  const heightsRef = useRef(new Map<string, number>());
  const widthRef = useRef(0);
  const pageHeightRef = useRef(600);
  const charsPerPageRef = useRef(400);
  /** Layout identity the chars-per-page divisor was derived for. */
  const charsPerPageLayoutRef = useRef<string | null>(null);
  /** Jump location awaiting a page-number estimate after the first measure. */
  const pendingEstimateRef = useRef<BookLocation | null>(null);
  const totalCharsRef = useRef(0);
  const genRef = useRef(0);
  const fetchRef = useRef(0); // guards against stale async fetches
  const prevBookRef = useRef<EpubBook | null | undefined>(null);

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
        const readerBlocks = epubBlocksToReaderBlocks(await book.getBlocks(s), s);
        while (b < readerBlocks.length && out.length < limit) {
          out.push({ loc: { spineIndex: s, blockIndex: b, offset: 0 }, block: readerBlocks[b]! });
          b += 1;
        }
        s += 1;
        b = 0;
      }
    } else {
      let s = from.spineIndex;
      let b = from.blockIndex - 1;
      while (s >= 0 && out.length < limit) {
        const readerBlocks = epubBlocksToReaderBlocks(await book.getBlocks(s), s);
        if (b < 0) {
          s -= 1;
          if (s >= 0) {
            const prev = epubBlocksToReaderBlocks(await book.getBlocks(s), s);
            b = prev.length - 1;
          }
          continue;
        }
        while (b >= 0 && out.length < limit) {
          out.unshift({ loc: { spineIndex: s, blockIndex: b, offset: 0 }, block: readerBlocks[b]! });
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
    const divisor = Math.max(1, charsPerPageRef.current);
    const n = Math.max(1, Math.floor(before / divisor) + 1);
    epubLog(`estimatePageNumber spine=${loc.spineIndex} block=${loc.blockIndex} → charsBefore=${before} charsPerPage=${divisor} page=${n}`);
    return n;
  }, [charsBefore]);

  // ── Reset on book change ──
  // Guard with prevBookRef: React 18 dev StrictMode double-invokes mount
  // effects, and a second reset would bump gen/fetch and invalidate the only
  // in-flight fetchWindow (whose result is dropped by the stale guard below),
  // leaving measuring=true forever — the infinite spinner.
  useEffect(() => {
    if (mode !== 'windowed') return;
    if (prevBookRef.current === book) return;
    prevBookRef.current = book;
    genRef.current += 1;
    fetchRef.current += 1;
    heightsRef.current.clear();
    pageStartRef.current = null;
    pageEndRef.current = null;
    setPageNumber(1);
    setPageBlocks([]);
    setWin([]);
    setTokenCache({});
    setBlockTranslations({});
    totalCharsRef.current = 0;
    charsPerPageRef.current = 400;
    charsPerPageLayoutRef.current = null;
    pendingEstimateRef.current = null;
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
  }, [mode, book]);

  // Width change → block heights are width-dependent, drop the cache.
  useEffect(() => {
    if (mode !== 'windowed') return;
    if (viewport.w > 0 && Math.abs(viewport.w - widthRef.current) > 2) {
      widthRef.current = viewport.w;
      heightsRef.current.clear();
    }
    pageHeightRef.current = Math.max(120, viewport.h - chromeHeight);
  }, [mode, viewport, chromeHeight]);

  // ── Measure the current window and derive the page ──
  useEffect(() => {
    if (mode !== 'windowed') return;
    if (!win.length || !measureRef.current) {
      if (!win.length) {
        // Spinner hangs when this stays true: either the fetch is still in
        // flight (see "fetchWindow start" without "done") or it returned 0
        // blocks (see the fetchWindow warning).
        epubWarn('measure skipped: window is empty — measuring stays true');
      }
      return;
    }
    const gen = genRef.current;
    const modeDir = winModeRef.current;
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
        const key = `${win[i]!.loc.spineIndex}:${win[i]!.loc.blockIndex}`;
        heightsRef.current.set(key, children[i]!.offsetHeight);
      }

      if (modeDir === 'forward') {
        // A new spine document always begins on a fresh page (EPUB-native
        // semantics — in 1Q84 each chapter is its own XHTML file), so a block
        // that starts a new spine item is a hard page boundary even when it
        // would otherwise fit — chapter titles never share a page with the
        // previous document's tail.
        const endIdx = computeForwardEnd(
          win.map((p, i) => ({ height: children[i]!.offsetHeight, spineIndex: p.loc.spineIndex })),
          pageHeight,
        );
        const start = base ?? win[0]!.loc;
        const end = endIdx < win.length ? win[endIdx]!.loc : null;
        pageStartRef.current = start;
        pageEndRef.current = end;
        const pageChars = win
          .slice(0, endIdx)
          .reduce((n, p) => n + (p.block.kind === 'text' ? p.block.text.length : 0), 0);
        const layout = `${viewport.w}:${measureNonce}`;
        if (charsPerPageLayoutRef.current !== layout) {
          // Derive the chars-per-page divisor from up to 3 page breaks inside
          // THIS rendered window (no extra DOM renders), then freeze it for
          // the layout — so the estimate is accurate immediately and never
          // drifts on later page turns. Re-derived only when the book,
          // viewport, or display settings change.
          charsPerPageLayoutRef.current = layout;
          const breakInput = win.map((p, i) => ({
            height: children[i]!.offsetHeight,
            spineIndex: p.loc.spineIndex,
          }));
          const breaks: number[] = [];
          let acc2 = 0;
          for (let i = 0; i < children.length && breaks.length < 3; i++) {
            const h = children[i]!.offsetHeight;
            if ((startsNewSpine(breakInput, i) || acc2 + h > pageHeight) && acc2 > 0) {
              breaks.push(i);
              acc2 = 0;
            }
            acc2 += h;
          }
          const pageStarts = [0, ...breaks];
          const pageEnds = [...breaks, children.length];
          const sampleCount = Math.min(3, pageStarts.length);
          let sampleChars = 0;
          for (let k = 0; k < sampleCount; k++) {
            for (let j = pageStarts[k]!; j < pageEnds[k]!; j++) {
              const b = win[j]!.block;
              if (b.kind === 'text') sampleChars += b.text.length;
            }
          }
          if (sampleChars > 0) charsPerPageRef.current = sampleChars / sampleCount;
        }
        if (totalCharsRef.current > 0) {
          setTotalPagesEstimate(Math.max(1, Math.ceil(totalCharsRef.current / Math.max(1, charsPerPageRef.current))));
        }
        epubLog(`measure forward: pageChars=${pageChars} → charsPerPage=${charsPerPageRef.current}`);
        const page = win.slice(0, endIdx);
        epubLog(`measured forward: ${children.length} children → ${page.length} page blocks (spine ${start.spineIndex} block ${start.blockIndex})`);
        setPageBlocks(page);
        const target = pendingEstimateRef.current;
        if (target) {
          pendingEstimateRef.current = null;
          void estimatePageNumber(target).then(n => {
            if (gen === genRef.current) {
              epubLog(`measure-applied estimate: page=${n} (spine=${target.spineIndex} block=${target.blockIndex})`);
              setPageNumber(n);
            }
          });
        }
      } else {
        // Backward: walk from the end; prevStart = first block of the visible
        // page. Spine-boundary blocks are hard page starts (see forward).
        const prevStart = computeBackwardStart(
          win.map((p, i) => ({ height: children[i]!.offsetHeight, spineIndex: p.loc.spineIndex })),
          pageHeight,
        );
        if (prevStart === 0 && children.length === WINDOW_LIMIT) {
          // Window wasn't enough — extend backward and retry.
          const b = base ?? win[0]!.loc;
          epubLog(`measure backward: window too small (${children.length} children) — extending backward`);
          void fetchWindow(b, 'backward', WINDOW_LIMIT * 2).then(entries => {
            if (gen !== genRef.current) {
              epubWarn(`backward-extension fetch dropped (stale: gen=${gen} vs genRef=${genRef.current})`);
              return;
            }
            if (entries.length === 0) setMeasuring(false);
            setWin(entries);
          });
          return;
        }
        const start = win[prevStart]!.loc;
        const end = base;
        pageStartRef.current = start;
        pageEndRef.current = end;
        const page = win.slice(prevStart);
        epubLog(`measured backward: ${children.length} children → ${page.length} page blocks (spine ${start.spineIndex} block ${start.blockIndex})`);
        setPageBlocks(page);
      }
      setMeasuring(false);
    };

    const id = requestAnimationFrame(() => requestAnimationFrame(run));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win, viewport, fetchWindow, estimatePageNumber, measureNonce]);

  /**
   * Jump to a location (TOC, search, links, restore). Page turns pass
   * `keepPageNumber` so the session page counter steps ±1 instead of
   * re-estimating.
   */
  const windowedJumpTo = useCallback((loc: BookLocation, opts?: { keepPageNumber?: boolean }) => {
    if (!book) return;
    epubLog(`jumpTo spine=${loc.spineIndex} block=${loc.blockIndex} offset=${loc.offset}`);
    genRef.current += 1;
    const gen = genRef.current;
    winModeRef.current = 'forward';
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
      if (entries.length === 0) {
        setMeasuring(false);
        const target = pendingEstimateRef.current;
        if (target) {
          pendingEstimateRef.current = null;
          void estimatePageNumber(target).then(n => {
            if (gen === genRef.current) {
              epubLog(`jumpTo estimate applied (empty window): page=${n} (spine=${target.spineIndex} block=${target.blockIndex})`);
              setPageNumber(n);
            }
          });
        }
      }
      setWin(entries);
    });
    if (!opts?.keepPageNumber) {
      pendingEstimateRef.current = loc;
    }
  }, [book, fetchWindow, estimatePageNumber]);

  const windowedNextPage = useCallback(() => {
    const end = pageEndRef.current;
    if (!end) return;
    setPageNumber(n => n + 1);
    epubLog(`nextPage → page counter +1 → jump to spine=${end.spineIndex} block=${end.blockIndex} offset=${end.offset}`);
    windowedJumpTo(end, { keepPageNumber: true });
  }, [windowedJumpTo]);

  const windowedPrevPage = useCallback(() => {
    if (!book) return;
    const base = pageStartRef.current;
    if (!base) return;
    setPageNumber(n => Math.max(1, n - 1));
    epubLog(`prevPage → walk backward from spine=${base.spineIndex} block=${base.blockIndex} offset=${base.offset}`);
    genRef.current += 1;
    const gen = genRef.current;
    winModeRef.current = 'backward';
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
      setWin(entries);
    });
  }, [book, fetchWindow]);

  // Re-apply an external jump (restore / TOC / search / links). Also
  // re-applies when the book instance changes: a re-open swaps the EpubBook
  // and the paginator reset invalidates any in-flight fetch, so the new book
  // needs its own jump (otherwise the window stays empty and the spinner
  // never clears).
  const lastNonceRef = useRef<number | null | undefined>(null);
  const lastJumpBookRef = useRef<EpubBook | null | undefined>(null);
  useEffect(() => {
    if (mode !== 'windowed' || !location) return;
    if (lastNonceRef.current === jumpNonce && lastJumpBookRef.current === book) return;
    lastNonceRef.current = jumpNonce;
    lastJumpBookRef.current = book;
    windowedJumpTo(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, jumpNonce, book, location]);

  // Persist the current page start whenever it changes.
  const lastSavedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'windowed' || !onLocationChange) return;
    const start = pageStartRef.current;
    if (!start) return;
    const key = `${start.spineIndex}:${start.blockIndex}:${start.offset}`;
    if (lastSavedKeyRef.current === key) return;
    lastSavedKeyRef.current = key;
    onLocationChange(start);
  }, [mode, pageBlocks, onLocationChange]);

  const windowItems = useMemo<ReaderPageItem[]>(() =>
    win.map((p): ReaderPageItem => {
      const key = `${p.loc.spineIndex}:${p.loc.blockIndex}`;
      if (p.block.kind === 'markdown') {
        return { key, kind: 'markdown', block: p.block, loc: p.loc };
      }
      return { key, kind: 'text', text: p.block.text, block: p.block, loc: p.loc };
    }),
  [win]);

  const windowedPageItems = useMemo<ReaderPageItem[]>(() =>
    pageBlocks.map((p): ReaderPageItem => {
      const key = `${p.loc.spineIndex}:${p.loc.blockIndex}`;
      if (p.block.kind === 'markdown') {
        return { key, kind: 'markdown', block: p.block, loc: p.loc };
      }
      return { key, kind: 'text', text: p.block.text, block: p.block, loc: p.loc };
    }),
  [pageBlocks]);

  // ═══════════════════════════════════════════════════════════════════════
  // Shared: visible-page tokenization + translation (one policy for all
  // readers). Keyed by item key; translations additionally md5-keyed on the
  // wire so a stale response can never attach to a different block.
  // ═══════════════════════════════════════════════════════════════════════
  const pageItems = mode === 'full' ? fullPageBlocks : windowedPageItems;

  useEffect(() => {
    const textItems = pageItems.filter(
      (i): i is ReaderPageItem & { kind: 'text' } => i.kind === 'text',
    );
    const missing = textItems.filter(i => !tokenCache[i.key]);
    if (missing.length === 0) return;
    const gen = ++tokenGenRef.current;
    setLoadingTokens(true);
    onLemmatize(missing.map(i => i.text)).then(results => {
      if (gen !== tokenGenRef.current) return;
      setTokenCache(prev => {
        const next = { ...prev };
        missing.forEach((m, i) => {
          if (results[i]) next[m.key] = results[i]!;
        });
        return next;
      });
    }).catch(() => {
      // Allow a later effect run to retry the failed blocks.
    }).finally(() => {
      if (gen === tokenGenRef.current) setLoadingTokens(false);
    });
  }, [pageItems, tokenCache, onLemmatize]);

  useEffect(() => {
    if (!showTranslation) return;
    const textItems = pageItems.filter(
      (i): i is ReaderPageItem & { kind: 'text' } => i.kind === 'text',
    );
    if (textItems.length === 0) return;
    const missing = textItems.filter(i => !blockTranslations[i.key]);
    if (missing.length === 0) return;
    const gen = ++translateGenRef.current;
    setIsTranslating(true);
    onPageTranslate(missing.map(i => i.text)).then(byKey => {
      if (gen !== translateGenRef.current) return;
      setBlockTranslations(prev => {
        const next = { ...prev };
        for (const m of missing) {
          const tr = byKey[md5(m.text)];
          if (tr) next[m.key] = tr;
        }
        return next;
      });
    }).catch(() => {
      // Translation failed — leave the block untranslated; the next page
      // change re-attempts it.
    }).finally(() => {
      if (gen === translateGenRef.current) setIsTranslating(false);
    });
  }, [showTranslation, pageItems, blockTranslations, onPageTranslate]);

  // ═══════════════════════════════════════════════════════════════════════
  // Unified surface
  // ═══════════════════════════════════════════════════════════════════════
  const fullHasPrev = pageIndex > 0;
  const fullHasNext = pageIndex < pageBreaks.length;
  const windowedHasPrev = pageStartRef.current
    ? pageStartRef.current.spineIndex > 0 || pageStartRef.current.blockIndex > 0
    : false;
  const windowedHasNext = !!pageEndRef.current;

  /** Jump to a stream location: block index (markdown) or BookLocation (EPUB). */
  const jumpTo = useCallback((loc: ReaderLoc) => {
    if (mode === 'full') {
      fullJumpTo(loc);
    } else if ('spineIndex' in loc) {
      windowedJumpTo(loc);
    }
  }, [mode, fullJumpTo, windowedJumpTo]);

  return {
    viewportRef,
    measureRef,
    measureWindow: mode === 'full' ? (items ?? []) : windowItems,
    pageBlocks: pageItems,
    measuring: mode === 'full' ? !hasMeasured : measuring,
    page: mode === 'full' ? clampedPageIndex + 1 : pageNumber,
    totalPages: mode === 'full' ? Math.max(1, pageBreaks.length + 1) : totalPagesEstimate,
    totalPagesIsEstimate: mode === 'windowed',
    hasPrev: mode === 'full' ? fullHasPrev : windowedHasPrev,
    hasNext: mode === 'full' ? fullHasNext : windowedHasNext,
    nextPage: mode === 'full' ? fullNextPage : windowedNextPage,
    prevPage: mode === 'full' ? fullPrevPage : windowedPrevPage,
    jumpTo,
    tokenCache,
    blockTranslations,
    isTranslating,
    loadingTokens,
  };
}
