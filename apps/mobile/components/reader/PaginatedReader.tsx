import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, View, Text, Image, ActivityIndicator, ScrollView, Alert, Platform, useWindowDimensions,
  type DimensionValue, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { baseCode, isPhoneticsEligible, translationSizeFactor, buildSentenceMap, sentenceIndexAt } from '@langplayer/utils';
import type { SentenceMap } from '@langplayer/utils';
import { TokenizedText } from '@/components/TokenizedText';
import { AlignedTranslation, lineBaselineOffset } from '@/components/reader/AlignedTranslation';
import { TextActionMenu } from '@/components/TextActionMenu';
import { TranslationSkeleton } from '@/components/reader/TranslationSkeleton';
import { TranslationSplitHandle } from '@/components/reader/TranslationSplitHandle';
import { Root as Switch } from '@/components/ui/switch';
import { useSettingsContext } from '@/contexts/SettingsContext';
import type { ContentBlock, TextBlock } from '@/lib/parse-markdown';
import type { LemmatizedToken } from '@langplayer/shared';
import type { GridLine } from '@/lib/aligned-translation';
import { ChevronDown, ChevronLeft, ChevronRight, List, Loader2, Search } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { ZOOM_TO_REM } from '@/lib/text-scale';
import { readerLeadingPx, readerHorizontalPadding } from '@/lib/reader-layout';
import { isReaderTextBlock, localTextBlockIndex } from '@/lib/reader-sentence-highlight';
import { readerLogger, translationLogger, log as appLog } from '@/lib/logger';
import { computeRubyLayout } from '@/lib/ruby-layout';

const { log } = readerLogger;
const displayLoggedState = new WeakMap<ContentBlock, boolean>();

/** Unordered bullet glyphs by list nesting depth (SPEC-083). */
const LIST_BULLETS = ['•', '◦', '▪'] as const;

/**
 * Ordinal (0-based) of a list item within its own flat list run: consecutive
 * blocks sharing (listDepth, ordered, start) count from the run's start.
 */
function listItemOrdinal(block: TextBlock, allBlocks: ContentBlock[]): number {
  const idx = allBlocks.indexOf(block);
  let count = 0;
  for (let i = idx; i >= 0; i--) {
    const b = allBlocks[i];
    if (b?.kind !== 'text' || b.type !== 'list-item') break;
    if (
      (b.ordered ?? false) !== (block.ordered ?? false)
      || (b.listDepth ?? 0) !== (block.listDepth ?? 0)
      || (b.start ?? 1) !== (block.start ?? 1)
    ) break;
    count++;
  }
  return count - 1;
}

/** Tokenize blocks within this many px of the viewport (web parity: 200px rootMargin). */
const VISIBILITY_BUFFER = 200;
/** Horizontal velocity (px/s) at end of a gesture that counts as a "flick":
 *  turns the page even when the drag distance is short (iBooks-style). */
const FLICK_VELOCITY = 800;

interface PaginatedReaderProps {
  blocks: ContentBlock[] | null;
  /** Target language code for TokenizedText + TextActionMenu. */
  l2Code: string;
  /** Native language code for TextActionMenu translate target. */
  l1Code: string;
  t: (key: string) => string;

  // ── Rendering options ──
  /** Wrap body blocks in TextActionMenu (copy/speak/explain/translate). Default false. */
  showTextActions?: boolean;
  /** Render L1 translation beside the L2 block at lg+ widths (web parity). */
  translationSideBySide?: boolean;
  /** Enable native text selection on reader blocks — a settled selection
   *  opens the dictionary popup with the selected text (SPEC-084 Task 6,
   *  web SPEC-033 parity). */
  selectionDictionary?: boolean;
  /** Hide the text|translation split handle's visible grip while keeping it
   *  draggable (EPUB reader — the affordance is hidden until we design a
   *  discoverable way to surface it). Default false (visible grip). */
  hideSplitHandle?: boolean;
  /** Show L1 translation below each body block. Default false. */
  showTranslation?: boolean;
  /** Called when the translate toggle button is pressed. Parent controls the state. */
  onToggleTranslation?: () => void;

  // ── Scroll mode (non-paginated) ──
  /** When true, renders all blocks in a scrollable container without page nav. Default false. */
  scrollMode?: boolean;

  // ── Pagination mode props (ignored in scrollMode) ──
  visibleBlocks?: ContentBlock[] | null;
  page?: number;
  totalPages?: number;
  hasMeasured?: boolean;
  loadingTokens?: boolean;
  tokenCache?: Record<number, LemmatizedToken[]>;
  blockTranslations?: Record<number, string>;
  prevPage?: () => void;
  nextPage?: () => void;
  goToPage?: (page: number) => void;
  handleMeasureBlock?: (index: number, height: number, top?: number, origin?: number) => void;
  contentWidth?: number;
  /** Explicit pagination bounds (lazy readers with estimated totals). */
  hasPrev?: boolean;
  hasNext?: boolean;
  /** Number of blocks currently mounted in the hidden measuring view (whole-book chunking). */
  measuredWindow?: number;
  /** First global block index rendered in the hidden measuring view
   *  (lazy web-style pagination). */
  measureStart?: number;
  /** Exclusive end index rendered in the hidden measuring view. */
  measureEnd?: number;
  /** Bumped when the measuring window must remount (layout/translation changes). */
  measureNonce?: number;
  /** Reports the real page-display viewport size (width/height). */
  onViewportLayout?: (width: number, height: number) => void;
  /** Follow an in-book link (SPEC-049 §9.7) — passed to linked tokens. */
  onOpenLink?: (href: string) => void;
  /** Active search-match highlight (block + char range), if any. */
  highlight?: { blockIndex: number; start: number; end: number } | null;
  /** Text scale for reader blocks (1 = user zoom, SPEC-051). */
  textScale?: number;
  /** Reports global block indices currently near the viewport (lazy tokenization). */
  onVisibleBlocksChange?: (globalIndices: number[]) => void;
  /** True while the current page's paragraphs are being translated (skeleton bars). */
  isTranslating?: boolean;
  /** First-line indent (1 em) for body paragraphs — EPUB typography
   *  (SPEC-082 Task 5, web `[&_p]:indent-[1em]` parity). */
  firstLineIndent?: boolean;
  /** Diagnostic (SPEC-087): base-text font override for the tokenized text. */
  debugFontFamily?: string | null;
  /** Diagnostic (SPEC-087): readings-only font override. */
  debugRubyFontFamily?: string | null;
  /** Diagnostic (SPEC-087): paint base yellow / reading cyan to show space. */
  debugRubyMetrics?: boolean;
  /** True while the user is actively flipping pages: visible blocks render as
   *  plain text (fast) even when tokens are cached; the tokenized/translated
   *  render returns once flipping stops. */
  flipping?: boolean;
  /** True while an exact re-measure is in flight — the hidden measuring
   *  window is only mounted during this window (a page with already-exact
   *  boundaries never pays a 320-block remount at commit). */
  measuring?: boolean;
  /** True for the lazy/estimate (whole-book EPUB) reader: it upgrades visible
   *  blocks to tokenized progressively instead of one full-page commit.
   *  Non-estimate readers keep their existing immediate tokenized render. */
  lazyPagination?: boolean;

  // ── Immersive reader mode (EPUB) ──
  /**
   * Immersive mode: the page chrome (bottom pagination bar) floats over the
   * content instead of taking layout space, and page metadata overlays render
   * on top. Toggling `chromeVisible` never reflows the book — the caller
   * reserves constant top/bottom strips via `immersiveReserve`.
   */
  immersive?: boolean;
  /** Constant strips reserved for the chrome (and the muted page metadata) —
   *  applied as padding so pagination is identical with chrome shown/hidden. */
  immersiveReserve?: { top: number; bottom: number };
  /** Immersive: whether the bottom bar chrome is visible (slides away when false). */
  chromeVisible?: boolean;
  /** Immersive: called on a blank-space tap to toggle the chrome. */
  onToggleChrome?: () => void;
  /** Immersive: renders the TOC button in the bottom bar. */
  onOpenToc?: () => void;
  /** Immersive: renders the Search button in the bottom bar. */
  onOpenSearch?: () => void;
  /** Immersive: overlay rendered in the top reserved strip (muted chapter title). */
  topOverlay?: React.ReactNode;
  /** Immersive: overlay rendered in the bottom reserved strip (muted page count);
   *  receives the 1-based page and total. */
  pageInfoOverlay?: (page: number, total: number) => React.ReactNode;
}

export function PaginatedReader({
  blocks, visibleBlocks: visibleBlocksProp, page = 0, totalPages = 1,
  hasMeasured: hasMeasuredProp, loadingTokens: loadingTokensProp,
  tokenCache = {}, blockTranslations = {}, isTranslating = false,
  prevPage, nextPage, goToPage, handleMeasureBlock,
  contentWidth: contentWidthProp = 300,
  hasPrev: hasPrevProp,
  hasNext: hasNextProp,
  measuredWindow = 0,
  measureStart = -1,
  measureEnd = -1,
  measureNonce = 0,
  onViewportLayout,
  onOpenLink,
  highlight,
  textScale = 1,
  onVisibleBlocksChange,
  l2Code, l1Code, showTranslation = false, onToggleTranslation,
  showTextActions = false, translationSideBySide = false, scrollMode = false, t,
  hideSplitHandle = false,
  selectionDictionary = false,
  firstLineIndent = false,
  debugFontFamily,
  debugRubyFontFamily,
  debugRubyMetrics,
  flipping = false,
  measuring = false,
  lazyPagination = false,
  immersive = false,
  immersiveReserve,
  chromeVisible = true,
  onToggleChrome,
  onOpenToc,
  onOpenSearch,
  topOverlay,
  pageInfoOverlay,
}: PaginatedReaderProps) {
  // ── Visibility-based lazy tokenization (SPEC-019 O2) ──
  // Track scroll position + viewport height imperatively (refs, no re-render
  // on every scroll frame) and report only the blocks whose measured rect
  // intersects the viewport ± VISIBILITY_BUFFER.
  // ── Render-cost diagnostics ──
  // Log any single render of this reader page that takes >500ms, so whole-page
  // re-render storms (every block re-rendering on tokenCache/sync updates) are
  // visible when popup opens are slow. Zero-overhead when under the threshold.
    const renderClockRef = useRef<{ start: number; count: number } | null>(null);
  if (!renderClockRef.current) renderClockRef.current = { start: Date.now(), count: 0 };
  renderClockRef.current.count++;
  const renderStartMs = renderClockRef.current.start;
  useEffect(() => {
    const elapsed = Date.now() - renderStartMs;
    const n = renderClockRef.current?.count ?? 0;
    renderClockRef.current = null;
    if (elapsed > 500) {
      log(`[Reader] 🐢 RENDER took ${elapsed}ms renders=${n} blocks=${(scrollMode ? blocks : visibleBlocksProp)?.length ?? 0} t=${Date.now()}`);
    }
  });

  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const viewportHeightRef = useRef(0);
  /** Long-page affordance: whether the current page overflows the viewport
   *  and whether the user has scrolled to its bottom. */
  const [pageOverflow, setPageOverflow] = useState(false);
  const [atPageBottom, setAtPageBottom] = useState(false);
  const blockLayoutsRef = useRef<Record<number, { top: number; height: number }>>({});
  const lastVisibleKeyRef = useRef('');
  const measureWindowLogKeyRef = useRef('');
  const lastOverflowLogRef = useRef(0);
  const lastPageShownLogKeyRef = useRef('');
  const tokenLoadStartRef = useRef(0);
  const onVisibleBlocksChangeRef = useRef(onVisibleBlocksChange);
  onVisibleBlocksChangeRef.current = onVisibleBlocksChange;

  // ── Translation-sentence highlight on tap (SPEC-082 Task 4) ──
  // Tapping a token highlights the paired translation sentence until the
  // selection clears (scroll, or a token outside any sentence). There is no
  // hover on touch — the highlight is tap-to-toggle.
  const [activeSentence, setActiveSentence] = useState<{
    blockIndex: number;
    sentenceIndex: number;
  } | null>(null);
  const activeSentenceRef = useRef(activeSentence);
  activeSentenceRef.current = activeSentence;
  // Stable per-block tap handlers + sentence-map cache so TokenizedText's
  // memoization is never defeated by fresh closures (reader perf rule).
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const blockTranslationsRef = useRef(blockTranslations);
  blockTranslationsRef.current = blockTranslations;
  // The visible page slice (scrollMode: the whole block list). Token press
  // handlers are cached per global block index, so the translation lookup
  // must resolve the current page's LOCAL index at press time.
  const visibleBlocksRef = useRef<ContentBlock[] | null | undefined>(null);
  const sentenceMapCacheRef = useRef<Map<string, SentenceMap | null>>(new Map());
  const sentenceMapFor = useCallback((globalIdx: number, text: string, translation: string): SentenceMap | null => {
    const key = `${globalIdx}:${translation}`;
    const cached = sentenceMapCacheRef.current.get(key);
    if (cached !== undefined) return cached;
    const map = buildSentenceMap(text, translation);
    sentenceMapCacheRef.current.set(key, map);
    return map;
  }, []);
  const tokenPressHandlersRef = useRef<Map<number, (range: { start: number; end: number } | null) => void>>(new Map());
  const getTokenPressHandler = useCallback((globalIdx: number) => {
    let handler = tokenPressHandlersRef.current.get(globalIdx);
    if (!handler) {
      handler = (range) => {
        const blk = blocksRef.current?.[globalIdx];
        if (!range || !blk || blk.kind !== 'text') {
          if (activeSentenceRef.current) setActiveSentence(null);
          return;
        }
        // Translations are keyed by the block's LOCAL index within the
        // current page's text blocks (use-epub-pagination resets the map on
        // every page), never by its global index — resolve the same local
        // index renderBlock uses so the tap-highlight works on every page,
        // not just the first one where global == local.
        const localIdx = localTextBlockIndex(visibleBlocksRef.current, blk);
        const tr = localIdx >= 0 ? blockTranslationsRef.current[localIdx] : undefined;
        if (!tr) {
          if (activeSentenceRef.current) setActiveSentence(null);
          return;
        }
        const map = sentenceMapFor(globalIdx, blk.text, tr);
        const idx = map ? sentenceIndexAt(map, range.start) : null;
        setActiveSentence(idx != null ? { blockIndex: globalIdx, sentenceIndex: idx } : null);
      };
      tokenPressHandlersRef.current.set(globalIdx, handler);
    }
    return handler;
  }, [sentenceMapFor]);

  // ── L2 line grids for translation baseline alignment (SPEC-082 web
  // AlignedTranslation parity) ──
  // Each block's TokenizedText reports its measured line grid (paragraph /
  // plain render paths) through a stable per-block callback; the side-by-side
  // translation column then places every line on the L2 line grid. Keyed by
  // global block index; stale entries are harmless (overwritten or unused).
  const [lineGrids, setLineGrids] = useState<Record<number, GridLine[]>>({});
  const lineGridHandlersRef = useRef<Map<number, (lines: GridLine[]) => void>>(new Map());
  /** Full-geometry signature: a re-wrap can change later lines while the
   *  first line's metrics stay identical, so compare every line's top/height/
   *  baseline — not just the first. */
  const gridSignature = useCallback((lines: GridLine[]): string =>
    lines
      .slice(0, 60)
      .map((l) => `${Math.round(l.y)}:${Math.round(l.height)}:${Math.round(lineBaselineOffset(l))}`)
      .join('|'),
  []);
  const lineGridSigsRef = useRef<Record<number, string>>({});
  const getLineGridHandler = useCallback((globalIdx: number) => {
    let handler = lineGridHandlersRef.current.get(globalIdx);
    if (!handler) {
      handler = (lines) => {
        if (!lines || lines.length === 0) return;
        // TEMP DIAG (keep while furigana baseline alignment is in progress):
        // prints the stored L2 line grid (native ruby-correct baselines).
        if (__DEV__) {
          appLog(
            `[Reader] GRID block=${globalIdx} n=${lines.length} ${lines
              .slice(0, 4)
              .map((l) => `[y=${Math.round(l.y)} h=${Math.round(l.height)} a=${Math.round(l.ascender)}]`)
              .join(' ')} lastY=${Math.round(lines[lines.length - 1]!.y)}`,
          );
        }
        const sig = gridSignature(lines);
        if (lineGridSigsRef.current[globalIdx] === sig) return; // same grid
        lineGridSigsRef.current[globalIdx] = sig;
        setLineGrids((prev) => ({ ...prev, [globalIdx]: lines }));
      };
      lineGridHandlersRef.current.set(globalIdx, handler);
    }
    return handler;
  }, [gridSignature]);
  // Scroll clears the highlight ("tap elsewhere / scroll → clear").
  const clearActiveSentence = useCallback(() => {
    if (activeSentenceRef.current) setActiveSentence(null);
  }, []);

  // The visible page is a contiguous slice of `blocks`; resolve its global
  // offset once so per-scroll visibility math is O(page) instead of
  // O(page × book).
  const visibleStartIdx = useMemo(() => {
    if (scrollMode || !blocks || !visibleBlocksProp || visibleBlocksProp.length === 0) return 0;
    const idx = blocks.indexOf(visibleBlocksProp[0]);
    return idx >= 0 ? idx : 0;
  }, [scrollMode, blocks, visibleBlocksProp]);

  const computeVisibleIndices = useCallback(() => {
    const list = scrollMode ? blocks : visibleBlocksProp;
    if (!list || viewportHeightRef.current <= 0) return [];
    const top = scrollYRef.current - VISIBILITY_BUFFER;
    const bottom = scrollYRef.current + viewportHeightRef.current + VISIBILITY_BUFFER;
    const out: number[] = [];
    for (let i = 0; i < list.length; i++) {
      const idx = scrollMode ? i : visibleStartIdx + i;
      const rect = blockLayoutsRef.current[idx];
      if (!rect) continue;
      if (rect.top + rect.height >= top && rect.top <= bottom) out.push(idx);
    }
    return out;
  }, [scrollMode, blocks, visibleBlocksProp, visibleStartIdx]);

  const reportVisible = useCallback(() => {
    const indices = computeVisibleIndices();
    const key = indices.join(',');
    if (key !== lastVisibleKeyRef.current) {
      lastVisibleKeyRef.current = key;
      log(`[Reader] 👁 lazy tokenization window: blocks=[${key || 'none'}]`);
      onVisibleBlocksChangeRef.current?.(indices);
    }
  }, [computeVisibleIndices]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
    // Long-page affordance: track whether the user is at the bottom of an
    // overflowing page (hides the down-arrow).
    const vh = viewportHeightRef.current;
    if (vh > 0) {
      const maxY = Math.max(0, e.nativeEvent.contentSize.height - vh);
      setAtPageBottom(maxY > 8 && e.nativeEvent.contentOffset.y >= maxY - 8);
    }
    // SPEC-082 Task 4: scrolling clears the translation-sentence highlight.
    clearActiveSentence();
    reportVisible();
  }, [reportVisible, clearActiveSentence]);

  const handleViewportLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    if (h > 0 && h !== viewportHeightRef.current) {
      viewportHeightRef.current = h;
      reportVisible();
    }
    // Real page-display area (width/height) — the pagination hook uses this
    // instead of guessing chrome/padding from window dimensions.
    if (width > 0 && h > 0) {
      log(`[Reader] 📐 reader viewport ${width}x${h} t=${Date.now()}`);
      onViewportLayout?.(width, h);
    }
  }, [reportVisible, onViewportLayout]);

  const handleBlockLayout = useCallback((globalIdx: number, top: number, height: number) => {
    const prev = blockLayoutsRef.current[globalIdx];
    if (!prev || prev.top !== top || prev.height !== height) {
      blockLayoutsRef.current = { ...blockLayoutsRef.current, [globalIdx]: { top, height } };
      reportVisible();
    }
  }, [reportVisible]);

  // Page identity: remount the ScrollView whenever the rendered page slice
  // changes (page index, slice start, or slice length). Remounting guarantees
  // every block re-fires onLayout, so measured rects are always fresh for the
  // current page. Stale rects for other pages are harmless — visibility math
  // only consults the current slice's global indices.
  const scrollViewKey = scrollMode
    ? 'scroll'
    : `${visibleStartIdx}:${page}:${visibleBlocksProp?.length ?? 0}`;

  // Reset the dedup key synchronously on page identity change so the first
  // onLayout of the new page re-reports even when the visible index set
  // string is identical to the previous page's.
  const prevScrollViewKeyRef = useRef(scrollViewKey);
  if (prevScrollViewKeyRef.current !== scrollViewKey) {
    prevScrollViewKeyRef.current = scrollViewKey;
    lastVisibleKeyRef.current = '';
  }

  const handlePageNumberTap = useCallback(() => {
    if (!goToPage) return;
    if (Platform.OS === 'ios') {
      Alert.prompt(
        t('action.go_to_page'),
        '',
        (value) => {
          const n = parseInt(value, 10);
          if (!isNaN(n) && n >= 1) goToPage(n - 1);
        },
        'plain-text',
        '',
        'number-pad',
      );
    }
  }, [goToPage, t]);
  const visibleBlocks = scrollMode ? blocks : visibleBlocksProp;
  visibleBlocksRef.current = visibleBlocks;
  const hasMeasured = scrollMode ? true : hasMeasuredProp;
  const contentWidth = scrollMode ? 300 : contentWidthProp;
  const loadingTokens = scrollMode ? false : (loadingTokensProp ?? false);
  const hasPrev = scrollMode ? false : (hasPrevProp ?? page > 0);
  const hasNext = scrollMode ? false : (hasNextProp ?? page < totalPages - 1);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { getL2, tokenizedText: tokenSettings, display, updateDisplay } = useSettingsContext();
  const l2Settings = getL2(l2Code);
  const phonetics = l2Settings.tokenSpan.phonetics;
  const showDefinition = l2Settings.tokenSpan.definition.show;
  const zoomRem = ZOOM_TO_REM[tokenSettings.zoom] ?? 1;
  // SPEC-082 Task 1: translation text renders at `translationSize` × the L2
  // rendered size (clamped to [0.5, 1], default 0.8).
  const translationFactor = translationSizeFactor({ tokenizedText: tokenSettings });

  // ── Splitter live state (SPEC-082 Task 3, web parity) ──
  // During a drag the row re-splits immediately via `liveSplit` (no
  // persistence, no pagination re-measure); the final ratio is committed once
  // on release, persisting it and re-measuring page breaks (the pagination
  // hook keys off `display.translationSplit`).
  const persistedSplit = display.translationSplit;
  const [liveSplit, setLiveSplit] = useState(persistedSplit);
  const appliedSplit = liveSplit;
  // The L2 tokenized text's leading (user setting, default 1.625). The
  // stacked translation column uses the SAME leading so its line pitch
  // matches the L2 text exactly (narrow screens / below md).
  const translationLeading = tokenSettings.leading ?? 1.625;
  const onSplitChange = useCallback((r: number) => setLiveSplit(r), []);
  const onSplitCommit = useCallback((r: number) => {
    setLiveSplit(r);
    updateDisplay({ translationSplit: r });
  }, [updateDisplay]);
  // Keep the live value in sync if the persisted value changes externally
  // (e.g. another device's cloud sync, or the settings screen) while not mid-drag.
  useEffect(() => {
    setLiveSplit((prev) => (Math.abs(prev - persistedSplit) < 0.001 ? prev : persistedSplit));
  }, [persistedSplit]);
  const effectiveScale = (textScale ?? 1) * zoomRem;
  // Reader layout rule: the L2 body text's rendered line-height (its
  // typographic "leading") drives the reader's left margin and the
  // side-by-side text|translation gap — the distance from the device's left
  // edge to the text's left edge, and the gap between the L2 text and its L1
  // translation, both equal the text's leading.
  const leadingPx = readerLeadingPx(tokenSettings.zoom, translationLeading, textScale ?? 1);
  const readerPad = readerHorizontalPadding(tokenSettings.zoom, translationLeading, textScale ?? 1);
  const measureFontSize = 16 * effectiveScale;
  const measureFontFamily = tokenSettings.typeFace === 'serif'
    ? (Platform.OS === 'ios' ? 'Georgia' : 'serif')
    : tokenSettings.typeFace === 'sans-serif'
      ? (Platform.OS === 'ios' ? 'Avenir Next' : 'sans-serif')
      : undefined;
  // The L2 body line pitch the TOKENIZED reader actually renders: the native
  // ruby paragraph pins every line to `computeRubyLayout().linePitch` (base
  // leading + reading band when ruby is on). The hidden measuring view must
  // use the SAME pitch so page breaks land exactly where the visible text
  // sits. The old `round(fontSize * 2 * ratio)` heuristic used a flat 2× base
  // that under-measured BOTH plain text (the real leading is the user's
  // `leading` ratio, ~1.625×, not 2×) and ruby text (the reading band was
  // missing) — so pages overflowed (measured too short: contentH > viewport)
  // or left a gap (measured too tall). Derive the pitch deterministically from
  // the same inputs TokenizedText uses instead of the dev-only calibration.
  const l2BodyLeading = tokenSettings.leading ?? 1.625;
  const rubyLayout = computeRubyLayout(baseCode(l2Code), {
    fontSize: measureFontSize,
    lineHeight: Math.round(measureFontSize * l2BodyLeading),
    showPhonetics: isPhoneticsEligible(l2Code),
    phoneticsShow: phonetics.show,
  });
  // Interlinear definitions reserve an extra per-line slot below the base
  // text (~0.7× the base leading, matching TokenizedText's definition row).
  const definitionSlot = showDefinition ? Math.round(measureFontSize * l2BodyLeading * 0.7) : 0;
  const measureLineHeight = rubyLayout.linePitch + definitionSlot;
  const measureTextStyle = useMemo(() => ({
    fontSize: measureFontSize,
    lineHeight: measureLineHeight,
    ...(measureFontFamily ? { fontFamily: measureFontFamily } : {}),
  }), [measureFontSize, measureLineHeight, measureFontFamily]);

  // ── Swipe/flick left/right page turns (drag follows the finger) ──
  // The pan is tuned for flicks: it activates on a small horizontal offset,
  // tolerates vertical drift (so quick diagonal flicks don't get swallowed by
  // the ScrollView), and a fast horizontal velocity turns the page even with a
  // short stroke. A turn already animating is superseded immediately by the
  // next flick, so rapid page-flipping never queues behind an animation.
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const swipeAnimatingRef = useRef(false);
  const swipeExitRef = useRef<{ direction: 'next' | 'prev' } | null>(null);
  const swipeExitPageRef = useRef(page);
  const swipeActionsRef = useRef({ hasPrev, hasNext, prevPage, nextPage, width: windowWidth });
  swipeActionsRef.current = { hasPrev, hasNext, prevPage, nextPage, width: windowWidth };

  // The page content ScrollView's native scroll gesture. The horizontal
  // page-turn pan is registered as simultaneous with it so a vertical drag
  // always scrolls the page content — revealing text that overflows the page
  // (a tall block, or a translation taller than measured) — instead of being
  // captured/blocked by the pan. The pan still only activates on a horizontal
  // offset, so vertical scrolling and horizontal page turns coexist cleanly.
  const nativeScrollGesture = useMemo(() => Gesture.Native(), []);

  const panGesture = Gesture.Pan()
    .enabled(!scrollMode && (hasPrev || hasNext))
    .activeOffsetX([-10, 10])
    .failOffsetY([-40, 40])
    .runOnJS(true)
    .simultaneousWithExternalGesture(nativeScrollGesture)
    .onUpdate((e) => {
      if (swipeAnimatingRef.current) return;
      const { hasPrev: canPrev, hasNext: canNext } = swipeActionsRef.current;
      const canDrag = e.translationX < 0 ? canNext : canPrev;
      if (!canDrag) return;
      swipeTranslateX.setValue(e.translationX);
    })
    .onEnd((e) => {
      const { hasPrev: canPrev, hasNext: canNext, prevPage: goPrev, nextPage: goNext, width } = swipeActionsRef.current;
      const isFlick = Math.abs(e.velocityX) > FLICK_VELOCITY;
      const threshold = Math.min(64, width * 0.18);
      const shouldNext = (e.translationX < -threshold || (isFlick && e.velocityX < -FLICK_VELOCITY)) && canNext;
      const shouldPrev = (e.translationX > threshold || (isFlick && e.velocityX > FLICK_VELOCITY)) && canPrev;
      if (shouldNext || shouldPrev) {
        // Rapid flipping: if a turn animation is already in flight, don't queue
        // behind it — cancel it and navigate immediately.
        if (swipeAnimatingRef.current) {
          swipeTranslateX.stopAnimation();
          swipeTranslateX.setValue(0);
          swipeAnimatingRef.current = false;
          swipeExitRef.current = null;
          appLog(`[Reader] 👉 flick (mid-anim) ${shouldNext ? 'next' : 'prev'} vx=${Math.round(e.velocityX)} t=${Date.now()}`);
          if (shouldNext) goNext?.();
          else goPrev?.();
          return;
        }
        swipeExitPageRef.current = page;
        swipeExitRef.current = { direction: shouldNext ? 'next' : 'prev' };
        appLog(`[Reader] 👉 swipe ${shouldNext ? 'next' : 'prev'} dx=${Math.round(e.translationX)} vx=${Math.round(e.velocityX)} t=${Date.now()}`);
        swipeAnimatingRef.current = true;
        Animated.timing(swipeTranslateX, {
          toValue: shouldNext ? -width : width,
          duration: 100,
          useNativeDriver: true,
        }).start(() => {
          swipeAnimatingRef.current = false;
          if (shouldNext) goNext?.();
          else goPrev?.();
        });
      } else {
        swipeExitRef.current = null;
        appLog(`[Reader] 👉 swipe snap back dx=${Math.round(e.translationX)} vx=${Math.round(e.velocityX)}`);
        swipeAnimatingRef.current = true;
        Animated.spring(swipeTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          speed: 24,
          bounciness: 0,
        }).start(() => {
          swipeAnimatingRef.current = false;
        });
      }
    })
    .onFinalize(() => {
      // Gesture was cancelled/interrupted without a clean end — snap back.
      if (swipeAnimatingRef.current) return;
      swipeExitRef.current = null;
      Animated.spring(swipeTranslateX, {
        toValue: 0,
        useNativeDriver: true,
        speed: 24,
        bounciness: 0,
      }).start();
    });

  // Once the new page is measured, reset the transform before paint so the
  // swiped-out page doesn't snap back on screen first.
  useLayoutEffect(() => {
    if (swipeExitRef.current && !swipeAnimatingRef.current && hasMeasured && page !== swipeExitPageRef.current) {
      swipeExitRef.current = null;
      swipeTranslateX.setValue(0);
    }
  }, [page, hasMeasured, swipeTranslateX]);

  useEffect(() => {
    if (!hasMeasured || !visibleBlocksProp) return;
    const key = `${page}:${visibleBlocksProp.length}`;
    if (lastPageShownLogKeyRef.current === key) return;
    lastPageShownLogKeyRef.current = key;
    appLog(`[Reader] ✅ page content shown page=${page} blocks=${visibleBlocksProp.length} t=${Date.now()}`);
    // Diagnostic (spacing): dump the visible page's block structure + the L2
    // leading so an unusually large inter-paragraph gap can be traced to either
    // an unexpected block kind (empty/heading/table) or an oversized leading /
    // ruby line pitch. Fires once per page (keyed above).
    appLog('[Reader] 📐 spacing diagnostic', {
      leading: translationLeading,
      leadingPx: Math.round(16 * translationLeading),
      viewportH: viewportHeightRef.current,
      blocks: visibleBlocksProp.map((b) => ({
        idx: blocks?.indexOf(b) ?? -1,
        kind: b.kind,
        type: b.kind === 'text' ? (b as any).type : null,
        textLen: 'text' in b ? (b as any).text?.length ?? 0 : 0,
      })),
    });
  }, [hasMeasured, page, visibleBlocksProp]);

  // ── Progressive tokenized upgrade after the user stops flipping ──
  // While flipping, visible pages render as plain text. Once the user commits
  // (flipping=false), upgrade visible blocks to tokenized ONE AT A TIME with
  // yields between them, so the JS thread never blocks on a whole page of ruby
  // layout in one commit (that froze button presses). Navigating cancels the
  // remaining upgrades. Only the estimate (lazy) reader upgrades progressively;
  // scroll mode renders everything tokenized as before.
  const [upgradedBlocks, setUpgradedBlocks] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    if (!lazyPagination) return; // non-estimate readers keep full tokenized render
    if (flipping || !blocks || !visibleBlocksProp || visibleBlocksProp.length === 0) {
      appLog(`[Reader] 🔄 upgrade reset flipping=${flipping} blocks=${blocks?.length ?? 0} vis=${visibleBlocksProp?.length ?? 0} t=${Date.now()}`);
      setUpgradedBlocks(new Set());
      return;
    }
    const queue = visibleBlocksProp
      .map((b) => blocks.indexOf(b))
      .filter((i) => i >= 0);
    appLog(`[Reader] 🔄 upgrade start flipping=${flipping} queue=[${queue.join(',')}] t=${Date.now()}`);
    if (queue.length === 0) { setUpgradedBlocks(new Set()); return; }
    setUpgradedBlocks(new Set());
    let cursor = 0;
    // Upgrade the first block immediately, then one per tick.
    setUpgradedBlocks((prev) => new Set(prev).add(queue[0]!));
    appLog(`[Reader] 🔄 upgrade +${queue[0]} t=${Date.now()}`);
    cursor = 1;
    const timer = setInterval(() => {
      if (cursor >= queue.length) {
        clearInterval(timer);
        return;
      }
      const idx = queue[cursor]!;
      cursor++;
      setUpgradedBlocks((prev) => new Set(prev).add(idx));
      appLog(`[Reader] 🔄 upgrade +${idx} t=${Date.now()}`);
    }, 48);
    return () => clearInterval(timer);
  }, [flipping, visibleBlocksProp, blocks]);

  useEffect(() => {
    if (loadingTokens && tokenLoadStartRef.current === 0) {
      tokenLoadStartRef.current = Date.now();
      log(`[Reader] ⏳ tokenization started t=${tokenLoadStartRef.current}`);
    } else if (!loadingTokens && tokenLoadStartRef.current > 0) {
      const elapsed = Date.now() - tokenLoadStartRef.current;
      log(`[Reader] ✅ tokenization finished elapsed=${elapsed}ms t=${Date.now()}`);
      tokenLoadStartRef.current = 0;
    }
  }, [loadingTokens]);

  // ── Immersive chrome: the bottom bar slides out of the reserved strip when
  // the chrome is hidden. Pure overlay — pagination never changes. ──
  const barTranslateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!immersive) return;
    Animated.timing(barTranslateY, {
      toValue: chromeVisible ? 0 : 180,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [immersive, chromeVisible, barTranslateY]);

  // ── Scroll mode: simple block list ──
  if (scrollMode) {
    if (!blocks) return null;
    return (
      <View className="flex-1">
        <View style={{ paddingLeft: readerPad.left, paddingRight: readerPad.right }}>
          {blocks.map((block, bi) =>
              renderBlock(block, bi, blocks, blocks, tokenCache, blockTranslations, isTranslating, showTranslation, l2Code, l1Code, contentWidth, showTextActions, onOpenLink, highlight, textScale, zoomRem, translationSideBySide, undefined, false, translationFactor, appliedSplit, onSplitChange, onSplitCommit, activeSentence, sentenceMapFor, getTokenPressHandler, lineGrids, getLineGridHandler, firstLineIndent, false, undefined, hideSplitHandle, selectionDictionary, translationLeading, debugFontFamily, debugRubyFontFamily, debugRubyMetrics),
          )}
        </View>
        {onToggleTranslation && (
          <View className="flex-row items-center justify-end gap-2 border-t border-border px-4" style={{ paddingBottom: insets.bottom, paddingTop: 8 }}>
            <Text className="text-xs text-muted-foreground">{t('action.translation')}</Text>
            <Switch checked={showTranslation} onCheckedChange={onToggleTranslation} />
          </View>
        )}
      </View>
    );
  }

  // ── Paginated mode ──
  // Immersive: the whole padded container is the blank-tap surface — it
  // covers the entire screen, including the reserved strips and the empty
  // page area below the last paragraph (SPEC-085 §5). Deeper Pressables
  // (tokens, links, bar controls) claim their own touches; the ScrollView's
  // pan cancels the press on a swipe, so page turns never toggle the chrome.
  const tapSurface = !!(immersive && onToggleChrome);
  const containerStyle = immersive && immersiveReserve
    ? { paddingTop: immersiveReserve.top, paddingBottom: immersiveReserve.bottom }
    : undefined;

  return (
    <TapSurfaceView tapSurface={tapSurface} onPress={onToggleChrome} style={containerStyle}>
      {blocks && !hasMeasured && (
        <View className="flex-1 items-center justify-center" onLayout={handleViewportLayout}>
          <ActivityIndicator size="small" color={ICON_MUTED} />
        </View>
      )}

      {blocks && hasMeasured && visibleBlocks && (
        <View className="flex-1 flex-col">
          <GestureDetector gesture={panGesture}>
            <View className="flex-1">
              <Animated.View className="flex-1" style={{ transform: [{ translateX: swipeTranslateX }] }}>
                <GestureDetector gesture={nativeScrollGesture}>
                  <ScrollView
                    key={scrollViewKey}
                    ref={scrollRef}
                    className="flex-1"
                    style={{ paddingLeft: readerPad.left, paddingRight: readerPad.right }}
                    // Short pages (last page of a chapter, few blocks) are
                    // vertically centered like a book page; overflowing pages
                    // keep top alignment and scroll.
                    contentContainerStyle={
                      immersive
                        ? { flexGrow: 1, justifyContent: 'center' }
                        : undefined
                    }
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                    onLayout={handleViewportLayout}
                    onContentSizeChange={(_w, h) => {
                      const overflow = h - viewportHeightRef.current;
                      setPageOverflow(overflow > 8);
                      if (viewportHeightRef.current <= 0) return;
                      if (overflow > 2 && Math.round(overflow) !== lastOverflowLogRef.current) {
                        lastOverflowLogRef.current = Math.round(overflow);
                        log(`[Reader] ⚠️ page overflow contentH=${Math.round(h)} viewportH=${Math.round(viewportHeightRef.current)} overflow=${Math.round(overflow)}px t=${Date.now()} — translation/page break taller than measured`);
                      }
                    }}
                  >
                    {/* The page column is clamped to the book measure and
                        centered (matching the pagination hook's clamped
                        contentWidth + the hidden measuring mirror). */}
                    <View style={{ width: contentWidth, alignSelf: 'center' }}>
                      {visibleBlocks.map((block, bi) =>
                        renderBlock(block, bi, blocks, visibleBlocks, tokenCache, blockTranslations, isTranslating, showTranslation, l2Code, l1Code, contentWidth, showTextActions, onOpenLink, highlight, textScale, zoomRem, translationSideBySide, handleBlockLayout, true, translationFactor, appliedSplit, onSplitChange, onSplitCommit, activeSentence, sentenceMapFor, getTokenPressHandler, lineGrids, getLineGridHandler, firstLineIndent, flipping, lazyPagination ? upgradedBlocks : undefined, hideSplitHandle, selectionDictionary, translationLeading, debugFontFamily, debugRubyFontFamily, debugRubyMetrics),
                      )}
                    </View>
                  </ScrollView>
                </GestureDetector>
              </Animated.View>
            </View>
          </GestureDetector>
        </View>
      )}

      {/* Immersive metadata overlays — muted chapter title (top strip) and
          page count (bottom strip). Non-interactive, never reflow the book.
          Their offsets are fixed inside the reserved strips (SPEC-085 §6.2):
          the title line starts reserve.top − 20 (= H + 12) from the screen
          top and the counter line bottom sits reserve.bottom − 24
          (= BAR_H + 8) above the screen bottom, so the chrome bars never
          cover them and toggling the chrome never moves them. */}
      {immersive && (
        <>
          {topOverlay && (
            <View
              pointerEvents="none"
              className="absolute inset-x-0 top-0 z-10 items-center px-4"
              style={{ paddingTop: immersiveReserve ? immersiveReserve.top - 20 : 10 }}
            >
              {topOverlay}
            </View>
          )}
          {pageInfoOverlay && (
            <View
              pointerEvents="none"
              className="absolute inset-x-0 bottom-0 z-10 items-center px-4"
              style={{ paddingBottom: immersiveReserve ? immersiveReserve.bottom - 24 : 10 }}
            >
              {pageInfoOverlay(page + 1, Math.max(1, totalPages))}
            </View>
          )}
        </>
      )}

      {/* Long-page scroll affordance: a floating down-arrow just above the
          page counter (or the bottom bar) when the current page overflows
          the viewport. Tapping scrolls to the bottom; hidden at the bottom
          and when the page fits. */}
      {pageOverflow && !atPageBottom && (
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 z-10 items-center"
          style={{ bottom: immersive ? (immersiveReserve?.bottom ?? 0) - 32 : 56 }}
        >
          <Pressable
            onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
            className="h-8 w-8 items-center justify-center rounded-full border border-border bg-background/90 active:bg-muted"
            accessibilityRole="button"
            accessibilityLabel={t('action.scroll_down')}
          >
            <ChevronDown size={16} color={ICON_MUTED} />
          </Pressable>
        </View>
      )}

      {/* Page navigation + translation switch — always present while a book is
          open so the measured viewport excludes it (web parity). The immersive
          reader floats it over the reserved bottom strip (slides away with the
          chrome); non-immersive readers keep it in flow. */}
      {blocks && (
        <Animated.View
          pointerEvents={immersive ? (chromeVisible ? 'auto' : 'none') : 'auto'}
          className={`flex-row items-center justify-center border-t border-border px-4 gap-3 ${
            immersive ? 'absolute inset-x-0 bottom-0' : 'flex-shrink-0'
          } ${!hasMeasured ? 'opacity-40' : ''}`}
          style={{
            paddingBottom: insets.bottom,
            paddingTop: 8,
            ...(immersive ? { transform: [{ translateY: barTranslateY }] } : undefined),
          }}
        >
          {hasMeasured ? (
            <Pressable onPress={prevPage} disabled={!hasPrev || !prevPage} className={`rounded p-1 ${!hasPrev || !prevPage ? 'opacity-30' : 'active:bg-muted'}`}>
              <ChevronLeft size={18} color={ICON_MUTED} />
            </Pressable>
          ) : (
            <ChevronLeft size={18} color={ICON_MUTED} />
          )}
          {hasMeasured ? (
            <Pressable onPress={handlePageNumberTap} disabled={!goToPage} className={`rounded px-2 py-0.5 ${!goToPage ? 'opacity-50' : 'active:bg-muted'}`}>
              <Text className="text-xs text-muted-foreground">{page + 1} / {totalPages}</Text>
            </Pressable>
          ) : (
            <Text className="text-xs text-muted-foreground">{page + 1} / {Math.max(1, totalPages)}</Text>
          )}
          {hasMeasured ? (
            <Pressable onPress={nextPage} disabled={!hasNext || !nextPage} className={`rounded p-1 ${!hasNext || !nextPage ? 'opacity-30' : 'active:bg-muted'}`}>
              <ChevronRight size={18} color={ICON_MUTED} />
            </Pressable>
          ) : (
            <ChevronRight size={18} color={ICON_MUTED} />
          )}
          {onToggleTranslation && (
            <View className="flex-row items-center gap-1.5 ml-3 pl-3 border-l border-border">
              <Text className="text-xs text-muted-foreground">{t('action.translation')}</Text>
              <Switch checked={showTranslation} onCheckedChange={onToggleTranslation} />
            </View>
          )}
          {onOpenToc && (
            <Pressable
              onPress={onOpenToc}
              className="rounded p-1 active:bg-muted ml-1"
              accessibilityLabel={t('action.table_of_contents')}
            >
              <List size={18} color={ICON_MUTED} />
            </Pressable>
          )}
          {onOpenSearch && (
            <Pressable
              onPress={onOpenSearch}
              className="rounded p-1 active:bg-muted"
              accessibilityLabel={t('action.search')}
            >
              <Search size={18} color={ICON_MUTED} />
            </Pressable>
          )}
        </Animated.View>
      )}

      {/* Hidden measuring view. Mounted only while an exact re-measure is
          actually in flight (or while a non-estimate reader is measuring),
          never as a standing window — a page with already-exact boundaries
          never pays a 320-block remount at commit. Skipped while flipping. */}
      {blocks && handleMeasureBlock && !flipping && (
        (measuring && measureEnd > measureStart)
        || (!hasMeasured && (measuredWindow > 0 || (measureStart === -1 && measureEnd === -1)))
      ) && (
        <View key={`measure-${measureStart}-${measureNonce}-${measureLineHeight}`} style={{ position: 'absolute', left: 0, width: contentWidth + readerPad.total, top: 0, opacity: 0, paddingLeft: readerPad.left, paddingRight: readerPad.right }} pointerEvents="none">
          {(() => {
            const hasLazyWindow = measureEnd > measureStart;
            const sliceStart = hasLazyWindow ? measureStart : 0;
            const sliceEnd = hasLazyWindow ? measureEnd : (measuredWindow > 0 ? measuredWindow : blocks.length);
            const measureKey = `${sliceStart}:${sliceEnd}:${measureNonce}:${measureLineHeight}`;
            if (measureWindowLogKeyRef.current !== measureKey) {
              measureWindowLogKeyRef.current = measureKey;
              log(`[Reader] 📏 hidden measuring window blocks=[${sliceStart},${sliceEnd}) t=${Date.now()}`);
            }
            return blocks.slice(sliceStart, sliceEnd).map((block, bi) =>
              renderMeasuringBlock(
                block,
                sliceStart + bi,
                handleMeasureBlock,
                sliceStart,
                showTranslation,
                l2Code,
                l1Code,
                contentWidth,
                showTextActions,
                measureTextStyle,
                translationSideBySide,
                appliedSplit,
                firstLineIndent,
                readerPad.left,
              ),
            );
          })()}
        </View>
      )}
    </TapSurfaceView>
  );
}

/**
 * Full-area blank-tap surface for the immersive reader (SPEC-085 §5.3):
 * renders as a Pressable covering the whole padded container when
 * `tapSurface` is true — so blank-space taps, including the reserved strips
 * and the empty page area below the last paragraph, toggle the chrome — and
 * as a plain View otherwise. Deeper interactive Pressables (tokens, links,
 * bar controls) always win the touch.
 */
function TapSurfaceView({
  tapSurface,
  onPress,
  style,
  children,
}: {
  tapSurface: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (tapSurface) {
    return (
      <Pressable onPress={onPress} className="flex-1 flex-col active:bg-transparent" style={style}>
        {children}
      </Pressable>
    );
  }
  return (
    <View className="flex-1 flex-col" style={style}>
      {children}
    </View>
  );
}

// ── Block rendering helpers ──

function renderBlock(
  block: ContentBlock, bi: number, allBlocks: ContentBlock[],
  visibleBlocks: ContentBlock[], tokenCache: Record<number, LemmatizedToken[]>,
  blockTranslations: Record<number, string>, isTranslating: boolean, showTranslation: boolean,
  l2Code: string, l1Code: string, contentWidth: number,
  showTextActions: boolean, onOpenLink?: (href: string) => void,
  highlight?: { blockIndex: number; start: number; end: number } | null,
  textScale?: number,
  zoomRem = 1,
  translationSideBySide = false,
  onBlockLayout?: (globalIdx: number, top: number, height: number) => void,
  deferTokenization = false,
  translationFactor = 0.8,
  translationSplit = 0.6,
  onSplitChange?: (r: number) => void,
  onSplitCommit?: (r: number) => void,
  activeSentence?: { blockIndex: number; sentenceIndex: number } | null,
  sentenceMapFor?: (globalIdx: number, text: string, translation: string) => SentenceMap | null,
  getTokenPressHandler?: (globalIdx: number) => (range: { start: number; end: number } | null) => void,
  lineGrids?: Record<number, GridLine[]>,
  getLineGridHandler?: (globalIdx: number) => (lines: GridLine[]) => void,
  firstLineIndent = false,
  plainText = false,
  upgradedBlocks?: ReadonlySet<number>,
  hideSplitHandle = false,
  selectionDictionary = false,
  translationLeading = 1.625,
  debugFontFamily: string | null = null,
  debugRubyFontFamily: string | null = null,
  debugRubyMetrics = false,
) {
  const scale = textScale ?? 1;
  const blockScale = scale * zoomRem;
  const globalIdx = allBlocks.indexOf(block);
  // A block renders plain while flipping, or (lazy reader) until its slot in
  // the progressive tokenized upgrade has been reached.
  const isPlain = plainText || (upgradedBlocks !== undefined && !upgradedBlocks.has(globalIdx));

  if (block.kind === 'image') {
    return (
      <View
        key={bi}
        className="my-3 items-center"
        onLayout={onBlockLayout ? (e) => onBlockLayout(globalIdx, e.nativeEvent.layout.y, e.nativeEvent.layout.height) : undefined}
      >
        <Image source={{ uri: block.uri }} style={{ width: '100%', height: contentWidth * 0.6 }} resizeMode="contain" />
      </View>
    );
  }

  if (block.kind === 'table') {
    return (
      <View
        key={bi}
        className="mb-3 overflow-hidden rounded-lg border border-border"
        onLayout={onBlockLayout ? (e) => onBlockLayout(globalIdx, e.nativeEvent.layout.y, e.nativeEvent.layout.height) : undefined}
      >
        {/* Header row */}
        <View className="flex-row bg-muted/50">
          {block.header.map((cell, ci) => (
            <View key={ci} className={`px-2 py-1.5 ${ci < block.header.length - 1 ? 'border-r border-border' : ''}`} style={{ flex: 1 }}>
              <Text className="text-xs font-semibold text-foreground"><TokenizedText text={cell} l2Code={l2Code} tokens={tokenCache[globalIdx] ? tokenCache[globalIdx] : undefined} deferTokenization={deferTokenization} textScale={scale} /></Text>
            </View>
          ))}
        </View>
        {/* Data rows */}
        {block.rows.map((row, ri) => (
          <View key={ri} className={`flex-row ${ri < block.rows.length - 1 ? 'border-b border-border' : ''}`}>
            {row.map((cell, ci) => (
              <View key={ci} className={`px-2 py-1.5 ${ci < row.length - 1 ? 'border-r border-border' : ''}`} style={{ flex: 1 }}>
                <TokenizedText text={cell} l2Code={l2Code} tokens={tokenCache[globalIdx] ? tokenCache[globalIdx] : undefined} deferTokenization={deferTokenization} textScale={scale} />
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  // ── Non-text block kinds (SPEC-083): code / hr / raw html — measured like
  //    every other block so pagination stays exact.
  if (block.kind === 'code') {
    return (
      <View
        key={bi}
        className="my-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
        onLayout={onBlockLayout ? (e) => onBlockLayout(globalIdx, e.nativeEvent.layout.y, e.nativeEvent.layout.height) : undefined}
      >
        <Text className="font-mono text-xs leading-relaxed text-foreground">{block.text}</Text>
      </View>
    );
  }
  if (block.kind === 'hr') {
    return (
      <View
        key={bi}
        className="my-3 h-px bg-border"
        onLayout={onBlockLayout ? (e) => onBlockLayout(globalIdx, e.nativeEvent.layout.y, e.nativeEvent.layout.height) : undefined}
      />
    );
  }
  if (block.kind === 'html') {
    return (
      <View
        key={bi}
        className="my-2 rounded-lg bg-muted/40 px-3 py-2"
        onLayout={onBlockLayout ? (e) => onBlockLayout(globalIdx, e.nativeEvent.layout.y, e.nativeEvent.layout.height) : undefined}
      >
        <Text className="font-mono text-xs leading-relaxed text-muted-foreground">{block.text}</Text>
      </View>
    );
  }

  const visibleTextBlocks = visibleBlocks.filter(isReaderTextBlock);
  const localIdx = visibleTextBlocks.indexOf(block as TextBlock);
  const translation = localIdx >= 0 ? blockTranslations[localIdx] : undefined;
  const cachedTokens = tokenCache[globalIdx];

  // ── Translation display transition (per block, once per state) ──
  // Logs when a visible paragraph first renders without a translation
  // ("pending") and again when the translation appears ("shown").
  if (showTranslation && localIdx >= 0) {
    const shown = !!translation;
    if (displayLoggedState.get(block) !== shown) {
      displayLoggedState.set(block, shown);
      translationLogger.log(
        `display block=${globalIdx} local=${localIdx} ${shown ? 'shown' : 'pending'}`
        + ` srcChars=${block.text.length}${shown ? ` trChars=${translation?.length ?? 0}` : ''}`,
      );
    }
  }

  // ── Body block content (tokenized text + optional translation) ──
  const bodyContent = (type: 'paragraph' | 'blockquote' | 'list-item' | 'heading') => {
    // IMPORTANT: keep this a stable reference when there is no link/highlight
    // formatting. `?? []` created a fresh array every render, which defeated
    // TokenizedText's memoization and re-rendered the whole reader page
    // (thousands of token Views) on every scroll/sync update.
    const formats = block.formats ?? undefined;
    const effectiveFormats =
      highlight && block.kind === 'text' && highlight.blockIndex === globalIdx
        ? [...(formats ?? []), { start: highlight.start, end: highlight.end, type: 'highlight' as const }]
        : formats;
    // Heading blocks scale by heading depth (web: text-2xl/xl/lg × zoom);
    // the translation inherits the same relative size (SPEC-082 Task 1).
    const headingFactor = block.type === 'heading'
      ? (block.depth === 1 ? 1.5 : block.depth === 2 ? 1.25 : block.depth === 3 ? 1.125 : 1)
      : 1;
    const tokenEl = (
          <TokenizedText
            text={isPlain && firstLineIndent && block.type === 'paragraph' ? `\u3000${block.text}` : block.text}
            l2Code={l2Code}
            tokens={isPlain ? undefined : cachedTokens}
            deferTokenization={deferTokenization}
            formats={effectiveFormats}
            onOpenLink={onOpenLink}
            onTokenPress={getTokenPressHandler?.(globalIdx)}
            onLineGrid={getLineGridHandler?.(globalIdx)}
            leadingIndent={firstLineIndent && block.type === 'paragraph'}
            textScale={scale * headingFactor}
            debugFontFamily={debugFontFamily}
            debugRubyFontFamily={debugRubyFontFamily}
            debugRubyMetrics={debugRubyMetrics}
            bold={block.type === 'heading'}
            selectionDictionary={selectionDictionary}
          />
    );
    // SPEC-082 Task 4: when a translation sentence is active for this block,
    // tint the paired translation sentence's char range.
    let highlightedTranslation: React.ReactNode = translation;
    let trHighlightRange: { start: number; end: number } | null = null;
    if (translation && activeSentence && activeSentence.blockIndex === globalIdx && sentenceMapFor) {
      const map = sentenceMapFor(globalIdx, block.text, translation);
      const pair = map?.pairs[activeSentence.sentenceIndex];
      if (pair && pair.tr.start < pair.tr.end) {
        trHighlightRange = { start: pair.tr.start, end: pair.tr.end };
        highlightedTranslation = (
          <Text>
            {translation.slice(0, pair.tr.start)}
            {/* The active translation sentence must read clearly in dark
                mode: stronger primary background + primary foreground
                (bg-primary/15 alone was invisible on dark backgrounds). */}
            <Text className="bg-primary/25 text-primary">{translation.slice(pair.tr.start, pair.tr.end)}</Text>
            {translation.slice(pair.tr.end)}
          </Text>
        );
      }
    }
    const trFontSize = translationFactor * 14 * blockScale * headingFactor;
    // SPEC-082 web AlignedTranslation parity: when the block's L2 text has
    // reported its measured line grid, the side-by-side translation renders
    // line-by-line on the L2 grid (each line's baseline = the L2 line's
    // baseline). Falls back to the plain column when no grid is available
    // (non-paragraph render paths, e.g. Expo Go / Android view columns).
    const l2Grid = translationSideBySide ? lineGrids?.[globalIdx] : undefined;
    // Narrow-screen (stacked) translation typography — matches the L2 text:
    // the SAME leading ratio (user setting, not a fixed leading-relaxed) and
    // the same first-line indentation (the \u3000 the tokenized text starts
    // with when firstLineIndent is on, so the translation aligns under it).
    const trLineHeight = Math.round(trFontSize * translationLeading);
    const indentPrefix = firstLineIndent && block.type === 'paragraph' ? '\u3000' : '';
    const transEl = isPlain && showTranslation ? (
      // During rapid flipping the translation is deferred, but the skeleton
      // stays visible immediately so the reader doesn't look broken; show the
      // real translation once it has arrived (pause window).
      translation ? (
        <Text className="mt-2 text-sm text-muted-foreground" style={{ fontSize: trFontSize, lineHeight: trLineHeight }}>{indentPrefix}{translation}</Text>
      ) : (
        <View className="mt-2">
          <TranslationSkeleton text={block.text} />
        </View>
      )
    ) : showTranslation && highlightedTranslation ? (
      l2Grid && l2Grid.length > 0 ? (
        <AlignedTranslation
          text={translation ?? ''}
          l2Lines={l2Grid}
          trFontSize={trFontSize}
          trLineHeight={trLineHeight}
          className="text-muted-foreground"
          highlight={trHighlightRange}
        />
      ) : (
        <Text className="mt-2 text-sm text-muted-foreground" style={{ fontSize: trFontSize, lineHeight: trLineHeight }}>{indentPrefix}{highlightedTranslation}</Text>
      )
    ) : showTranslation && isTranslating ? (
      <View className="mt-2">
        <TranslationSkeleton text={block.text} />
      </View>
    ) : null;
    const sideBySide = translationSideBySide && transEl;
    // SPEC-082 Task 3: resizable text|translation split. The handle renders
    // between the columns when a change handler is wired (side-by-side active).
    const splitHandle = sideBySide && onSplitChange ? (
      <TranslationSplitHandle
        ratio={translationSplit}
        rowWidth={contentWidth}
        onChange={onSplitChange}
        onCommit={onSplitCommit}
        hidden={hideSplitHandle}
      />
    ) : null;
    const l2Style = { flex: translationSplit } as const;
    const trStyle = { flex: 1 - translationSplit } as const;
    // Reader layout rule: the side-by-side gap equals this row's text leading
    // (the row's own rendered line-height). With the split handle between the
    // columns (16px bar with −4px margins → 8px net inside the row gaps), the
    // visible text|translation distance is 2×gap + 8, so solve the gap for
    // that distance to equal the leading. Without a handle the gap is the
    // leading directly.
    const rowLeadingPx = Math.round(16 * blockScale * headingFactor * translationLeading);
    const sideGap = splitHandle ? Math.max(0, (rowLeadingPx - 8) / 2) : rowLeadingPx;

    switch (type) {
      case 'paragraph':
        return sideBySide ? (
          <View className="flex-row items-start" style={{ gap: sideGap }}>
            <View className="min-w-0" style={l2Style}>{tokenEl}</View>
            {splitHandle}
            <View className="min-w-0" style={trStyle}>{transEl}</View>
          </View>
        ) : (
          <View>{tokenEl}{transEl}</View>
        );
      case 'blockquote':
        return sideBySide ? (
          <View className="border-l-2 border-muted-foreground/30 pl-3">
            <View className="flex-row items-start" style={{ gap: sideGap }}>
              <View className="min-w-0" style={l2Style}>{tokenEl}</View>
              {splitHandle}
              <View className="min-w-0" style={trStyle}>{transEl}</View>
            </View>
          </View>
        ) : (
          <View className="border-l-2 border-muted-foreground/30 pl-3">{tokenEl}{transEl}</View>
        );
      case 'list-item': {
        const depth = block.listDepth ?? 0;
        const marker = block.ordered === true
          ? `${(block.start ?? 1) + listItemOrdinal(block, allBlocks)}.`
          : LIST_BULLETS[Math.min(depth, LIST_BULLETS.length - 1)];
        return (
          <View style={{ paddingLeft: 8 + depth * 16 }}>
            <View className="flex-row"><Text className="mr-2 text-muted-foreground">{marker}</Text>
              <View className="flex-1">{tokenEl}</View>
            </View>
            {transEl}
          </View>
        );
      }
      case 'heading':
        return sideBySide ? (
          <View className="flex-row items-start" style={{ gap: sideGap }}>
            <View className="min-w-0" style={l2Style}>{tokenEl}</View>
            {splitHandle}
            <View className="min-w-0" style={trStyle}>{transEl}</View>
          </View>
        ) : (
          <View>{tokenEl}{transEl}</View>
        );
    }
  };

  return (
    <View
      key={bi}
      className="mb-3"
      onLayout={onBlockLayout ? (e) => onBlockLayout(globalIdx, e.nativeEvent.layout.y, e.nativeEvent.layout.height) : undefined}
    >
      {block.type === 'heading' && (
        showTextActions ? (
          <TextActionMenu text={block.text} l2Code={l2Code} l1Code={l1Code}>
            {bodyContent('heading')}
          </TextActionMenu>
        ) : bodyContent('heading')
      )}
      {block.type === 'paragraph' && (
        showTextActions ? (
          <TextActionMenu text={block.text} l2Code={l2Code} l1Code={l1Code}>
            {bodyContent('paragraph')}
          </TextActionMenu>
        ) : bodyContent('paragraph')
      )}
      {block.type === 'blockquote' && (
        showTextActions ? (
          <TextActionMenu text={block.text} l2Code={l2Code} l1Code={l1Code}>
            {bodyContent('blockquote')}
          </TextActionMenu>
        ) : bodyContent('blockquote')
      )}
      {block.type === 'list-item' && (
        showTextActions ? (
          <TextActionMenu text={block.text} l2Code={l2Code} l1Code={l1Code}>
            {bodyContent('list-item')}
          </TextActionMenu>
        ) : bodyContent('list-item')
      )}
    </View>
  );
}

/** Static skeleton used inside the hidden measuring view — same footprint as
 *  TranslationSkeleton, but no pulse animation (240 hidden bars animating
 *  would be pure overhead). */
function MeasuringSkeleton({ text }: { text: string }) {
  const widths: DimensionValue[] = ['90%', '75%', '60%', '80%', '50%'];
  return (
    <View className="gap-y-1.5">
      {Array.from({ length: Math.max(1, Math.ceil(text.length / 50)) }).map((_, li) => (
        <View key={li} className="h-3.5 rounded bg-muted" style={{ width: widths[li % widths.length] }} />
      ))}
    </View>
  );
}

function renderMeasuringBlock(
  block: ContentBlock, bi: number,
  handleMeasureBlock: (i: number, h: number, top: number, origin: number) => void,
  origin: number,
  showTranslation: boolean, l2Code: string, l1Code: string, contentWidth: number,
  showTextActions: boolean,
  measureTextStyle: { fontSize: number; lineHeight: number; fontFamily?: string },
  translationSideBySide = false,
  translationSplit = 0.6,
  firstLineIndent = false,
  /** Side-by-side mirror gap (px): the visible row's text|translation distance
   *  (= the text's leading). The mirror has no split handle, so this is the
   *  full leading — keeps the L2 column width identical to the visible row. */
  measureGap = 16,
) {
  /** Mirrors TextActionMenu's persistent ⋮ button column so short body
   *  blocks don't measure shorter than they render. */
  const withActionSpacer = (content: React.ReactNode) => (
    showTextActions ? (
      <View className="flex-row items-start gap-1">
        <View className="flex-1 min-w-0">{content}</View>
        <View className="mt-1 h-7 w-7 shrink-0" />
      </View>
    ) : content
  );

  if (block.kind === 'image') {
    return (
      <View key={`m-${bi}`} onLayout={(e) => handleMeasureBlock(bi, e.nativeEvent.layout.height, e.nativeEvent.layout.y, origin)} className="my-3">
        <Image source={{ uri: block.uri }} style={{ width: contentWidth, height: contentWidth * 0.6 }} resizeMode="contain" />
      </View>
    );
  }

  if (block.kind === 'table') {
    return (
      <View key={`m-${bi}`} onLayout={(e) => handleMeasureBlock(bi, e.nativeEvent.layout.height, e.nativeEvent.layout.y, origin)} className="mb-3 overflow-hidden rounded-lg border border-border">
        <View className="flex-row bg-muted/50">
          {block.header.map((cell, ci) => (
            <View key={ci} className={`px-2 py-1.5 ${ci < block.header.length - 1 ? 'border-r border-border' : ''}`} style={{ flex: 1 }}>
              <Text className="text-xs font-semibold text-foreground">{cell}</Text>
            </View>
          ))}
        </View>
        {block.rows.map((row, ri) => (
          <View key={ri} className={`flex-row ${ri < block.rows.length - 1 ? 'border-b border-border' : ''}`}>
            {row.map((cell, ci) => (
              <View key={ci} className={`px-2 py-1.5 ${ci < row.length - 1 ? 'border-r border-border' : ''}`} style={{ flex: 1 }}>
                <Text className="text-xs text-foreground">{cell}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  if (block.kind === 'code') {
    return (
      <View key={`m-${bi}`} onLayout={(e) => handleMeasureBlock(bi, e.nativeEvent.layout.height, e.nativeEvent.layout.y, origin)} className="my-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <Text className="font-mono text-xs leading-relaxed text-foreground">{block.text}</Text>
      </View>
    );
  }

  if (block.kind === 'hr') {
    return (
      <View key={`m-${bi}`} onLayout={(e) => handleMeasureBlock(bi, e.nativeEvent.layout.height, e.nativeEvent.layout.y, origin)} className="my-3 h-px bg-border" />
    );
  }

  if (block.kind === 'html') {
    return (
      <View key={`m-${bi}`} onLayout={(e) => handleMeasureBlock(bi, e.nativeEvent.layout.height, e.nativeEvent.layout.y, origin)} className="my-2 rounded-lg bg-muted/40 px-3 py-2">
        <Text className="font-mono text-xs leading-relaxed text-muted-foreground">{block.text}</Text>
      </View>
    );
  }

  return (
    <View key={`m-${bi}`} onLayout={(e) => handleMeasureBlock(bi, e.nativeEvent.layout.height, e.nativeEvent.layout.y, origin)} className="mb-3">
      {block.type === 'heading' && <Text className={`mb-2 font-bold text-foreground ${block.depth === 1 ? 'text-xl' : block.depth === 2 ? 'text-lg' : 'text-base'}`}>{block.text}</Text>}
      {block.type === 'paragraph' && withActionSpacer(
        translationSideBySide && showTranslation ? (
          <View className="flex-row items-start" style={{ gap: measureGap }}>
            <View className="min-w-0" style={{ flex: translationSplit }}><Text style={measureTextStyle} className="text-foreground">{firstLineIndent ? '\u3000' : ''}{block.text}</Text></View>
            <View className="min-w-0" style={{ flex: 1 - translationSplit }}><MeasuringSkeleton text={block.text} /></View>
          </View>
        ) : (
          <View>
            <Text style={measureTextStyle} className="text-foreground">{firstLineIndent ? '\u3000' : ''}{block.text}</Text>
            {showTranslation && <View className="mt-1"><MeasuringSkeleton text={block.text} /></View>}
          </View>
        )
      )}
      {block.type === 'blockquote' && withActionSpacer(
        translationSideBySide && showTranslation ? (
          <View className="border-l-2 border-muted-foreground/30 pl-3">
            <View className="flex-row items-start" style={{ gap: measureGap }}>
              <View className="min-w-0" style={{ flex: translationSplit }}><Text style={measureTextStyle} className="text-foreground">{block.text}</Text></View>
              <View className="min-w-0" style={{ flex: 1 - translationSplit }}><MeasuringSkeleton text={block.text} /></View>
            </View>
          </View>
        ) : (
          <View className="border-l-2 border-muted-foreground/30 pl-3">
            <Text style={measureTextStyle} className="text-foreground">{block.text}</Text>
            {showTranslation && <View className="mt-1"><MeasuringSkeleton text={block.text} /></View>}
          </View>
        )
      )}
      {block.type === 'list-item' && withActionSpacer(
        <View>
          <View className="flex-row"><Text className="mr-2 text-muted-foreground">•</Text>
            <View className="flex-1"><Text style={measureTextStyle} className="text-foreground">{block.text}</Text></View>
          </View>
          {showTranslation && <View className="ml-4 mt-1"><MeasuringSkeleton text={block.text} /></View>}
        </View>
      )}
    </View>
  );
}
