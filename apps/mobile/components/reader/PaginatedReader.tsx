import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, View, Text, Image, ActivityIndicator, ScrollView, Alert, Platform, useWindowDimensions,
  type DimensionValue, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isPhoneticsEligible } from '@langplayer/utils';
import { TokenizedText } from '@/components/TokenizedText';
import { TextActionMenu } from '@/components/TextActionMenu';
import { TranslationSkeleton } from '@/components/reader/TranslationSkeleton';
import { Root as Switch } from '@/components/ui/switch';
import { useSettingsContext } from '@/contexts/SettingsContext';
import type { ContentBlock, TextBlock } from '@/lib/parse-markdown';
import type { LemmatizedToken } from '@langplayer/shared';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { ZOOM_TO_REM } from '@/lib/text-scale';
import { readerLogger, translationLogger } from '@/lib/logger';
import {
  calibrationSignature,
  cacheCalibration,
  deriveCalibration,
  getCachedCalibration,
  type TokenizedTextCalibration,
} from '@/lib/tokenized-text-calibration';

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
  /** Text scale for reader blocks (1 = user zoom, SPEC-051). */
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
  textScale = 1,
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
      log(`[Reader] 🐢 RENDER took ${elapsed}ms renders=${n} blocks=${(scrollMode ? blocks : visibleBlocksProp)?.length ?? 0} t=${Date.now()}`);
    }
  });

  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const blockLayoutsRef = useRef<Record<number, { top: number; height: number }>>({});
  const lastVisibleKeyRef = useRef('');
  const measureWindowLogKeyRef = useRef('');
  const lastOverflowLogRef = useRef(0);
  const lastPageShownLogKeyRef = useRef('');
  const tokenLoadStartRef = useRef(0);
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
  const hasMeasured = scrollMode ? true : hasMeasuredProp;
  const contentWidth = scrollMode ? 300 : contentWidthProp;
  const loadingTokens = scrollMode ? false : (loadingTokensProp ?? false);
  const hasPrev = scrollMode ? false : (hasPrevProp ?? page > 0);
  const hasNext = scrollMode ? false : (hasNextProp ?? page < totalPages - 1);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { getL2, tokenizedText: tokenSettings } = useSettingsContext();
  const l2Settings = getL2(l2Code);
  const phonetics = l2Settings.tokenSpan.phonetics;
  const showDefinition = l2Settings.tokenSpan.definition.show;
  const zoomRem = ZOOM_TO_REM[tokenSettings.zoom] ?? 1;
  const effectiveScale = (textScale ?? 1) * zoomRem;
  const measureFontSize = 16 * effectiveScale;
  const measureFontFamily = tokenSettings.typeFace === 'serif'
    ? (Platform.OS === 'ios' ? 'Georgia' : 'serif')
    : tokenSettings.typeFace === 'sans-serif'
      ? (Platform.OS === 'ios' ? 'Avenir Next' : 'sans-serif')
      : undefined;
  // Tokenized ruby rows are taller than plain text; the web reader uses
  // ~2.25× leading when ruby is on for every word and 2× for hard-words-only.
  // Interlinear definitions add another per-line slot below the base text.
  const rubyLineScale = isPhoneticsEligible(l2Code) && phonetics.show === 'ruby'
    ? (phonetics.conditions === 'always' ? 2.25 : 2)
    : 2;
  const definitionExtraScale = showDefinition ? 0.7 : 0;
  const estimateLineScale = rubyLineScale + definitionExtraScale;
  const calibrationSignatureValue = useMemo(
    () => calibrationSignature({
      l2Code,
      textScale,
      zoom: tokenSettings.zoom,
      typeFace: tokenSettings.typeFace,
      phoneticsShow: phonetics.show,
      phoneticsConditions: phonetics.conditions,
      definitionShow: showDefinition,
    }),
    [l2Code, textScale, tokenSettings.zoom, tokenSettings.typeFace, phonetics.show, phonetics.conditions, showDefinition],
  );
  const [calibration, setCalibration] = useState<TokenizedTextCalibration | null>(
    () => getCachedCalibration(calibrationSignatureValue),
  );
  const calibrationRatio = Math.max(1, calibration?.ratio ?? (estimateLineScale / 2));
  const measureLineHeight = Math.round(measureFontSize * 2 * calibrationRatio);
  const measureTextStyle = useMemo(() => ({
    fontSize: measureFontSize,
    lineHeight: measureLineHeight,
    ...(measureFontFamily ? { fontFamily: measureFontFamily } : {}),
  }), [measureFontSize, measureLineHeight, measureFontFamily]);

  useEffect(() => {
    setCalibration(getCachedCalibration(calibrationSignatureValue));
  }, [calibrationSignatureValue]);

  // ── Swipe left/right page turns (drag follows the finger) ──
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const swipeAnimatingRef = useRef(false);
  const swipeExitRef = useRef<{ direction: 'next' | 'prev' } | null>(null);
  const swipeExitPageRef = useRef(page);
  const swipeActionsRef = useRef({ hasPrev, hasNext, prevPage, nextPage, width: windowWidth });
  swipeActionsRef.current = { hasPrev, hasNext, prevPage, nextPage, width: windowWidth };

  const panGesture = Gesture.Pan()
    .enabled(!scrollMode && (hasPrev || hasNext))
    .activeOffsetX([-16, 16])
    .failOffsetY([-16, 16])
    .runOnJS(true)
    .onUpdate((e) => {
      if (swipeAnimatingRef.current) return;
      const { hasPrev: canPrev, hasNext: canNext } = swipeActionsRef.current;
      const canDrag = e.translationX < 0 ? canNext : canPrev;
      if (!canDrag) return;
      swipeTranslateX.setValue(e.translationX);
    })
    .onEnd((e) => {
      if (swipeAnimatingRef.current) return;
      const { hasPrev: canPrev, hasNext: canNext, prevPage: goPrev, nextPage: goNext, width } = swipeActionsRef.current;
      const threshold = Math.min(90, width * 0.25);
      const shouldNext = e.translationX < -threshold && canNext;
      const shouldPrev = e.translationX > threshold && canPrev;
      swipeAnimatingRef.current = true;
      if (shouldNext || shouldPrev) {
        swipeExitPageRef.current = page;
        swipeExitRef.current = { direction: shouldNext ? 'next' : 'prev' };
        log(`[Reader] 👉 swipe ${shouldNext ? 'next' : 'prev'} dx=${Math.round(e.translationX)}`);
        Animated.timing(swipeTranslateX, {
          toValue: shouldNext ? -width : width,
          duration: 180,
          useNativeDriver: true,
        }).start(() => {
          swipeAnimatingRef.current = false;
          if (shouldNext) goNext?.();
          else goPrev?.();
        });
      } else {
        swipeExitRef.current = null;
        log(`[Reader] 👉 swipe snap back dx=${Math.round(e.translationX)}`);
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
    log(`[Reader] ✅ page content shown page=${page} blocks=${visibleBlocksProp.length} t=${Date.now()}`);
  }, [hasMeasured, page, visibleBlocksProp]);

  const handleCalibrationComplete = useCallback((c: TokenizedTextCalibration) => {
    cacheCalibration(c);
    setCalibration(c);
    log(
      `[Reader] 🧪 tokenized-text calibration signature=${c.signature} samples=${c.sampleCount}`
      + ` l2=${l2Code} textScale=${textScale} zoom=${tokenSettings.zoom} typeFace=${tokenSettings.typeFace}`
      + ` phonetics=${phonetics.show ?? 'off'}/${phonetics.conditions} definition=${showDefinition}`
      + ` plainLH=${c.plainLineHeight} tokenizedLH=${c.tokenizedLineHeight} ratio=${c.ratio.toFixed(3)}`
      + ` extraPerLine=${c.extraPerLine}px t=${Date.now()}`,
    );
  }, [l2Code, textScale, tokenSettings.zoom, tokenSettings.typeFace, phonetics.show, phonetics.conditions, showDefinition]);

  // One-off dev experiment: measure real TokenizedText vs plain Text with the
  // user's actual settings, then cache a line-height ratio for the session.
  const calibrationSamples = useMemo(() => {
    if (!__DEV__) return null;
    if (!hasMeasured || !visibleBlocksProp || !blocks) return null;
    if (getCachedCalibration(calibrationSignatureValue)) return null;
    const samples: { block: TextBlock; tokens: LemmatizedToken[] }[] = [];
    for (const block of visibleBlocksProp) {
      if (block.kind !== 'text'
        || (block.type !== 'paragraph' && block.type !== 'blockquote' && block.type !== 'list-item')) {
        continue;
      }
      const globalIdx = blocks.indexOf(block);
      const tokens = tokenCache[globalIdx];
      if (tokens && tokens.length > 0) samples.push({ block, tokens });
      if (samples.length >= 8) break;
    }
    return samples.length >= 3 ? samples : null;
  }, [hasMeasured, visibleBlocksProp, blocks, tokenCache, calibrationSignatureValue]);

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

  // ── Scroll mode: simple block list ──
  if (scrollMode) {
    if (!blocks) return null;
    return (
      <View className="flex-1">
        <View className="px-4">
          {blocks.map((block, bi) =>
              renderBlock(block, bi, blocks, blocks, tokenCache, blockTranslations, isTranslating, showTranslation, l2Code, l1Code, contentWidth, showTextActions, onOpenLink, highlight, textScale, zoomRem, translationSideBySide, undefined, false),
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
          <GestureDetector gesture={panGesture}>
            <View className="flex-1">
              <Animated.View className="flex-1" style={{ transform: [{ translateX: swipeTranslateX }] }}>
                <ScrollView
                  key={scrollViewKey}
                  ref={scrollRef}
                  className="flex-1 px-4"
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                  onLayout={handleViewportLayout}
                  onContentSizeChange={(_w, h) => {
                    if (viewportHeightRef.current <= 0) return;
                    const overflow = h - viewportHeightRef.current;
                    if (overflow > 2 && Math.round(overflow) !== lastOverflowLogRef.current) {
                      lastOverflowLogRef.current = Math.round(overflow);
                      log(`[Reader] ⚠️ page overflow contentH=${Math.round(h)} viewportH=${Math.round(viewportHeightRef.current)} overflow=${Math.round(overflow)}px t=${Date.now()} — translation/page break taller than measured`);
                    }
                  }}
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
                    renderBlock(block, bi, blocks, visibleBlocks, tokenCache, blockTranslations, isTranslating, showTranslation, l2Code, l1Code, contentWidth, showTextActions, onOpenLink, highlight, textScale, zoomRem, translationSideBySide, handleBlockLayout, true),
                  )}
                </ScrollView>
              </Animated.View>
            </View>
          </GestureDetector>
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
        <View key={`measure-${measureStart}-${measureNonce}-${measureLineHeight}`} style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }} pointerEvents="none" className="px-4">
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
              ),
            );
          })()}
        </View>
      )}

      {calibrationSamples && (
        <TokenizedTextCalibrationProbe
          samples={calibrationSamples}
          l2Code={l2Code}
          textScale={textScale}
          plainTextStyle={{
            fontSize: measureFontSize,
            lineHeight: Math.round(measureFontSize * 2),
            ...(measureFontFamily ? { fontFamily: measureFontFamily } : {}),
          }}
          signature={calibrationSignatureValue}
          onComplete={handleCalibrationComplete}
        />
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
  zoomRem = 1,
  translationSideBySide = false,
  onBlockLayout?: (globalIdx: number, top: number, height: number) => void,
  deferTokenization = false,
) {
  const scale = textScale ?? 1;
  const blockScale = scale * zoomRem;
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
    (b): b is TextBlock => b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item' || b.type === 'heading'),
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
    const tokenEl = (
          <TokenizedText
            text={block.text}
            l2Code={l2Code}
            tokens={cachedTokens}
            deferTokenization={deferTokenization}
            formats={effectiveFormats}
            onOpenLink={onOpenLink}
            textScale={scale * (block.type === 'heading' ? (block.depth === 1 ? 1.5 : block.depth === 2 ? 1.25 : block.depth === 3 ? 1.125 : 1) : 1)}
            bold={block.type === 'heading'}
          />
    );
    const transEl = showTranslation && translation ? (
      <Text className="mt-1 text-sm leading-relaxed text-muted-foreground" style={{ fontSize: 14 * blockScale }}>{translation}</Text>
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
      case 'heading':
        return sideBySide ? (
          <View className="flex-row items-start gap-4">
            <View className="min-w-0 flex-[3]">{tokenEl}</View>
            <View className="min-w-0 flex-[2]">{transEl}</View>
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

interface TokenizedTextCalibrationProbeProps {
  samples: { block: TextBlock; tokens: LemmatizedToken[] }[];
  l2Code: string;
  textScale: number;
  plainTextStyle: { fontSize: number; lineHeight: number; fontFamily?: string };
  signature: string;
  onComplete: (calibration: TokenizedTextCalibration) => void;
}

/** Hidden dev-only probe: measures real TokenizedText vs plain Text with the
 *  user's current settings so pagination can use a grounded height ratio. */
function TokenizedTextCalibrationProbe({
  samples, l2Code, textScale, plainTextStyle, signature, onComplete,
}: TokenizedTextCalibrationProbeProps) {
  const heightsRef = useRef<Record<number, { plain?: number; tokenized?: number }>>({});
  const [version, setVersion] = useState(0);

  const handleMeasure = useCallback((
    index: number,
    kind: 'plain' | 'tokenized',
    height: number,
  ) => {
    const prev = heightsRef.current[index]?.[kind];
    if (prev === height) return;
    heightsRef.current[index] = { ...heightsRef.current[index], [kind]: height };
    setVersion(v => v + 1);
  }, []);

  useEffect(() => {
    const measured = samples
      .map((_, i) => heightsRef.current[i])
      .filter((e): e is { plain: number; tokenized: number } => !!e?.plain && !!e?.tokenized);
    if (measured.length !== samples.length) return;
    const derived = deriveCalibration(
      signature,
      plainTextStyle.lineHeight,
      measured.map(e => ({ plainHeight: e.plain, tokenizedHeight: e.tokenized })),
    );
    if (derived) onComplete(derived);
  }, [version, samples, signature, plainTextStyle.lineHeight, onComplete]);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }} className="px-4">
      {samples.map((s, i) => (
        <View key={`cal-${i}`}>
          <View className="mb-3">
            <Text
              style={plainTextStyle}
              className="text-foreground"
              onLayout={(e) => handleMeasure(i, 'plain', e.nativeEvent.layout.height)}
            >
              {s.block.text}
            </Text>
          </View>
          <View
            className="mb-3"
            onLayout={(e) => handleMeasure(i, 'tokenized', e.nativeEvent.layout.height)}
          >
            <TokenizedText text={s.block.text} l2Code={l2Code} tokens={s.tokens} textScale={textScale} />
          </View>
        </View>
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
            <View className="min-w-0 flex-[3]"><Text style={measureTextStyle} className="text-foreground">{block.text}</Text></View>
            <View className="min-w-0 flex-[2]"><MeasuringSkeleton text={block.text} /></View>
          </View>
        ) : (
          <View>
            <Text style={measureTextStyle} className="text-foreground">{block.text}</Text>
            {showTranslation && <View className="mt-1"><MeasuringSkeleton text={block.text} /></View>}
          </View>
        )
      )}
      {block.type === 'blockquote' && withActionSpacer(
        translationSideBySide && showTranslation ? (
          <View className="border-l-2 border-muted-foreground/30 pl-3">
            <View className="flex-row items-start gap-4">
              <View className="min-w-0 flex-[3]"><Text style={measureTextStyle} className="text-foreground">{block.text}</Text></View>
              <View className="min-w-0 flex-[2]"><MeasuringSkeleton text={block.text} /></View>
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
