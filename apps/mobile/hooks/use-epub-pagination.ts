import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { parseMarkdownBlocks } from '@/lib/parse-markdown';
import type { ContentBlock, TextBlock } from '@/lib/parse-markdown';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { LemmatizedToken } from '@langplayer/shared';
import { log } from '@/lib/logger';

interface UseEpubPaginationOptions {
  text: string;
  l1Code: string;
  l2Code: string;
  showTranslation: boolean;
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
  /** When true, estimate page breaks from text length instead of measuring
   *  hidden views — much faster and non-blocking for large EPUBs. */
  estimate?: boolean;
}

/** Rough block height estimate used for non-blocking EPUB pagination. */
function estimateBlockHeight(block: ContentBlock, contentWidth: number): number {
  if (block.kind === 'image') return contentWidth * 0.6 + 24;
  if (block.kind === 'table') return (block.rows.length + 1) * 32 + 16 + 12;
  const charsPerLine = Math.max(20, Math.floor(contentWidth / 8));
  const lines = Math.max(1, Math.ceil(block.text.length / charsPerLine));
  return lines * 24 + 12;
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
  /** Map a global block index to the page containing it (in-book search). */
  blockPage: (blockIndex: number) => number;
  handleMeasureBlock: (index: number, height: number) => void;
  contentWidth: number;
  /** Number of blocks currently rendered in the hidden measuring view. */
  measuredWindow: number;
}

export function useEpubPagination({
  text, l1Code, l2Code, showTranslation, resetKey,
  preParsedBlocks, initialAnchor, initialBlockIndex,
  onAnchorChange, onBlockChange, measureChunkSize, estimate = false,
}: UseEpubPaginationOptions): UseEpubPaginationReturn {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const contentWidth = windowWidth - 32;

  const [blocks, setBlocks] = useState<ContentBlock[] | null>(null);
  const [measuredWindow, setMeasuredWindow] = useState(0);
  const [page, setPage] = useState(0);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [hasMeasured, setHasMeasured] = useState(false);
  const [measuredBlockCount, setMeasuredBlockCount] = useState(0);
  const [tokenCache, setTokenCache] = useState<Record<number, LemmatizedToken[]>>({});
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [blockTranslations, setBlockTranslations] = useState<Record<number, string>>({});
  const [isTranslating, setIsTranslating] = useState(false);

  const blockHeightsRef = useRef<(number | null)[]>([]);
  const tokenLoadGenRef = useRef(0);
  const translateGenRef = useRef(0);
  const anchorSeenRef = useRef(false);
  const prevPageRef = useRef(0);

  // ── Reset all state when resetKey changes ──
  useEffect(() => {
    setBlocks(null);
    setPageBreaks([]);
    setHasMeasured(false);
    setMeasuredBlockCount(0);
    setTokenCache({});
    setBlockTranslations({});
    blockHeightsRef.current = [];
    setPage(0);
    anchorSeenRef.current = false;
    prevPageRef.current = 0;
    setMeasuredWindow(measureChunkSize ?? Number.MAX_SAFE_INTEGER);
  }, [resetKey, measureChunkSize]);

  // ── Use pre-parsed whole-book blocks, or parse markdown when text changes ──
  useEffect(() => {
    if (preParsedBlocks) { setBlocks(preParsedBlocks); return; }
    if (!text.trim()) { setBlocks(null); return; }
    try { setBlocks(parseMarkdownBlocks(text)); } catch { setBlocks(null); }
  }, [text, preParsedBlocks]);

  // ── Estimated pagination (EPUB whole-book mode) ──
  // Avoids rendering every block in a hidden measuring view, which can freeze
  // the app on large books. Page breaks are approximate but instant.
  useEffect(() => {
    if (!estimate || !blocks || blocks.length === 0) return;
    const availableHeight = windowHeight - 260;
    const breaks: number[] = [];
    let accumulated = 0;
    for (let i = 0; i < blocks.length; i++) {
      const h = estimateBlockHeight(blocks[i]!, contentWidth);
      if (accumulated + h > availableHeight && accumulated > 0) {
        breaks.push(i);
        accumulated = h;
      } else {
        accumulated += h;
      }
    }
    setPageBreaks(breaks);
    setPage(0);
    setHasMeasured(true);
    setMeasuredWindow(blocks.length);
  }, [estimate, blocks, windowHeight, contentWidth]);

  // ── Reset measurement state when text (chapter) changes ──
  useEffect(() => {
    setPageBreaks([]);
    setHasMeasured(false);
    setMeasuredBlockCount(0);
    setTokenCache({});
    blockHeightsRef.current = [];
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
    if (pageBreaks.length === 0) return blocks;
    const start = page === 0 ? 0 : pageBreaks[page - 1]!;
    const end = page < pageBreaks.length ? pageBreaks[page]! : blocks.length;
    return blocks.slice(start, end);
  }, [blocks, pageBreaks, page]);

  const totalPages = Math.max(1, pageBreaks.length + 1);

  // ── Block height measurement ──
  const handleMeasureBlock = useCallback((index: number, height: number) => {
    const wasUnmeasured = blockHeightsRef.current[index] == null;
    blockHeightsRef.current[index] = height;
    if (wasUnmeasured) setMeasuredBlockCount(c => c + 1);
  }, []);

  // ── Compute page breaks when all blocks have been measured ──
  useEffect(() => {
    if (!blocks || blocks.length === 0) return;
    const heights = blockHeightsRef.current;
    if (heights.length < blocks.length || heights.some(h => h == null)) return;

    const availableHeight = windowHeight - 260;
    const breaks: number[] = [];
    let accumulated = 0;

    for (let i = 0; i < blocks.length; i++) {
      const h = heights[i]!;
      if (accumulated + h > availableHeight && accumulated > 0) {
        breaks.push(i);
        accumulated = h;
      } else {
        accumulated += h;
      }
    }

    setPageBreaks(breaks);
    setPage(0);
    setHasMeasured(true);
  }, [blocks, windowHeight, measuredBlockCount]);

  // ── Seek to initialAnchor / initialBlockIndex after measurement completes ──
  useEffect(() => {
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
        initialAnchor != null && b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item') && b.text.includes(initialAnchor),
      );
      if (hasAnchor) { setPage(p); break; }
    }
  }, [initialAnchor, initialBlockIndex, blocks, hasMeasured, pageBreaks]);

  // ── Batch lemmatize visible text blocks (per-page) ──
  useEffect(() => {
    if (!hasMeasured || !blocks || !visibleBlocks) return;
    const textBlocks = visibleBlocks.filter(
      (b): b is TextBlock => b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item'),
    );
    if (textBlocks.length === 0) return;

    const missing: { idx: number; text: string }[] = [];
    for (const tb of textBlocks) {
      const globalIdx = blocks.indexOf(tb);
      if (!(globalIdx in tokenCache)) missing.push({ idx: globalIdx, text: tb.text });
    }
    if (missing.length === 0) return;

    const gen = ++tokenLoadGenRef.current;
    setLoadingTokens(true);
    log(`[lemmatize] 📦 BATCH REQ l2=${l2Code} blocks=${missing.length}`);
    fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: missing.map(m => m.text), l2: l2Code }),
    })
      .then(res => res.json())
      .then(data => {
        if (tokenLoadGenRef.current !== gen) return;
        const results: LemmatizedToken[][] = data?.results ?? [];
        const withLemmas = results.filter(r => r?.some(t => t.lemmas.length > 0)).length;
        log(`[lemmatize] 📦 BATCH OK l2=${l2Code} results=${results.length} withLemmas=${withLemmas}`);
        setTokenCache(prev => {
          const next = { ...prev };
          missing.forEach((m, i) => { if (results[i]) next[m.idx] = results[i]!; });
          return next;
        });
      })
      .catch(async (e: any) => {
        // Offline fallback: lemmatizeText() has server-first-then-local chain.
        // lemmatizeInflight dedup handles concurrent calls for identical text.
        log(`[lemmatize] 📦 BATCH FAIL l2=${l2Code} → falling back to per-block lemmatizeText()`, e?.message ?? e);
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
      .finally(() => { if (tokenLoadGenRef.current === gen) setLoadingTokens(false); });
  }, [hasMeasured, page, blocks, pageBreaks, visibleBlocks, tokenCache, l2Code]);

  // ── Auto-translate visible text blocks (per-page) when showTranslation is on ──
  useEffect(() => {
    if (!showTranslation || !hasMeasured || !blocks || !visibleBlocks) return;
    if (Object.keys(blockTranslations).length > 0) return;
    if (loadingTokens) return;
    const textBlocks = visibleBlocks.filter(
      (b): b is TextBlock => b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item'),
    );
    if (textBlocks.length === 0) return;
    const gen = ++translateGenRef.current;
    setIsTranslating(true);
    fetch(`${PYTHON_API_URL}/translate_array`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: textBlocks.map(b => b.text), l1: l1Code, l2: l2Code }),
    })
      .then(res => res.json())
      .then(data => {
        if (translateGenRef.current !== gen) return;
        const translated = data?.translated_texts ?? [];
        if (translated.length > 0) {
          const map: Record<number, string> = {};
          textBlocks.forEach((_, i) => { if (i < translated.length) map[i] = translated[i]!; });
          setBlockTranslations(map);
        }
      })
      .catch(() => {})
      .finally(() => { if (translateGenRef.current === gen) setIsTranslating(false); });
  }, [visibleBlocks, hasMeasured, showTranslation, loadingTokens, blocks]);

  // ── Page navigation ──
  const prevPage = useCallback(() => {
    if (page <= 0) return;
    setPage(p => p - 1);
    setBlockTranslations({});
  }, [page]);

  const nextPage = useCallback(() => {
    if (page >= totalPages - 1) return;
    setPage(p => p + 1);
    setBlockTranslations({});
  }, [page, totalPages]);

  const goToPage = useCallback((target: number) => {
    const clamped = Math.max(0, Math.min(target, totalPages - 1));
    if (clamped === page) return;
    setPage(clamped);
    setBlockTranslations({});
  }, [page, totalPages]);

  // ── Map a global block index to the page that contains it (in-book search) ──
  const blockPage = useCallback((blockIndex: number): number => {
    if (pageBreaks.length === 0 || !blocks) return 0;
    for (let p = 0; p <= pageBreaks.length; p++) {
      const start = p === 0 ? 0 : pageBreaks[p - 1]!;
      const end = p < pageBreaks.length ? pageBreaks[p]! : blocks.length;
      if (blockIndex >= start && blockIndex < end) return p;
    }
    return 0;
  }, [pageBreaks, blocks]);

  // ── Report anchor / block index on page change (matches web ReaderPanel) ──
  useEffect(() => {
    if (prevPageRef.current === page || (!onAnchorChange && !onBlockChange)) return;
    prevPageRef.current = page;
    const first = visibleBlocks?.find(
      (b): b is TextBlock => b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item'),
    );
    if (!first) return;
    onAnchorChange?.(first.text.slice(0, 40));
    const globalIdx = blocks?.indexOf(first) ?? -1;
    if (globalIdx >= 0) onBlockChange?.(globalIdx);
  }, [page, visibleBlocks, onAnchorChange, onBlockChange, blocks]);

  return {
    blocks, visibleBlocks, page, totalPages, hasMeasured,
    loadingTokens, tokenCache, blockTranslations, isTranslating,
    prevPage, nextPage, goToPage, blockPage, handleMeasureBlock, contentWidth,
    measuredWindow,
  };
}
