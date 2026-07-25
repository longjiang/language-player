import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { parseMarkdownBlocks } from '@/lib/parse-markdown';
import type { ContentBlock, TextBlock } from '@/lib/parse-markdown';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { LemmatizedToken } from '@langplayer/shared';

interface UseEpubPaginationOptions {
  text: string;
  l1Code: string;
  l2Code: string;
  showTranslation: boolean;
  /** Resets all state when changed (e.g., file name changes) */
  resetKey: string | null;
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
  handleMeasureBlock: (index: number, height: number) => void;
  contentWidth: number;
}

export function useEpubPagination({
  text, l1Code, l2Code, showTranslation, resetKey,
}: UseEpubPaginationOptions): UseEpubPaginationReturn {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const contentWidth = windowWidth - 32;

  const [blocks, setBlocks] = useState<ContentBlock[] | null>(null);
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
  }, [resetKey]);

  // ── Parse markdown when text changes ──
  useEffect(() => {
    if (!text.trim()) { setBlocks(null); return; }
    try { setBlocks(parseMarkdownBlocks(text)); } catch { setBlocks(null); }
  }, [text]);

  // ── Reset measurement state when text (chapter) changes ──
  useEffect(() => {
    setPageBreaks([]);
    setHasMeasured(false);
    setMeasuredBlockCount(0);
    setTokenCache({});
    blockHeightsRef.current = [];
    setPage(0);
  }, [text]);

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
    fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: missing.map(m => m.text), l2: l2Code }),
    })
      .then(res => res.json())
      .then(data => {
        if (tokenLoadGenRef.current !== gen) return;
        const results: LemmatizedToken[][] = data?.results ?? [];
        setTokenCache(prev => {
          const next = { ...prev };
          missing.forEach((m, i) => { if (results[i]) next[m.idx] = results[i]!; });
          return next;
        });
      })
      .catch(() => {})
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

  return {
    blocks, visibleBlocks, page, totalPages, hasMeasured,
    loadingTokens, tokenCache, blockTranslations, isTranslating,
    prevPage, nextPage, handleMeasureBlock, contentWidth,
  };
}
