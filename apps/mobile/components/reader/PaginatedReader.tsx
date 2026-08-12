import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, Image, ActivityIndicator, ScrollView, Alert, Platform,
  type DimensionValue, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TokenizedText } from '@/components/TokenizedText';
import { TextActionMenu } from '@/components/TextActionMenu';
import { TranslationSkeleton } from '@/components/reader/TranslationSkeleton';
import { Root as Switch } from '@/components/ui/switch';
import type { ContentBlock, TextBlock } from '@/lib/parse-markdown';
import type { LemmatizedToken } from '@langplayer/shared';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { readerLogger, translationLogger } from '@/lib/logger';

const { log } = readerLogger;
const displayLoggedState = new WeakMap<ContentBlock, boolean>();

/** Tokenize blocks within this many px of the viewport (web parity: 200px rootMargin). */
const VISIBILITY_BUFFER = 200;

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
  /** Text scale for reader blocks (0 = fixed 16px; 1 = user zoom). */
  textScale?: number;
  /** Reports global block indices currently near the viewport (lazy tokenization). */
  onVisibleBlocksChange?: (globalIndices: number[]) => void;
  /** True while the current page's paragraphs are being translated (skeleton bars). */
  isTranslating?: boolean;
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
  textScale = 0,
  onVisibleBlocksChange,
  l2Code, l1Code, showTranslation = false, onToggleTranslation,
  showTextActions = false, translationSideBySide = false, scrollMode = false, t,
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
      log(`[Reader] 🐢 RENDER took ${elapsed}ms renders=${n} blocks=${(scrollMode ? blocks : visibleBlocksProp)?.length ?? 0}`);
    }
  });

  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const blockLayoutsRef = useRef<Record<number, { top: number; height: number }>>({});
  const lastVisibleKeyRef = useRef('');
  const measureWindowLogKeyRef = useRef('');
  const onVisibleBlocksChangeRef = useRef(onVisibleBlocksChange);
  onVisibleBlocksChangeRef.current = onVisibleBlocksChange;
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
    reportVisible();
  }, [reportVisible]);

  const handleViewportLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    if (h > 0 && h !== viewportHeightRef.current) {
      viewportHeightRef.current = h;
      reportVisible();
    }
    // Real page-display area (width/height) — the pagination hook uses this
    // instead of guessing chrome/padding from window dimensions.
    if (width > 0 && h > 0) {
      log(`[Reader] 📐 reader viewport ${width}x${h}`);
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
  const hasMeasured = scrollMode ? true : hasMeasuredProp;
  const contentWidth = scrollMode ? 300 : contentWidthProp;
  const loadingTokens = scrollMode ? false : (loadingTokensProp ?? false);
  const hasPrev = scrollMode ? false : (hasPrevProp ?? page > 0);
  const hasNext = scrollMode ? false : (hasNextProp ?? page < totalPages - 1);
  const insets = useSafeAreaInsets();

  // ── Scroll mode: simple block list ──
  if (scrollMode) {
    if (!blocks) return null;
    return (
      <View className="flex-1">
        <View className="px-4">
          {blocks.map((block, bi) =>
              renderBlock(block, bi, blocks, blocks, tokenCache, blockTranslations, isTranslating, showTranslation, l2Code, l1Code, contentWidth, showTextActions, onOpenLink, highlight, textScale, translationSideBySide, undefined, false),
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
  return (
    <View className="flex-1 flex-col">
      {blocks && !hasMeasured && (
        <View className="flex-1 items-center justify-center" onLayout={handleViewportLayout}>
          <ActivityIndicator size="small" color={ICON_MUTED} />
        </View>
      )}

      {blocks && hasMeasured && visibleBlocks && (
        <View className="flex-1 flex-col">
          <ScrollView
            key={scrollViewKey}
            ref={scrollRef}
            className="flex-1 px-4"
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onLayout={handleViewportLayout}
          >
            {/* Loading indicator — inside the scroll content (web parity) so
                it doesn't resize the measured viewport. */}
            {loadingTokens && (
              <View className="flex-row items-center justify-center gap-2 py-2">
                <Loader2 size={12} color={ICON_MUTED} />
                <Text className="text-xs text-muted-foreground">{t('msg.making_words_interactive')}</Text>
              </View>
            )}
            {visibleBlocks.map((block, bi) =>
              renderBlock(block, bi, blocks, visibleBlocks, tokenCache, blockTranslations, isTranslating, showTranslation, l2Code, l1Code, contentWidth, showTextActions, onOpenLink, highlight, textScale, translationSideBySide, handleBlockLayout, true),
            )}
          </ScrollView>
        </View>
      )}

      {/* Page navigation + translation switch — always present while a book is
          open so the measured viewport excludes it (web parity). */}
      {blocks && !hasMeasured && (
        <View className="flex-shrink-0 flex-row items-center justify-center border-t border-border px-4 gap-3 opacity-40" style={{ paddingBottom: insets.bottom, paddingTop: 8 }}>
          <ChevronLeft size={18} color={ICON_MUTED} />
          <Text className="text-xs text-muted-foreground">{page + 1} / {Math.max(1, totalPages)}</Text>
          <ChevronRight size={18} color={ICON_MUTED} />
          {onToggleTranslation && (
            <View className="flex-row items-center gap-1.5 ml-3 pl-3 border-l border-border">
              <Text className="text-xs text-muted-foreground">{t('action.translation')}</Text>
              <Switch checked={showTranslation} onCheckedChange={onToggleTranslation} />
            </View>
          )}
        </View>
      )}
      {blocks && hasMeasured && (
        <View className="flex-shrink-0 flex-row items-center justify-center border-t border-border px-4 gap-3" style={{ paddingBottom: insets.bottom, paddingTop: 8 }}>
          <Pressable onPress={prevPage} disabled={!hasPrev || !prevPage} className={`rounded p-1 ${!hasPrev || !prevPage ? 'opacity-30' : 'active:bg-muted'}`}>
            <ChevronLeft size={18} color={ICON_MUTED} />
          </Pressable>
          <Pressable onPress={handlePageNumberTap} disabled={!goToPage} className={`rounded px-2 py-0.5 ${!goToPage ? 'opacity-50' : 'active:bg-muted'}`}>
            <Text className="text-xs text-muted-foreground">{page + 1} / {totalPages}</Text>
          </Pressable>
          <Pressable onPress={nextPage} disabled={!hasNext || !nextPage} className={`rounded p-1 ${!hasNext || !nextPage ? 'opacity-30' : 'active:bg-muted'}`}>
            <ChevronRight size={18} color={ICON_MUTED} />
          </Pressable>
          {onToggleTranslation && (
            <View className="flex-row items-center gap-1.5 ml-3 pl-3 border-l border-border">
              <Text className="text-xs text-muted-foreground">{t('action.translation')}</Text>
              <Switch checked={showTranslation} onCheckedChange={onToggleTranslation} />
            </View>
          )}
        </View>
      )}

      {/* Hidden measuring view. Non-lazy readers render it while measuring;
          lazy readers keep a window mounted so forward/backward page breaks
          can be measured ahead and cached. */}
      {blocks && handleMeasureBlock && (
        measureEnd > measureStart
        || (!hasMeasured && (measuredWindow > 0 || (measureStart === -1 && measureEnd === -1)))
      ) && (
        <View key={`measure-${measureStart}-${measureNonce}`} style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }} pointerEvents="none" className="px-4">
          {(() => {
            const hasLazyWindow = measureEnd > measureStart;
            const sliceStart = hasLazyWindow ? measureStart : 0;
            const sliceEnd = hasLazyWindow ? measureEnd : (measuredWindow > 0 ? measuredWindow : blocks.length);
            const measureKey = `${sliceStart}:${sliceEnd}:${measureNonce}`;
            if (measureWindowLogKeyRef.current !== measureKey) {
              measureWindowLogKeyRef.current = measureKey;
              log(`[Reader] 📏 hidden measuring window blocks=[${sliceStart},${sliceEnd})`);
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
                textScale,
                translationSideBySide,
              ),
            );
          })()}
        </View>
      )}
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
  translationSideBySide = false,
  onBlockLayout?: (globalIdx: number, top: number, height: number) => void,
  deferTokenization = false,
) {
  const scale = textScale ?? 0;
  const globalIdx = allBlocks.indexOf(block);

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

  const visibleTextBlocks = visibleBlocks.filter(
    (b): b is TextBlock => b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item'),
  );
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
      translationLogger.log(`display block=${globalIdx} local=${localIdx} ${shown ? 'shown' : 'pending'}`);
    }
  }

  // ── Body block content (tokenized text + optional translation) ──
  const bodyContent = (type: 'paragraph' | 'blockquote' | 'list-item') => {
    // IMPORTANT: keep this a stable reference when there is no link/highlight
    // formatting. `?? []` created a fresh array every render, which defeated
    // TokenizedText's memoization and re-rendered the whole reader page
    // (thousands of token Views) on every scroll/sync update.
    const formats = block.formats ?? undefined;
    const effectiveFormats =
      highlight && block.kind === 'text' && highlight.blockIndex === globalIdx
        ? [...(formats ?? []), { start: highlight.start, end: highlight.end, type: 'highlight' as const }]
        : formats;
    const tokenEl = (
          <TokenizedText
            text={block.text}
            l2Code={l2Code}
            tokens={cachedTokens}
            deferTokenization={deferTokenization}
            formats={effectiveFormats}
            onOpenLink={onOpenLink}
            textScale={scale}
          />
    );
    const transEl = showTranslation && translation ? (
      <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">{translation}</Text>
    ) : showTranslation && isTranslating ? (
      <View className="mt-1">
        <TranslationSkeleton text={block.text} />
      </View>
    ) : null;
    const sideBySide = translationSideBySide && transEl;

    switch (type) {
      case 'paragraph':
        return sideBySide ? (
          <View className="flex-row items-start gap-4">
            <View className="min-w-0 flex-[3]">{tokenEl}</View>
            <View className="min-w-0 flex-[2]">{transEl}</View>
          </View>
        ) : (
          <View>{tokenEl}{transEl}</View>
        );
      case 'blockquote':
        return sideBySide ? (
          <View className="border-l-2 border-muted-foreground/30 pl-3">
            <View className="flex-row items-start gap-4">
              <View className="min-w-0 flex-[3]">{tokenEl}</View>
              <View className="min-w-0 flex-[2]">{transEl}</View>
            </View>
          </View>
        ) : (
          <View className="border-l-2 border-muted-foreground/30 pl-3">{tokenEl}{transEl}</View>
        );
      case 'list-item':
        return (
          <View>
            <View className="flex-row"><Text className="mr-2 text-muted-foreground">•</Text>
              <View className="flex-1">{tokenEl}</View>
            </View>
            {transEl}
          </View>
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
        <Text className={`mb-2 font-bold text-foreground ${block.depth === 1 ? 'text-xl' : block.depth === 2 ? 'text-lg' : 'text-base'}`}>{block.text}</Text>
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
  textScale: number,
  translationSideBySide = false,
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

  return (
    <View key={`m-${bi}`} onLayout={(e) => handleMeasureBlock(bi, e.nativeEvent.layout.height, e.nativeEvent.layout.y, origin)} className="mb-3">
      {block.type === 'heading' && <Text className={`mb-2 font-bold text-foreground ${block.depth === 1 ? 'text-xl' : block.depth === 2 ? 'text-lg' : 'text-base'}`}>{block.text}</Text>}
      {block.type === 'paragraph' && withActionSpacer(
        translationSideBySide && showTranslation ? (
          <View className="flex-row items-start gap-4">
            <View className="min-w-0 flex-[3]"><TokenizedText text={block.text} l2Code={l2Code} tokens={[]} textScale={textScale} /></View>
            <View className="min-w-0 flex-[2]"><MeasuringSkeleton text={block.text} /></View>
          </View>
        ) : (
          <View>
            <TokenizedText text={block.text} l2Code={l2Code} tokens={[]} textScale={textScale} />
            {showTranslation && <View className="mt-1"><MeasuringSkeleton text={block.text} /></View>}
          </View>
        )
      )}
      {block.type === 'blockquote' && withActionSpacer(
        translationSideBySide && showTranslation ? (
          <View className="border-l-2 border-muted-foreground/30 pl-3">
            <View className="flex-row items-start gap-4">
              <View className="min-w-0 flex-[3]"><TokenizedText text={block.text} l2Code={l2Code} tokens={[]} textScale={textScale} /></View>
              <View className="min-w-0 flex-[2]"><MeasuringSkeleton text={block.text} /></View>
            </View>
          </View>
        ) : (
          <View className="border-l-2 border-muted-foreground/30 pl-3">
            <TokenizedText text={block.text} l2Code={l2Code} tokens={[]} textScale={textScale} />
            {showTranslation && <View className="mt-1"><MeasuringSkeleton text={block.text} /></View>}
          </View>
        )
      )}
      {block.type === 'list-item' && withActionSpacer(
        <View>
          <View className="flex-row"><Text className="mr-2 text-muted-foreground">•</Text>
            <View className="flex-1"><TokenizedText text={block.text} l2Code={l2Code} tokens={[]} textScale={textScale} /></View>
          </View>
          {showTranslation && <View className="ml-4 mt-1"><MeasuringSkeleton text={block.text} /></View>}
        </View>
      )}
    </View>
  );
}
