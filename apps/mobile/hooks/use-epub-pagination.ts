import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { parseMarkdownBlocks } from '@/lib/parse-markdown';
import type { ContentBlock, TextBlock } from '@/lib/parse-markdown';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { LemmatizedToken } from '@langplayer/shared';
import { lemmatizeLogger, readerLogger, translationLogger } from '@/lib/logger';
import { isOfflineModeEnabled } from '@/lib/offline-mode';

const { log } = lemmatizeLogger;
const { log: paginationLog, logwarn: paginationWarn } = readerLogger;

interface UseEpubPaginationOptions {
  text: string;
  l1Code: string;
  l2Code: string;
  showTranslation: boolean;
  /** Committed side-by-side split (display.translationSplit, SPEC-082 Task 3).
   *  Changing it invalidates page-break measurements. Default 0.6. */
  translationSplit?: number;
  /** Resets all state when changed (e.g., file name changes) */
  resetKey: string | null;
  /** Pre-parsed whole-book blocks (EPUB, SPEC-049 §9.1) — skips markdown parsing. */
  preParsedBlocks?: ContentBlock[] | null;
  /** If set, seek to the page containing this text snippet after measurement. */
  initialAnchor?: string | null;
  /** If set, seek to the page containing this whole-book block index (EPUB). */
  initialBlockIndex?: number | null;
  /** Called with the first ~40 chars of the first text block on the current page. */
  onAnchorChange?: (anchor: string) => void;
  /** Called with the global block index of the first text block on the page. */
  onBlockChange?: (blockIndex: number) => void;
  /** Measure the hidden view in chunks (large whole-book streams). Default: all at once. */
  measureChunkSize?: number;
  /** When true, use web-style lazy measured pagination: only a window around
   *  the current page is measured, heights are cached, and the total page
   *  count is an estimate. Used by the whole-book EPUB reader. */
  estimate?: boolean;
}

/** Translate at most this many paragraphs per request (progressive/lazy). */
const TRANSLATE_CHUNK_SIZE = 10;
/** How many times a suspected-truncated paragraph is retried before accepting it. */
const MAX_TRUNCATED_ATTEMPTS = 3;
/** Max blocks rendered into the hidden measuring window at once. 160 keeps a
 *  page turn cheap on mobile while still covering several pages per pass. */
const WINDOW_LIMIT = 160;
/** Fallback vertical gap between blocks when measured tops aren't available. */
const DEFAULT_BLOCK_GAP = 12;

const TERMINAL_PUNCTUATION = /[。．.！？!?…"”』」"')\]]$/;

/**
 * Heuristic: a paragraph translation is probably truncated when it is much
 * shorter than the source (LLM output-token cutoff) and ends without any
 * sentence-final punctuation. Purely a signal for logging/retry — a short
 * legitimate translation can match it, which is why retries are capped.
 */
function isSuspectedTruncated(source: string, translation: string): boolean {
  const src = source.trim();
  const tr = translation.trim();
  if (src.length < 30 || tr.length === 0) return false;
  if (tr.length / src.length >= 0.5) return false;
  return !TERMINAL_PUNCTUATION.test(tr);
}

/** Rough block height estimate used for non-blocking EPUB pagination. */
function estimateBlockHeight(block: ContentBlock, contentWidth: number): number {
  if (block.kind === 'image') return contentWidth * 0.6 + 24;
  if (block.kind === 'table') return (block.rows.length + 1) * 32 + 16 + 12;
  const charsPerLine = Math.max(20, Math.floor(contentWidth / 8));
  const lines = Math.max(1, Math.ceil(block.text.length / charsPerLine));
  return lines * 24 + 12;
}

interface BlockMetrics {
  height: number;
  top: number;
  /** Slice-start this metric was measured against (layout.y is slice-relative). */
  origin: number;
}

/** All blocks in [start, end) have been measured by the hidden view. */
function allMeasured(
  metrics: (BlockMetrics | undefined)[],
  start: number,
  end: number,
  origin: number,
): boolean {
  for (let i = start; i < end; i++) {
    if (!metrics[i] || metrics[i]!.origin !== origin) return false;
  }
  return true;
}

/** Vertical gap between block i-1 and block i, using real layout tops when possible. */
function gapBetween(metrics: (BlockMetrics | undefined)[], i: number): number {
  const prev = metrics[i - 1];
  const cur = metrics[i];
  if (prev && cur && prev.origin === cur.origin) {
    return Math.max(0, cur.top - (prev.top + prev.height));
  }
  return DEFAULT_BLOCK_GAP;
}

/** Height + inter-block gap for one block (measured when available, else estimated). */
function blockCost(
  block: ContentBlock,
  i: number,
  start: number,
  metrics: (BlockMetrics | undefined)[],
  contentWidth: number,
): number {
  const m = metrics[i];
  const height = m ? m.height : estimateBlockHeight(block, contentWidth);
  const gap = i > start ? gapBetween(metrics, i) : 0;
  return height + gap;
}

/**
 * Walk forward from `start` and return the first block that no longer fits
 * (exclusive end index). `needsMore` means the whole window fit and the
 * measuring window must be extended before a break can be trusted.
 */
function computeForwardEnd(
  blocks: ContentBlock[],
  start: number,
  end: number,
  availableHeight: number,
  metrics: (BlockMetrics | undefined)[],
  contentWidth: number,
  hardStarts: ReadonlySet<number>,
): { endIndex: number; needsMore: boolean } {
  let accumulated = 0;
  for (let i = start; i < end; i++) {
    // SPEC-082 Task 5: a hard page start (new EPUB spine item) begins a new
    // page even if it would fit on the current one.
    if (i > start && hardStarts.has(i)) {
      return { endIndex: i, needsMore: false };
    }
    const cost = blockCost(blocks[i]!, i, start, metrics, contentWidth);
    if (accumulated + cost > availableHeight && accumulated > 0) {
      return { endIndex: i, needsMore: false };
    }
    accumulated += cost;
  }
  return { endIndex: end, needsMore: end < blocks.length };
}

/**
 * Walk backward from `end` (exclusive) and return the first block that starts
 * the page ending at `end`. Extends backward when the whole window fits.
 */
function computeBackwardStart(
  blocks: ContentBlock[],
  start: number,
  end: number,
  availableHeight: number,
  metrics: (BlockMetrics | undefined)[],
  contentWidth: number,
  hardStarts: ReadonlySet<number>,
): { startIndex: number; needsMore: boolean } {
  let accumulated = 0;
  let prevStart = 0;
  for (let i = end - 1; i >= start; i--) {
    const m = metrics[i];
    const height = m ? m.height : estimateBlockHeight(blocks[i]!, contentWidth);
    const gap = i < end - 1 ? gapBetween(metrics, i + 1) : 0;
    const cost = height + gap;
    if (accumulated + cost > availableHeight && accumulated > 0) {
      prevStart = i + 1;
      break;
    }
    // SPEC-082 Task 5: a hard page start (new EPUB spine item) is always the
    // first block of a page, so the page ending at `end` starts here.
    if (i > start && hardStarts.has(i)) {
      prevStart = i;
      break;
    }
    accumulated += cost;
  }
  return { startIndex: prevStart, needsMore: prevStart === 0 && start > 0 };
}

/** Average chars per page sampled from up to 3 measured page breaks. */
function sampleCharsPerPage(
  blocks: ContentBlock[],
  start: number,
  end: number,
  availableHeight: number,
  metrics: (BlockMetrics | undefined)[],
  contentWidth: number,
  hardStarts: ReadonlySet<number>,
): number | null {
  const breaks: number[] = [];
  let accumulated = 0;
  for (let i = start; i < end && breaks.length < 4; i++) {
    const cost = blockCost(blocks[i]!, i, start, metrics, contentWidth);
    // SPEC-082 Task 5: hard page starts count as breaks for the estimate.
    if ((hardStarts.has(i) && accumulated > 0) || (accumulated + cost > availableHeight && accumulated > 0)) {
      breaks.push(i);
      accumulated = cost;
    } else {
      accumulated += cost;
    }
  }
  if (breaks.length === 0) return null;
  const pageStarts = [start, ...breaks.slice(0, 3)];
  const pageEnds = [...breaks.slice(0, 3), end];
  let chars = 0;
  let count = 0;
  for (let k = 0; k < Math.min(3, pageStarts.length); k++) {
    let pageChars = 0;
    for (let j = pageStarts[k]!; j < pageEnds[k]! && j < blocks.length; j++) {
      const b = blocks[j]!;
      if (b.kind === 'text') pageChars += b.text.length;
    }
    if (pageChars > 0) {
      chars += pageChars;
      count++;
    }
  }
  return count > 0 ? Math.max(100, Math.round(chars / count)) : null;
}

interface UseEpubPaginationReturn {
  blocks: ContentBlock[] | null;
  visibleBlocks: ContentBlock[] | null;
  page: number;
  totalPages: number;
  hasMeasured: boolean;
  loadingTokens: boolean;
  tokenCache: Record<number, LemmatizedToken[]>;
  blockTranslations: Record<number, string>;
  isTranslating: boolean;
  prevPage: () => void;
  nextPage: () => void;
  goToPage: (page: number) => void;
  /** Jump straight to a global block index (search / links / restore). */
  goToBlock: (blockIndex: number) => void;
  /** Map a global block index to the page containing it (in-book search). */
  blockPage: (blockIndex: number) => number;
  handleMeasureBlock: (index: number, height: number, top?: number, origin?: number) => void;
  /** Called by PaginatedReader as blocks scroll near the viewport (SPEC-019 O2). */
  onVisibleBlocksChange: (globalIndices: number[]) => void;
  /** Report the real page-display viewport size from the reader ScrollView. */
  handleViewportLayout: (width: number, height: number) => void;
  contentWidth: number;
  /** Number of blocks currently rendered in the hidden measuring view. */
  measuredWindow: number;
  /** First global block index rendered in the hidden measuring view (lazy mode). */
  measureStart: number;
  /** Exclusive end index rendered in the hidden measuring view (lazy mode). */
  measureEnd: number;
  /** Bumped when the measuring window must remount (layout/translation changes). */
  measureNonce: number;
  /** Whether the current page has a previous / next page (lazy mode). */
  hasPrev: boolean;
  hasNext: boolean;
}

export function useEpubPagination({
  text, l1Code, l2Code, showTranslation, translationSplit = 0.6, resetKey,
  preParsedBlocks, initialAnchor, initialBlockIndex,
  onAnchorChange, onBlockChange, measureChunkSize, estimate = false,
}: UseEpubPaginationOptions): UseEpubPaginationReturn {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  const [blocks, setBlocks] = useState<ContentBlock[] | null>(null);
  /** SPEC-082 Task 5: global block indices that start a new EPUB spine item
   *  (hard page starts). Derived from the block metadata set in epub-book.ts. */
  const hardStarts = useMemo(() => {
    if (!blocks) return new Set<number>();
    const set = new Set<number>();
    blocks.forEach((b, i) => {
      if (i > 0 && (b as { startsNewSpine?: boolean }).startsNewSpine) set.add(i);
    });
    return set;
  }, [blocks]);
  const [measuredWindow, setMeasuredWindow] = useState(0);
  const [page, setPage] = useState(0);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [hasMeasured, setHasMeasured] = useState(false);
  const [measuredBlockCount, setMeasuredBlockCount] = useState(0);
  const [tokenCache, setTokenCache] = useState<Record<number, LemmatizedToken[]>>({});
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [blockTranslations, setBlockTranslations] = useState<Record<number, string>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  /** Global block indices currently near the reader viewport (lazy loading). */
  const [visibleIndices, setVisibleIndices] = useState<number[]>([]);
  const visibleIndicesKeyRef = useRef('');
  /** Real reader viewport (lazy mode; window dimensions are the fallback). */
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number } | null>(null);
  const contentWidth = viewportSize ? viewportSize.width - 32 : windowWidth - 32;
  const availableHeight = estimate
    ? Math.max(120, viewportSize ? viewportSize.height : windowHeight - 260)
    : windowHeight - 260;
  /** Lazy mode: current page boundaries in the global block stream. */
  const [lazyPageStart, setLazyPageStart] = useState<number | null>(null);
  const [lazyPageEnd, setLazyPageEnd] = useState<number | null>(null);
  const [totalPagesEstimate, setTotalPagesEstimate] = useState(0);
  const [measureStart, setMeasureStart] = useState(0);
  const [measureEnd, setMeasureEnd] = useState(0);
  const [measureNonce, setMeasureNonce] = useState(0);
  const [metricsVersion, setMetricsVersion] = useState(0);

  const blockHeightsRef = useRef<(number | null)[]>([]);
  const blockMetricsRef = useRef<(BlockMetrics | undefined)[]>([]);
  const totalCharsRef = useRef(0);
  const prefixCharsRef = useRef<number[]>([]);
  const charsPerPageRef = useRef(400);
  const charsPerPageLayoutRef = useRef<string | null>(null);
  const layoutKeyRef = useRef<string | null>(null);
  const requestRef = useRef<{ id: number; dir: 'forward' | 'backward'; base: number; pageNumber: number } | null>(null);
  const requestIdRef = useRef(0);
  const requestStartedAtRef = useRef(0);
  const measureOriginRef = useRef(0);
  const measureRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const lazySeekKeyRef = useRef<string | null>(null);
  const waitingMissingRef = useRef(-1);
  const prevShowTranslationRef = useRef(showTranslation);
  const tokenLoadGenRef = useRef(0);
  const translateGenRef = useRef(0);
  const translateDoneRef = useRef<Set<number>>(new Set());
  const translateAttemptsRef = useRef<Map<number, number>>(new Map());
  const translateInFlightRef = useRef(false);
  const pageTextKeyRef = useRef('');
  const translateRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateRetryDelayRef = useRef(1000);
  const [translateRetry, setTranslateRetry] = useState(0);
  const anchorSeenRef = useRef(false);
  const prevPageRef = useRef(0);

  /** Report visible blocks from PaginatedReader (deduped by index set). */
  const onVisibleBlocksChange = useCallback((indices: number[]) => {
    const key = indices.join(',');
    if (key === visibleIndicesKeyRef.current) return;
    visibleIndicesKeyRef.current = key;
    setVisibleIndices(indices);
  }, []);

  const visibleSet = useMemo(() => new Set(visibleIndices), [visibleIndices]);

  /** Real viewport from PaginatedReader's ScrollView (width/height of the
   *  actual page-display area — no guessing chrome/padding). */
  const handleViewportLayout = useCallback((width: number, height: number) => {
    paginationLog(`[Pagination] 📐 viewport reported ${width}x${height}`);
    setViewportSize(prev => {
      if (!prev || Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1) {
        paginationLog(`[Pagination] 📐 viewport changed ${prev?.width ?? '?'}x${prev?.height ?? '?'} → ${width}x${height}`);
        return { width, height };
      }
      return prev;
    });
  }, []);

  /** Start a lazy measurement pass from a global block boundary. */
  const startLazyMeasure = useCallback((
    dir: 'forward' | 'backward',
    base: number,
    pageNumber: number,
  ) => {
    if (!blocks || blocks.length === 0) return;
    const id = ++requestIdRef.current;
    requestRef.current = { id, dir, base, pageNumber };
    requestStartedAtRef.current = Date.now();
    const start = dir === 'forward' ? base : Math.max(0, base - WINDOW_LIMIT);
    const end = dir === 'forward' ? Math.min(blocks.length, base + WINDOW_LIMIT) : base;
    paginationLog(`[Pagination] ▶ start measure request #${id} dir=${dir} base=${base} page=${pageNumber} window=[${start},${end}) blocks=${blocks.length} t=${requestStartedAtRef.current}`);
    setHasMeasured(false);
    setPage(pageNumber - 1);
    if (dir === 'forward') {
      setMeasureStart(start);
      setMeasureEnd(end);
      measureOriginRef.current = base;
    } else {
      setMeasureStart(start);
      setMeasureEnd(end);
      measureOriginRef.current = start;
    }
  }, [blocks]);

  /** Estimated 1-based page number for a global block (lazy mode). */
  const lazyPageForBlock = useCallback((index: number) => {
    const before = prefixCharsRef.current[index] ?? 0;
    return Math.max(1, Math.floor(before / Math.max(1, charsPerPageRef.current)) + 1);
  }, []);

  // ── Reset all state when resetKey changes ──
  useEffect(() => {
    paginationLog(`[Pagination] 🔁 reset resetKey=${resetKey ?? 'null'}`);
    setBlocks(null);
    setPageBreaks([]);
    setHasMeasured(false);
    setMeasuredBlockCount(0);
    setLazyPageStart(null);
    setLazyPageEnd(null);
    setTotalPagesEstimate(0);
    setMeasureStart(0);
    setMeasureEnd(0);
    setMeasureNonce(0);
    setMetricsVersion(0);
    setTokenCache({});
    setBlockTranslations({});
    setVisibleIndices([]);
    visibleIndicesKeyRef.current = '';
    blockHeightsRef.current = [];
    blockMetricsRef.current = [];
    totalCharsRef.current = 0;
    prefixCharsRef.current = [];
    charsPerPageRef.current = 400;
    charsPerPageLayoutRef.current = null;
    layoutKeyRef.current = null;
    requestRef.current = null;
    requestIdRef.current += 1;
    requestStartedAtRef.current = 0;
    measureOriginRef.current = 0;
    waitingMissingRef.current = -1;
    lazySeekKeyRef.current = null;
    setPage(0);
    anchorSeenRef.current = false;
    prevPageRef.current = 0;
    setMeasuredWindow(measureChunkSize ?? Number.MAX_SAFE_INTEGER);
  }, [resetKey, measureChunkSize]);

  // ── Use pre-parsed whole-book blocks, or parse markdown when text changes ──
  useEffect(() => {
    if (preParsedBlocks) {
      paginationLog(`[Pagination] 📚 pre-parsed blocks=${preParsedBlocks.length}`);
      setBlocks(preParsedBlocks);
      return;
    }
    if (!text.trim()) { setBlocks(null); return; }
    try {
      const parsed = parseMarkdownBlocks(text);
      paginationLog(`[Pagination] 📚 parsed markdown blocks=${parsed.length}`);
      setBlocks(parsed);
    } catch {
      paginationWarn(`[Pagination] ⚠️ markdown parse failed — blocks=null`);
      setBlocks(null);
    }
  }, [text, preParsedBlocks]);

  // ── Lazy pagination (EPUB whole-book mode, web-style) ──
  // Build prefix chars once for estimated page numbers / go-to-page jumps.
  useEffect(() => {
    if (!estimate || !blocks) return;
    let total = 0;
    const prefix: number[] = new Array(blocks.length);
    for (let i = 0; i < blocks.length; i++) {
      prefix[i] = total;
      const b = blocks[i]!;
      if (b.kind === 'text') total += b.text.length;
    }
    totalCharsRef.current = total;
    prefixCharsRef.current = prefix;
    charsPerPageRef.current = 400;
    charsPerPageLayoutRef.current = null;
    setTotalPagesEstimate(Math.max(1, Math.ceil(total / 400)));
    paginationLog(`[Pagination] 📊 built prefix chars blocks=${blocks.length} totalChars=${total} initialTotalPages=${Math.max(1, Math.ceil(total / 400))}`);
  }, [estimate, blocks]);

  // Start the first lazy measurement at the requested location (or page 1).
  useEffect(() => {
    if (!estimate || !blocks || blocks.length === 0) return;
    const seekKey = `${blocks.length}:${initialBlockIndex ?? ''}:${initialAnchor ?? ''}`;
    if (lazySeekKeyRef.current === seekKey) return;
    lazySeekKeyRef.current = seekKey;

    let base = 0;
    if (initialBlockIndex != null && initialBlockIndex >= 0 && initialBlockIndex < blocks.length) {
      base = initialBlockIndex;
    } else if (initialAnchor) {
      const found = blocks.findIndex(
        (b): b is TextBlock =>
          b.kind === 'text'
          && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item' || b.type === 'heading')
          && b.text.includes(initialAnchor),
      );
      if (found >= 0) base = found;
    }
    paginationLog(`[Pagination] 🎯 initial seek initialBlockIndex=${initialBlockIndex ?? 'null'} initialAnchor=${initialAnchor ? JSON.stringify(initialAnchor.slice(0, 40)) : 'null'} → base=${base}`);
    startLazyMeasure('forward', base, lazyPageForBlock(base));
  }, [estimate, blocks, initialAnchor, initialBlockIndex, lazyPageForBlock, startLazyMeasure]);

  // ── Reset measurement state when text (chapter) changes ──
  useEffect(() => {
    paginationLog(`[Pagination] 🔁 text reset textLength=${text.length}`);
    setPageBreaks([]);
    setHasMeasured(false);
    setMeasuredBlockCount(0);
    setLazyPageStart(null);
    setLazyPageEnd(null);
    setTotalPagesEstimate(0);
    setMeasureStart(0);
    setMeasureEnd(0);
    setMeasureNonce(0);
    setMetricsVersion(0);
    setTokenCache({});
    setVisibleIndices([]);
    visibleIndicesKeyRef.current = '';
    blockHeightsRef.current = [];
    blockMetricsRef.current = [];
    totalCharsRef.current = 0;
    prefixCharsRef.current = [];
    charsPerPageRef.current = 400;
    charsPerPageLayoutRef.current = null;
    layoutKeyRef.current = null;
    requestRef.current = null;
    requestIdRef.current += 1;
    requestStartedAtRef.current = 0;
    measureOriginRef.current = 0;
    waitingMissingRef.current = -1;
    lazySeekKeyRef.current = null;
    setPage(0);
    setMeasuredWindow(measureChunkSize ?? Number.MAX_SAFE_INTEGER);
  }, [text, measureChunkSize]);

  // ── Advance the chunked measurement window as blocks report heights ──
  useEffect(() => {
    if (!measureChunkSize || !blocks) return;
    if (measuredWindow >= blocks.length) return;
    if (measuredBlockCount < measuredWindow) return;
    setMeasuredWindow((w) => Math.min(blocks.length, w + measureChunkSize));
  }, [measuredBlockCount, measuredWindow, measureChunkSize, blocks]);

  // ── Compute visible blocks for the current page ──
  const visibleBlocks = useMemo(() => {
    if (!blocks) return null;
    if (estimate) {
      if (lazyPageStart == null) return null;
      const end = lazyPageEnd ?? blocks.length;
      return blocks.slice(lazyPageStart, end);
    }
    if (pageBreaks.length === 0) return blocks;
    const start = page === 0 ? 0 : pageBreaks[page - 1]!;
    const end = page < pageBreaks.length ? pageBreaks[page]! : blocks.length;
    return blocks.slice(start, end);
  }, [blocks, pageBreaks, page, estimate, lazyPageStart, lazyPageEnd]);

  const totalPages = estimate ? Math.max(1, totalPagesEstimate) : Math.max(1, pageBreaks.length + 1);

  // ── Block height measurement ──
  const handleMeasureBlock = useCallback((index: number, height: number, top = 0, origin?: number) => {
    const prevMetric = blockMetricsRef.current[index];
    blockMetricsRef.current[index] = {
      height,
      top,
      origin: origin ?? (estimate ? measureOriginRef.current : 0),
    };
    if (estimate) {
      const changed = !prevMetric
        || Math.abs(prevMetric.height - height) > 1
        || Math.abs(prevMetric.top - top) > 1
        || prevMetric.origin !== (origin ?? measureOriginRef.current);
      if (changed && measureRafRef.current == null) {
        paginationLog(`[Pagination] 📏 scheduling metrics flush (rAF)`);
        measureRafRef.current = requestAnimationFrame(() => {
          measureRafRef.current = null;
          setMetricsVersion(v => {
            paginationLog(`[Pagination] 📏 metrics flush → version=${v + 1}`);
            return v + 1;
          });
        });
      }
      return;
    }
    const wasUnmeasured = blockHeightsRef.current[index] == null;
    blockHeightsRef.current[index] = height;
    if (wasUnmeasured) setMeasuredBlockCount(c => c + 1);
  }, [estimate]);

  // ── Lazy page computation: runs once the measuring window has real heights ──
  useEffect(() => {
    if (!estimate || !blocks || blocks.length === 0) return;
    const req = requestRef.current;
    if (!req || req.id !== requestIdRef.current) return;
    if (measureEnd <= measureStart) return;
    if (!allMeasured(blockMetricsRef.current, measureStart, measureEnd, measureOriginRef.current)) {
      let missing = 0;
      for (let i = measureStart; i < measureEnd; i++) {
        const m = blockMetricsRef.current[i];
        if (!m || m.origin !== measureOriginRef.current) missing++;
      }
      if (waitingMissingRef.current !== missing) {
        waitingMissingRef.current = missing;
        paginationLog(`[Pagination] ⏳ waiting for measurements: missing=${missing}/${measureEnd - measureStart} window=[${measureStart},${measureEnd}) origin=${measureOriginRef.current} elapsed=${Date.now() - requestStartedAtRef.current}ms`);
      }
      return;
    }
    waitingMissingRef.current = -1;
    if (totalCharsRef.current <= 0) {
      let total = 0;
      const prefix: number[] = new Array(blocks.length);
      for (let i = 0; i < blocks.length; i++) {
        prefix[i] = total;
        const b = blocks[i]!;
        if (b.kind === 'text') total += b.text.length;
      }
      totalCharsRef.current = total;
      prefixCharsRef.current = prefix;
      paginationLog(`[Pagination] 📊 fallback prefix rebuild totalChars=${total}`);
    }
    paginationLog(`[Pagination] ⚙ compute request #${req.id} dir=${req.dir} base=${req.base} targetPage=${req.pageNumber} window=[${measureStart},${measureEnd}) origin=${measureOriginRef.current} available=${availableHeight} width=${contentWidth} elapsed=${Date.now() - requestStartedAtRef.current}ms`);

    if (req.dir === 'forward') {
      const res = computeForwardEnd(
        blocks,
        req.base,
        measureEnd,
        availableHeight,
        blockMetricsRef.current,
        contentWidth,
        hardStarts,
      );
      if (res.needsMore) {
        paginationLog(`[Pagination] ⚙ forward needsMore endIndex=${res.endIndex} — extending window`);
        const nextEnd = Math.min(blocks.length, measureEnd + WINDOW_LIMIT);
        if (nextEnd > measureEnd) {
          setMeasureEnd(nextEnd);
          return;
        }
      }
      const endIndex = res.endIndex;
      const end = endIndex < blocks.length ? endIndex : null;
      paginationLog(`[Pagination] ⚙ forward break → page=[${req.base},${end ?? 'END'}) pageBlocks=${end == null ? blocks.length - req.base : end - req.base}`);
      // Must match the layout-change effect's key below (incl. the committed
      // split) or every applied page looks like a layout change and triggers
      // an endless remeasure loop (spinner ↔ content flash). SPEC-082 Task 3.
      const layoutKey = `${contentWidth}:${availableHeight}:${showTranslation ? 1 : 0}:${translationSplit}`;
      if (charsPerPageLayoutRef.current !== layoutKey) {
        charsPerPageLayoutRef.current = layoutKey;
        const sampled = sampleCharsPerPage(
          blocks,
          req.base,
          measureEnd,
          availableHeight,
          blockMetricsRef.current,
          contentWidth,
          hardStarts,
        );
        if (sampled) {
          charsPerPageRef.current = sampled;
          paginationLog(`[Pagination] 📄 charsPerPage sample=${sampled} totalPages=${Math.max(1, Math.ceil(totalCharsRef.current / sampled))}`);
        } else {
          paginationLog(`[Pagination] 📄 charsPerPage sample skipped (no break in window)`);
        }
      }
      if (totalCharsRef.current > 0) {
        const nextTotal = Math.max(1, Math.ceil(totalCharsRef.current / Math.max(1, charsPerPageRef.current)));
        setTotalPagesEstimate(nextTotal);
        paginationLog(`[Pagination] ✅ page applied page=${req.pageNumber - 1} start=${req.base} end=${end ?? 'END'} totalPages=${nextTotal} totalChars=${totalCharsRef.current} elapsed=${Date.now() - requestStartedAtRef.current}ms`);
      } else {
        paginationLog(`[Pagination] ✅ page applied page=${req.pageNumber - 1} start=${req.base} end=${end ?? 'END'} totalPages=${totalPagesEstimate} totalChars=${totalCharsRef.current} elapsed=${Date.now() - requestStartedAtRef.current}ms`);
      }
      layoutKeyRef.current = layoutKey;
      setLazyPageStart(req.base);
      setLazyPageEnd(end);
      setPage(req.pageNumber - 1);
      setHasMeasured(true);
      requestRef.current = null;
      return;
    }

    const res = computeBackwardStart(
      blocks,
      measureStart,
      req.base,
      availableHeight,
      blockMetricsRef.current,
      contentWidth,
      hardStarts,
    );
    if (res.needsMore) {
      paginationLog(`[Pagination] ⚙ backward needsMore prevStart=${res.startIndex} — extending window`);
      const nextStart = Math.max(0, measureStart - WINDOW_LIMIT);
      if (nextStart < measureStart) {
        measureOriginRef.current = nextStart;
        setMeasureStart(nextStart);
        return;
      }
    }
    paginationLog(`[Pagination] ⚙ backward break → page=[${res.startIndex},${req.base}) pageBlocks=${req.base - res.startIndex}`);
    paginationLog(`[Pagination] ✅ page applied page=${req.pageNumber - 1} start=${res.startIndex} end=${req.base} elapsed=${Date.now() - requestStartedAtRef.current}ms`);
    setLazyPageStart(res.startIndex);
    setLazyPageEnd(req.base);
    setPage(req.pageNumber - 1);
    setHasMeasured(true);
    requestRef.current = null;
  }, [
    estimate, blocks, measureStart, measureEnd, metricsVersion,
    availableHeight, contentWidth, showTranslation, hardStarts,
  ]);

  // ── Compute page breaks when all blocks have been measured ──
  useEffect(() => {
    if (estimate || !blocks || blocks.length === 0) return;
    const heights = blockHeightsRef.current;
    if (heights.length < blocks.length || heights.some(h => h == null)) return;

    const breaks: number[] = [];
    let accumulated = 0;

    for (let i = 0; i < blocks.length; i++) {
      const m = blockMetricsRef.current[i]!;
      const gap = i > 0 ? gapBetween(blockMetricsRef.current, i) : 0;
      const h = m.height + gap;
      // SPEC-082 Task 5: a hard page start (new EPUB spine item) begins a new
      // page even if it would fit on the current one.
      if ((hardStarts.has(i) && accumulated > 0) || (accumulated + h > availableHeight && accumulated > 0)) {
        breaks.push(i);
        accumulated = h;
      } else {
        accumulated += h;
      }
    }

    setPageBreaks(breaks);
    setPage(0);
    setHasMeasured(true);
  }, [blocks, availableHeight, measuredBlockCount, estimate, hardStarts]);

  // ── Lazy mode: re-measure when the real viewport / translation layout changes ──
  useEffect(() => {
    if (!estimate || !blocks || !hasMeasured || lazyPageStart == null) return;
    const key = `${contentWidth}:${availableHeight}:${showTranslation ? 1 : 0}:${translationSplit}`;
    if (layoutKeyRef.current === key) return;
    paginationLog(`[Pagination] 🔄 layout changed ${layoutKeyRef.current ?? 'none'} → ${key} — remeasuring from block ${lazyPageStart}`);
    layoutKeyRef.current = key;
    blockMetricsRef.current = [];
    setMeasureNonce(n => n + 1);
    setMetricsVersion(v => v + 1);
    startLazyMeasure('forward', lazyPageStart, page + 1);
  }, [
    estimate, blocks, hasMeasured, lazyPageStart, page,
    contentWidth, availableHeight, showTranslation, translationSplit, startLazyMeasure,
  ]);

  // ── Non-lazy readers: invalidate measurements when translation is toggled
  // or the committed side-by-side split changes (SPEC-082 Task 3) ──
  useEffect(() => {
    if (estimate || !blocks) return;
    const key = `${showTranslation ? 1 : 0}:${translationSplit}`;
    if (layoutKeyRef.current === key) return;
    layoutKeyRef.current = key;
    if (prevShowTranslationRef.current !== showTranslation) {
      prevShowTranslationRef.current = showTranslation;
    }
    setHasMeasured(false);
    setMeasuredBlockCount(0);
    setPageBreaks([]);
    blockHeightsRef.current = [];
    blockMetricsRef.current = [];
  }, [estimate, blocks, showTranslation, translationSplit]);

  // Cancel a pending measurement rAF on unmount.
  useEffect(() => {
    return () => {
      if (measureRafRef.current != null) cancelAnimationFrame(measureRafRef.current);
    };
  }, []);

  // ── Seek to initialAnchor / initialBlockIndex after measurement completes ──
  useEffect(() => {
    if (estimate) return;
    if ((!initialAnchor && initialBlockIndex == null) || !blocks || !hasMeasured) return;
    if (anchorSeenRef.current) return;
    anchorSeenRef.current = true;
    if (pageBreaks.length === 0) return;
    for (let p = 0; p <= pageBreaks.length; p++) {
      const start = p === 0 ? 0 : pageBreaks[p - 1]!;
      const end = p < pageBreaks.length ? pageBreaks[p]! : blocks.length;
      const pageBlocks = blocks.slice(start, end);
      if (initialBlockIndex != null && initialBlockIndex >= start && initialBlockIndex < end) {
        setPage(p); break;
      }
      const hasAnchor = pageBlocks.some((b): b is TextBlock =>
        initialAnchor != null && b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item' || b.type === 'heading') && b.text.includes(initialAnchor),
      );
      if (hasAnchor) { setPage(p); break; }
    }
  }, [initialAnchor, initialBlockIndex, blocks, hasMeasured, pageBreaks]);

  // ── Batch lemmatize visible text blocks (per-page) ──
  useEffect(() => {
    if (!hasMeasured || !blocks || !visibleBlocks) return;
    const textBlocks = visibleBlocks.filter(
      (b): b is TextBlock => b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item' || b.type === 'heading'),
    );
    if (textBlocks.length === 0) return;

    const missing: { idx: number; text: string }[] = [];
    for (const tb of textBlocks) {
      const globalIdx = blocks.indexOf(tb);
      // Visibility-based lazy loading: only tokenize blocks near the viewport;
      // the rest are tokenized as the user scrolls (SPEC-019 O2).
      if (!visibleSet.has(globalIdx)) continue;
      if (!(globalIdx in tokenCache)) missing.push({ idx: globalIdx, text: tb.text });
    }
    if (missing.length === 0) return;

    const gen = ++tokenLoadGenRef.current;
    setLoadingTokens(true);
    const batchStart = Date.now();
    log(`[lemmatize] 📦 BATCH REQ l2=${l2Code} blocks=${missing.length}`);

    // Offline Mode: skip the batch endpoint entirely — lemmatizeText() has
    // the same fast path and goes straight to the local fallback chain.
    if (isOfflineModeEnabled()) {
      log(`[lemmatize] 📦 OFFLINE-MODE l2=${l2Code} → local per-block lemmatizeText()`);
      void (async () => {
        if (tokenLoadGenRef.current !== gen) return;
        const { lemmatizeText } = await import('@/lib/tokenizer');
        const results = await Promise.all(
          missing.map(m => lemmatizeText(m.text, l2Code)),
        );
        if (tokenLoadGenRef.current !== gen) return;
        setTokenCache(prev => {
          const next = { ...prev };
          missing.forEach((m, i) => { if (results[i]) next[m.idx] = results[i]!; });
          return next;
        });
        setLoadingTokens(false);
      })();
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: missing.map(m => m.text), l2: l2Code }),
      signal: controller.signal,
    })
      .then(res => res.json())
      .then(data => {
        if (tokenLoadGenRef.current !== gen) return;
        const results: LemmatizedToken[][] = data?.results ?? [];
        const withLemmas = results.filter(r => r?.some(t => t.lemmas.length > 0)).length;
        log(`[lemmatize] 📦 BATCH OK l2=${l2Code} results=${results.length} withLemmas=${withLemmas} elapsed=${Date.now() - batchStart}ms`);
        // Tag server tokens with source so the debug metadata is consistent
        // with the single-line lemmatizeFromServer() path (SPEC-018).
        const tagged = results.map(r => r.map(t => ({ ...t, source: 'server' as const })));
        setTokenCache(prev => {
          const next = { ...prev };
          missing.forEach((m, i) => { if (tagged[i]) next[m.idx] = tagged[i]!; });
          return next;
        });
      })
      .catch(async (e: any) => {
        // Offline fallback: lemmatizeText() has server-first-then-local chain.
        // lemmatizeInflight dedup handles concurrent calls for identical text.
        log(`[lemmatize] 📦 BATCH FAIL l2=${l2Code} → falling back to per-block lemmatizeText() elapsed=${Date.now() - batchStart}ms`, e?.message ?? e);
        if (tokenLoadGenRef.current !== gen) return;
        const { lemmatizeText } = await import('@/lib/tokenizer');
        const results = await Promise.all(
          missing.map(m => lemmatizeText(m.text, l2Code)),
        );
        if (tokenLoadGenRef.current !== gen) return;
        setTokenCache(prev => {
          const next = { ...prev };
          missing.forEach((m, i) => { if (results[i]) next[m.idx] = results[i]!; });
          return next;
        });
      })
      .finally(() => {
        clearTimeout(timeout);
        if (tokenLoadGenRef.current === gen) setLoadingTokens(false);
      });
  }, [hasMeasured, page, blocks, pageBreaks, visibleBlocks, tokenCache, l2Code, visibleSet]);

  // ── Auto-translate visible text blocks (per-page) when showTranslation is on ──
  // Fetches in small chunks and only counts non-empty results as done. The
  // server fills LLM-truncated numbered lines with "", so accepting those
  // would permanently skip every paragraph after the cutoff. Missing/failed
  // lines are retried with backoff; each retry is a different numbered subset,
  // so it misses the truncated server-cache entry and gets a fresh translation.
  useEffect(() => {
    if (!showTranslation || !hasMeasured || !blocks || !visibleBlocks) return;
    if (loadingTokens) return;
    const textBlocks = visibleBlocks.filter(
      (b): b is TextBlock => b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item' || b.type === 'heading'),
    );
    if (textBlocks.length === 0) return;

    // Local indices repeat on every page, so reset per-page progress whenever
    // the page's text-block set changes (navigation, seek, chapter change).
    const pageKey = textBlocks.map((b) => blocks.indexOf(b)).join(',');
    if (pageTextKeyRef.current !== pageKey) {
      translationLogger.log(`page=${pageKey} textBlocks=${textBlocks.length} — decision: reset per-page translation state`);
      pageTextKeyRef.current = pageKey;
      translateGenRef.current++;
      translateInFlightRef.current = false;
      translateDoneRef.current = new Set();
      translateAttemptsRef.current = new Map();
      translateRetryDelayRef.current = 1000;
      if (translateRetryTimerRef.current) {
        clearTimeout(translateRetryTimerRef.current);
        translateRetryTimerRef.current = null;
      }
      setBlockTranslations({});
    }

    const pending: { localIdx: number; globalIdx: number; text: string }[] = [];
    for (let i = 0; i < textBlocks.length; i++) {
      if (translateDoneRef.current.has(i)) continue;
      pending.push({ localIdx: i, globalIdx: blocks.indexOf(textBlocks[i]), text: textBlocks[i].text });
    }
    if (pending.length === 0 || translateInFlightRef.current) return;

    const chunk = pending.slice(0, TRANSLATE_CHUNK_SIZE);
    const gen = ++translateGenRef.current;
    translateInFlightRef.current = true;
    setIsTranslating(true);
    const queuedAt = Date.now();
    let madeProgress = false;
    translationLogger.log(
      `request chunk=${chunk.length} pending=${pending.length} local=[${chunk.map(p => p.localIdx).join(',')}] global=[${chunk.map(p => p.globalIdx).join(',')}] l1=${l1Code} l2=${l2Code} t=${queuedAt}`,
    );
    const fetchStart = Date.now();

    fetch(`${PYTHON_API_URL}/translate_array`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: chunk.map(p => p.text), l1: l1Code, l2: l2Code }),
    })
      .then(async res => {
        if (!res.ok) throw new Error(`translate_array HTTP ${res.status}`);
        return res.json() as Promise<{ translated_texts?: unknown }>;
      })
      .then(data => {
        if (translateGenRef.current !== gen) return;
        const receivedAt = Date.now();
        const translated = Array.isArray(data?.translated_texts) ? data.translated_texts : [];
        const additions: Record<number, string> = {};
        const missing: { localIdx: number; globalIdx: number; text: string }[] = [];
        const suspected: { localIdx: number; globalIdx: number; text: string; attempts?: number; acceptedAfter?: number }[] = [];
        chunk.forEach((p, i) => {
          const tr = typeof translated[i] === 'string' ? translated[i] : '';
          if (tr.trim().length === 0) {
            missing.push(p);
            translationLogger.log(`reject block=${p.globalIdx} local=${p.localIdx} reason=empty_response`);
            return;
          }
          if (isSuspectedTruncated(p.text, tr)) {
            const attempts = (translateAttemptsRef.current.get(p.localIdx) ?? 0) + 1;
            translateAttemptsRef.current.set(p.localIdx, attempts);
            translationLogger.log(
              `suspect block=${p.globalIdx} local=${p.localIdx} attempt=${attempts} srcChars=${p.text.length} trChars=${tr.length} reason=short_or_no_terminal_punct`,
            );
            if (attempts >= MAX_TRUNCATED_ATTEMPTS) {
              // Don't loop forever — accept the best effort after the cap.
              additions[p.localIdx] = tr;
              translateDoneRef.current.add(p.localIdx);
              suspected.push({ ...p, acceptedAfter: attempts });
              const srcLines = Math.max(1, Math.ceil(p.text.length / 50));
              const trLines = Math.max(1, Math.ceil(tr.length / 50));
              translationLogger.log(
                `accept block=${p.globalIdx} local=${p.localIdx} reason=accepted_after_${attempts}_attempts srcChars=${p.text.length} trChars=${tr.length} srcLines≈${srcLines} trLines≈${trLines}${trLines > srcLines ? ' ⚠️ taller-than-skeleton' : ''}`,
              );
            } else {
              suspected.push({ ...p, attempts });
            }
            return;
          }
          additions[p.localIdx] = tr;
          translateDoneRef.current.add(p.localIdx);
          const srcLines = Math.max(1, Math.ceil(p.text.length / 50));
          const trLines = Math.max(1, Math.ceil(tr.length / 50));
          translationLogger.log(
            `accept block=${p.globalIdx} local=${p.localIdx} reason=ok srcChars=${p.text.length} trChars=${tr.length} srcLines≈${srcLines} trLines≈${trLines}${trLines > srcLines ? ' ⚠️ taller-than-skeleton' : ''}`,
          );
        });
        madeProgress = Object.keys(additions).length > 0;
        if (madeProgress) {
          setBlockTranslations(prev => ({ ...prev, ...additions }));
        }
        const processedAt = Date.now();
        translationLogger.log(
          `response fetch=${receivedAt - fetchStart}ms process=${processedAt - receivedAt}ms total=${processedAt - queuedAt}ms got=${translated.length} added=${Object.keys(additions).length} done=${translateDoneRef.current.size}/${textBlocks.length}`
          + (missing.length > 0
            ? ` missing=[${missing.map(p => `${p.localIdx}:${p.globalIdx}`).join(',')}] texts=[${missing.map(p => JSON.stringify(p.text.slice(0, 40))).join(', ')}]`
            : '')
          + (suspected.length > 0
            ? ` suspectedTruncated=[${suspected.map(p => `${p.localIdx}:${p.globalIdx}${p.acceptedAfter ? `(acceptedAfter${p.acceptedAfter})` : `(attempt${p.attempts})`}`).join(',')}] texts=[${suspected.map(p => JSON.stringify(p.text.slice(0, 40))).join(', ')}]`
            : ''),
        );
      })
      .catch((e: any) => {
        translationLogger.logwarn(`request failed fetch=${Date.now() - fetchStart}ms total=${Date.now() - queuedAt}ms local=[${chunk.map(p => p.localIdx).join(',')}] global=[${chunk.map(p => p.globalIdx).join(',')}]:`, e?.message ?? e);
      })
      .finally(() => {
        if (translateGenRef.current !== gen) return;
        translateInFlightRef.current = false;
        // Keep going until every visible paragraph has a non-empty translation.
        // Back off only when a pass made no progress (failed / all-empty).
        if (translateDoneRef.current.size < textBlocks.length) {
          const delay = madeProgress ? 1000 : translateRetryDelayRef.current;
          if (!madeProgress) {
            translateRetryDelayRef.current = Math.min(15000, delay * 2);
          }
          translationLogger.log(
            `retry scheduled in=${delay}ms pending=${textBlocks.length - translateDoneRef.current.size}`
            + ` blocks=[${pending.map(p => `${p.localIdx}:${p.globalIdx}`).join(',')}]`,
          );
          if (translateRetryTimerRef.current) clearTimeout(translateRetryTimerRef.current);
          translateRetryTimerRef.current = setTimeout(() => {
            translateRetryTimerRef.current = null;
            setTranslateRetry(c => c + 1);
          }, delay);
          // Stay in the "translating" state during the backoff gap so the
          // skeleton bars don't flicker between chunks.
          setIsTranslating(true);
        } else {
          setIsTranslating(false);
          translationLogger.log(`complete — all ${textBlocks.length} visible paragraphs translated`);
        }
      });
  }, [visibleBlocks, hasMeasured, showTranslation, loadingTokens, blocks, l1Code, l2Code, translateRetry]);

  // Clear the retry timer if the hook unmounts.
  useEffect(() => {
    return () => {
      if (translateRetryTimerRef.current) clearTimeout(translateRetryTimerRef.current);
    };
  }, []);

  // ── Page navigation ──
  const prevPage = useCallback(() => {
    if (estimate) {
      if (!blocks || lazyPageStart == null || lazyPageStart <= 0) return;
      paginationLog(`[Pagination] ◀ prevPage currentPage=${page} start=${lazyPageStart} end=${lazyPageEnd ?? 'END'} t=${Date.now()} → measure backward`);
      startLazyMeasure('backward', lazyPageStart, page);
      setBlockTranslations({});
      return;
    }
    if (page <= 0) return;
    setPage(p => p - 1);
    setBlockTranslations({});
  }, [estimate, blocks, lazyPageStart, page, startLazyMeasure]);

  const nextPage = useCallback(() => {
    if (estimate) {
      if (!blocks || lazyPageEnd == null || lazyPageEnd >= blocks.length) return;
      paginationLog(`[Pagination] ▶ nextPage currentPage=${page} start=${lazyPageStart} end=${lazyPageEnd} t=${Date.now()} → measure forward`);
      startLazyMeasure('forward', lazyPageEnd, page + 2);
      setBlockTranslations({});
      return;
    }
    if (page >= totalPages - 1) return;
    setPage(p => p + 1);
    setBlockTranslations({});
  }, [estimate, blocks, lazyPageEnd, page, totalPages, startLazyMeasure]);

  const goToPage = useCallback((target: number) => {
    if (estimate) {
      if (!blocks) return;
      const clamped = Math.max(0, Math.min(target, Math.max(0, totalPages - 1)));
      if (clamped === page) return;
      const targetChars = Math.min(
        totalCharsRef.current,
        clamped * Math.max(1, charsPerPageRef.current),
      );
      let lo = 0;
      let hi = blocks.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((prefixCharsRef.current[mid] ?? 0) > targetChars) hi = mid;
        else lo = mid + 1;
      }
      const base = Math.max(0, lo - 1);
      paginationLog(`[Pagination] 🔢 goToPage target=${clamped} chars=${targetChars} → block ${base} t=${Date.now()}`);
      startLazyMeasure('forward', base, clamped + 1);
      setBlockTranslations({});
      return;
    }
    const clamped = Math.max(0, Math.min(target, totalPages - 1));
    if (clamped === page) return;
    setPage(clamped);
    setBlockTranslations({});
  }, [estimate, blocks, page, totalPages, startLazyMeasure]);

  // ── Map a global block index to the page that contains it (in-book search) ──
  const blockPage = useCallback((blockIndex: number): number => {
    if (estimate) {
      if (!blocks) return 0;
      if (lazyPageStart != null && blockIndex >= lazyPageStart
        && (lazyPageEnd == null || blockIndex < lazyPageEnd)) {
        return page;
      }
      return lazyPageForBlock(blockIndex) - 1;
    }
    if (pageBreaks.length === 0 || !blocks) return 0;
    for (let p = 0; p <= pageBreaks.length; p++) {
      const start = p === 0 ? 0 : pageBreaks[p - 1]!;
      const end = p < pageBreaks.length ? pageBreaks[p]! : blocks.length;
      if (blockIndex >= start && blockIndex < end) return p;
    }
    return 0;
  }, [estimate, blocks, lazyPageStart, lazyPageEnd, lazyPageForBlock, page, pageBreaks]);

  /** Jump directly to a global block — used by search/TOC/link navigation. */
  const goToBlock = useCallback((blockIndex: number) => {
    if (!blocks || blockIndex < 0 || blockIndex >= blocks.length) return;
    setBlockTranslations({});
    if (estimate) {
      paginationLog(`[Pagination] 🎯 goToBlock block=${blockIndex} estimatedPage=${lazyPageForBlock(blockIndex)} t=${Date.now()}`);
      startLazyMeasure('forward', blockIndex, lazyPageForBlock(blockIndex));
      return;
    }
    const targetPage = blockPage(blockIndex);
    if (targetPage !== page) setPage(targetPage);
  }, [blocks, estimate, lazyPageForBlock, startLazyMeasure, blockPage, page]);

  // ── Report anchor / block index on page change (matches web ReaderPanel) ──
  useEffect(() => {
    if (prevPageRef.current === page || (!onAnchorChange && !onBlockChange)) return;
    prevPageRef.current = page;
    const first = visibleBlocks?.find(
      (b): b is TextBlock => b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item' || b.type === 'heading'),
    );
    if (!first) return;
    onAnchorChange?.(first.text.slice(0, 40));
    const globalIdx = blocks?.indexOf(first) ?? -1;
    if (globalIdx >= 0) onBlockChange?.(globalIdx);
  }, [page, visibleBlocks, onAnchorChange, onBlockChange, blocks]);

  return {
    blocks, visibleBlocks, page, totalPages, hasMeasured,
    loadingTokens, tokenCache, blockTranslations, isTranslating,
    prevPage, nextPage, goToPage, goToBlock, blockPage, handleMeasureBlock,
    onVisibleBlocksChange, handleViewportLayout, contentWidth,
    measuredWindow, measureStart, measureEnd, measureNonce,
    hasPrev: estimate
      ? (lazyPageStart != null && lazyPageStart > 0)
      : page > 0,
    hasNext: estimate
      ? (lazyPageEnd != null && blocks != null && lazyPageEnd < blocks.length)
      : page < totalPages - 1,
  };
}
