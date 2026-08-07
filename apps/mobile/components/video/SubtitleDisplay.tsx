import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, Animated, Easing } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { useT } from '@/hooks/use-t';
import { TokenizedText } from '../TokenizedText';
import { TextActionMenu } from '@/components/TextActionMenu';
import { renderInlineMarkdown } from '@/lib/inline-markdown';
import { ICON_MUTED } from '@/lib/theme-colors';
import { baseCode } from '@langplayer/utils';
import { SCROLL } from '@langplayer/shared';
import type { SubtitleLine, SubtitleSyncedLine, TokenCache } from '@langplayer/shared';

interface SubtitleDisplayProps {
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
}

export function SubtitleDisplay({ lines, activeLineIndex, currentTime, tokenCache, tokenCacheLoaded, onSeekToLine, highlightTerms, singleLine = false }: SubtitleDisplayProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
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

  // Per-line highlight form: the first highlight term present in each line.
  // Sent to /translate_array so the server bolds it in the translation
  // (SPEC-049 §7.3) instead of pre-marking the text.
  const highlightFormsForLines = useMemo(
    () => lines.map((l) =>
      (highlightTerms ?? []).find((f) => f && l.l2Line.includes(f)) ?? null,
    ),
    [lines, highlightTerms],
  );

  // ── Scroll-position-based visibility ──
  const scrollYRef = useRef(0);
  const [containerHeight, setContainerHeight] = useState(0);
  // Conservative item height estimate for visibility math
  const estimatedItemHeight = showTranslation ? 100 : 56;

  const { translatedLines, loading, progress } = useSubtitleTranslation(
    subtitleLines,
    l1Lang.code,
    l2Lang.code,
    showTranslation,
    activeLineIndex,
    highlightFormsForLines,
  );

  // Merge translations into SyncedLine shape
  const displayLines = useMemo(
    () => lines.map((l, i) => ({
      ...l,
      l1Line: showTranslation ? (translatedLines[i]?.line ?? '') : '',
    })),
    [lines, translatedLines, showTranslation],
  );

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

    // Karaoke progress for the active line
    let karaokeProgress: number | undefined;
    if (activeLine && playback.karaokeMode && activeLineIndex >= 0) {
      const nextStart = lines[activeLineIndex + 1]?.starttime;
      const lineDuration = nextStart ? nextStart - activeLine.starttime : 5;
      karaokeProgress = lineDuration > 0
        ? Math.min(1, Math.max(0, (currentTime - activeLine.starttime) / lineDuration))
        : 0;
    }

    return (
      <View className="min-h-32 flex-1 bg-card border-t border-border">
        {/* Active line */}
        <Pressable
          className="flex-1 flex-col items-center justify-start px-4 pt-4 pb-2 min-h-0"
          onPress={() => { if (activeLine) onSeekToLine?.(activeLine.starttime); }}
        >
          {activeLine ? (
            <TextActionMenu
              className="w-full"
              centered
              text={activeLine.l2Line}
              l2Code={l2Lang.code}
              l1Code={baseCode(l1Lang.code)}
            >
              <View className="items-center">
                <TokenizedText
                  text={activeLine.l2Line}
                  l2Code={l2Lang.code}
                  tokenCache={tokenCache}
                  tokenCacheLoaded={tokenCacheLoaded}
                  karaokeProgress={karaokeProgress}
                  highlightTerms={highlightTerms}
                />
              </View>
              {showTranslation && activeLine.l1Line ? (
                <Text className="text-sm text-center mt-0.5 text-muted-foreground">
                  {renderInlineMarkdown(activeLine.l1Line, { markBold: true })}
                </Text>
              ) : null}
            </TextActionMenu>
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
        ListHeaderComponent={loading ? (
          <View className="py-1">
            <Text className="text-xs text-muted-foreground">
              {showTranslation && loading ? `${t('msg.translating')} ${progress}/${lines.length}` : ''}
            </Text>
          </View>
        ) : null}
        renderItem={({ item, index }) => {
          const isActive = index === activeLineIndex;

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
              <TextActionMenu
                className="w-full"
                text={item.l2Line}
                l2Code={l2Lang.code}
                l1Code={baseCode(l1Lang.code)}
              >
                <TokenizedText
                  text={item.l2Line}
                  l2Code={l2Lang.code}
                  tokenCache={tokenCache}
                  tokenCacheLoaded={tokenCacheLoaded}
                  karaokeProgress={karaokeProgress}
                  highlightTerms={highlightTerms}
                />
                {item.l1Line ? (
                  <Text className="mt-1 text-sm text-muted-foreground">
                    {renderInlineMarkdown(item.l1Line, { markBold: true })}
                  </Text>
                ) : null}
              </TextActionMenu>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
