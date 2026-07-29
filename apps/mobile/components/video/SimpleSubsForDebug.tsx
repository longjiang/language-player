import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, Animated, Easing } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { TokenizedText } from '../TokenizedText';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { SkipBack, SkipForward, ChevronLeft, ChevronRight, PanelRightOpen } from 'lucide-react-native';
import { SCROLL } from '@langplayer/shared';
import type { SubtitleLine, SubtitleSyncedLine, TokenCache, LemmatizedToken } from '@langplayer/shared';

interface SimpleSubsForDebugProps {
  lines: SubtitleSyncedLine[];
  activeLineIndex: number;
  currentTime: number;
  tokenCache?: TokenCache;
  tokenCacheLoaded?: boolean;
  onSeekToLine?: (time: number) => void;
  /** Terms to highlight in the subtitle text. */
  highlightTerms?: string[];
  /** When true, shows only the active line (single-line subtitle mode). Default false (full transcript list). */
  singleLine?: boolean;
  /** Called when user taps the transcript-mode toggle (singleLine mode only). */
  onSwitchToTranscriptMode?: () => void;
  /** Called when user taps previous video (singleLine mode only). */
  onPrevVideo?: () => void;
  /** Called when user taps next video (singleLine mode only). */
  onNextVideo?: () => void;
  /** Whether there is a previous video in queue. */
  hasPrevVideo?: boolean;
  /** Whether there is a next video in queue. */
  hasNextVideo?: boolean;
}

export function SimpleSubsForDebug({ lines, activeLineIndex, currentTime, tokenCache, tokenCacheLoaded, onSeekToLine, highlightTerms, singleLine = false, onSwitchToTranscriptMode, onPrevVideo, onNextVideo, hasPrevVideo = false, hasNextVideo = false }: SimpleSubsForDebugProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, playback } = useSettingsContext();
  const flatListRef = useRef<FlatList>(null);
  const userScrolledUntil = useRef(0);
  const lastScrolledIdx = useRef(-1);
  const lastAutoScrollTime = useRef(0);
  const isInitialLoad = useRef(true);

  // ── Animated scroll offset (used when smoothScroll is enabled) ──
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const scrollPosRef = useRef(0);
  const targetOffsetRef = useRef(0);
  const isAnimatingRef = useRef(false);

  // Convert SyncedLine[] → SubtitleLine[] for the translation hook
  const subtitleLines: SubtitleLine[] = useMemo(
    () => lines.map((l) => ({ line: l.l2Line, starttime: l.starttime })),
    [lines],
  );

  const showTranslation = display.translation;

  // ── Scroll-position-based visibility ──
  const scrollYRef = useRef(0);
  const [containerHeight, setContainerHeight] = useState(0);
  // Conservative item height estimate for visibility math
  const estimatedItemHeight = showTranslation ? 100 : 56;

  const { translatedLines, loading, progress } = useSubtitleTranslation(subtitleLines, l1Lang.code, l2Lang.code, showTranslation);

  // Merge translations into SyncedLine shape
  const displayLines = useMemo(
    () => lines.map((l, i) => ({
      ...l,
      l1Line: showTranslation ? (translatedLines[i]?.line ?? '') : '',
    })),
    [lines, translatedLines, showTranslation],
  );

  // ── Batch lemmatization ──
  const [batchTokens, setBatchTokens] = useState<Record<number, LemmatizedToken[]>>({});
  const [loadingBatch, setLoadingBatch] = useState(false);
  const batchGenRef = useRef(0);

  useEffect(() => {
    if (lines.length === 0) return;
    if (tokenCache && !tokenCacheLoaded) return;

    const gen = ++batchGenRef.current;
    setLoadingBatch(true);
    const texts = lines.map(l => l.l2Line);

    fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, l2: l2Lang.code }),
    })
      .then(res => res.json())
      .then(data => {
        if (batchGenRef.current !== gen) return;
        const results: LemmatizedToken[][] = data?.results ?? [];
        const map: Record<number, LemmatizedToken[]> = {};
        results.forEach((tokens, i) => { if (tokens?.length) map[i] = tokens; });
        setBatchTokens(map);
        setLoadingBatch(false);
      })
      .catch(async () => {
        if (batchGenRef.current !== gen) return;
        const { lemmatizeText } = await import('@/lib/tokenizer');
        const results = await Promise.all(texts.map(t => lemmatizeText(t, l2Lang.code)));
        if (batchGenRef.current !== gen) return;
        const map: Record<number, LemmatizedToken[]> = {};
        results.forEach((tokens, i) => { if (tokens?.length) map[i] = tokens; });
        setBatchTokens(map);
        setLoadingBatch(false);
      });
  }, [lines, l2Lang.code, tokenCache, tokenCacheLoaded]);

  // ── Drive FlatList scroll from Animated.Value when smoothScroll is on ──
  useEffect(() => {
    const listenerId = scrollAnim.addListener(({ value }) => {
      flatListRef.current?.scrollToOffset({ offset: value, animated: false });
    });
    return () => scrollAnim.removeListener(listenerId);
  }, [scrollAnim]);

  // ── Smooth scroll helper: timed animation over 3 seconds ──
  const animateToOffset = useCallback(
    (offset: number) => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      targetOffsetRef.current = offset;
      Animated.timing(scrollAnim, {
        toValue: offset,
        duration: 3000,
        useNativeDriver: false,
        easing: Easing.out(Easing.cubic), // ease-out: starts fast, slows near end
      }).start(() => {
        isAnimatingRef.current = false;
        // If another scroll was requested while animating, resume
        if (targetOffsetRef.current !== offset) {
          animateToOffset(targetOffsetRef.current);
        }
      });
    },
    [scrollAnim],
  );

  const onLayout = useCallback(
    (e: any) => {
      const h = e.nativeEvent.layout.height;
      if (h > 0 && h !== containerHeight) {
        setContainerHeight(h);
      }
    },
    [containerHeight],
  );

  const onScrollBeginDrag = useCallback(() => {
    userScrolledUntil.current = Date.now() + SCROLL.USER_COOLDOWN_MS;
    // Stop any in-progress animated scroll; let the user take over
    scrollAnim.stopAnimation();
    isAnimatingRef.current = false;
  }, [scrollAnim]);

  useEffect(() => {
    if (activeLineIndex < 0) return;

    const now = Date.now();
    const idxDelta = Math.abs(activeLineIndex - lastScrolledIdx.current);
    const isSeek = idxDelta > SCROLL.SEEK_INDEX_DELTA;

    // Compute isFullyOut from scroll position if containerHeight is known
    let isFullyOut = false;
    if (containerHeight > 0 && estimatedItemHeight > 0) {
      const visibleCount = Math.floor(containerHeight / estimatedItemHeight);
      const firstVisible = Math.floor(scrollYRef.current / estimatedItemHeight);
      const lastVisible = firstVisible + visibleCount - 1;
      isFullyOut = activeLineIndex < firstVisible || activeLineIndex > lastVisible;
    } else {
      // Fallback: treat initial load as fully-out
      isFullyOut = lastScrolledIdx.current === -1 && activeLineIndex > 0;
    }

    // Throttle: skip if we scrolled too recently (unless seek or fully-out)
    if (!isSeek && !isFullyOut && now - lastAutoScrollTime.current < SCROLL.THROTTLE_MS) return;

    // Bypass cooldown on seek or when line is far out of view
    if (!isSeek && !isFullyOut && now < userScrolledUntil.current) return;

    lastScrolledIdx.current = activeLineIndex;
    lastAutoScrollTime.current = now;

    const targetOffset = activeLineIndex * estimatedItemHeight - (containerHeight - estimatedItemHeight) / 2;

    if (playback.smoothScroll && !isInitialLoad.current && !isSeek && !isFullyOut) {
      // Smooth: use Animated.spring driven by scrollAnim
      animateToOffset(targetOffset);
    } else {
      // Instant: jump directly
      flatListRef.current?.scrollToIndex({
        index: activeLineIndex,
        animated: false,
        viewPosition: 0.5,
      });
    }
    isInitialLoad.current = false;
  }, [activeLineIndex, containerHeight, estimatedItemHeight, playback.smoothScroll, animateToOffset]);

  // ── Single-line subtitle mode ──
  if (singleLine) {
    const activeLine = activeLineIndex >= 0 ? displayLines[activeLineIndex] : undefined;
    const activeTokens = activeLineIndex >= 0 ? batchTokens[activeLineIndex] : undefined;
    const isFirstLine = activeLineIndex <= 0;
    const isLastLine = activeLineIndex >= lines.length - 1;

    // Karaoke progress for the active line
    let karaokeProgress: number | undefined;
    if (activeLine && playback.karaokeMode && activeLineIndex >= 0) {
      const nextStart = lines[activeLineIndex + 1]?.starttime;
      const lineDuration = nextStart ? nextStart - activeLine.starttime : 5;
      karaokeProgress = lineDuration > 0
        ? Math.min(1, Math.max(0, (currentTime - activeLine.starttime) / lineDuration))
        : 0;
    }

    const btnColor = ICON_MUTED;

    return (
      <View className="flex-1 bg-card border-t border-border">
        {/* Control row */}
        <View className="flex-row items-center gap-0.5 px-2 py-1">
          <Pressable
            onPress={onPrevVideo}
            disabled={!hasPrevVideo}
            className="rounded p-1.5 active:bg-muted disabled:opacity-30"
          >
            <SkipBack size={18} color={btnColor} />
          </Pressable>
          <Pressable
            onPress={() => {
              if (!isFirstLine) {
                const prev = lines[activeLineIndex - 1];
                if (prev) onSeekToLine?.(prev.starttime);
              }
            }}
            disabled={isFirstLine}
            className="rounded p-1.5 active:bg-muted disabled:opacity-30"
          >
            <ChevronLeft size={20} color={btnColor} />
          </Pressable>
          <Pressable
            onPress={() => {
              if (!isLastLine) {
                const next = lines[activeLineIndex + 1];
                if (next) onSeekToLine?.(next.starttime);
              }
            }}
            disabled={isLastLine}
            className="rounded p-1.5 active:bg-muted disabled:opacity-30"
          >
            <ChevronRight size={20} color={btnColor} />
          </Pressable>
          <Pressable
            onPress={onNextVideo}
            disabled={!hasNextVideo}
            className="rounded p-1.5 active:bg-muted disabled:opacity-30"
          >
            <SkipForward size={18} color={btnColor} />
          </Pressable>
          <View className="flex-1" />
          {onSwitchToTranscriptMode ? (
            <Pressable
              onPress={onSwitchToTranscriptMode}
              className="rounded p-1.5 active:bg-muted"
            >
              <PanelRightOpen size={18} color={btnColor} />
            </Pressable>
          ) : null}
        </View>

        {/* Separator */}
        <View className="mx-3 border-t border-border" />

        {/* Active line */}
        <Pressable
          className="flex-1 flex-col items-center justify-center px-4 py-2 min-h-0"
          onPress={() => { if (activeLine) onSeekToLine?.(activeLine.starttime); }}
        >
          {activeLine ? (
            <>
              <View className="items-center">
                <TokenizedText
                  text={activeLine.l2Line}
                  l2Code={l2Lang.code}
                  tokenCache={tokenCache}
                  tokenCacheLoaded={tokenCacheLoaded}
                  tokens={activeTokens}
                  karaokeProgress={karaokeProgress}
                  highlightTerms={highlightTerms}
                />
              </View>
              {showTranslation && activeLine.l1Line ? (
                <Text className="text-sm text-center mt-0.5 text-muted-foreground">
                  {activeLine.l1Line}
                </Text>
              ) : null}
            </>
          ) : (
            <Text className="text-sm text-muted-foreground">...</Text>
          )}
        </Pressable>
      </View>
    );
  }

  // ── Full transcript list mode ──
  return (
    <View className="flex-1 bg-background">
      <FlatList
        ref={flatListRef}
        data={displayLines}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        onLayout={onLayout}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
        }}
        ListHeaderComponent={loading || loadingBatch ? (
          <View className="py-1">
            <Text className="text-xs text-muted-foreground">
              {showTranslation && loading ? `Translating… ${progress}/${lines.length}` : ''}
              {loadingBatch ? ' Making words interactive…' : ''}
            </Text>
          </View>
        ) : null}
        renderItem={({ item, index }) => {
          const isActive = index === activeLineIndex;
          const preloadedTokens = batchTokens[index];

          // Karaoke progress for active line
          let karaokeProgress: number | undefined;
          if (isActive && playback.karaokeMode) {
            const nextStart = lines[index + 1]?.starttime;
            const lineDuration = nextStart ? nextStart - item.starttime : 5;
            karaokeProgress = lineDuration > 0
              ? Math.min(1, Math.max(0, (currentTime - item.starttime) / lineDuration))
              : 0;
          }

          return (
            <Pressable
              onPress={() => onSeekToLine?.(item.starttime)}
              className={`rounded-lg px-3 py-2 mb-1 ${isActive ? 'bg-primary/10 border border-primary/30' : ''}`}
            >
              <TokenizedText
                text={item.l2Line}
                l2Code={l2Lang.code}
                tokenCache={tokenCache}
                tokenCacheLoaded={tokenCacheLoaded}
                tokens={preloadedTokens}
                karaokeProgress={karaokeProgress}
                highlightTerms={highlightTerms}
              />
              {item.l1Line ? (
                <Text className="mt-1 text-sm text-muted-foreground">{item.l1Line}</Text>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
