import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Animated, Easing } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { useT } from '@/hooks/use-t';
import { TokenizedText } from '../TokenizedText';
import { TextActionMenu } from '@/components/TextActionMenu';
import { renderInlineMarkdown } from '@/lib/inline-markdown';
import { ICON_MUTED } from '@/lib/theme-colors';
import { ZOOM_TO_REM } from '@/lib/text-scale';
import { baseCode, translationSizeFactor } from '@langplayer/utils';
import { SCROLL } from '@langplayer/shared';
import type { SubtitleLine, SubtitleSyncedLine, TokenCache } from '@langplayer/shared';

/** ADR-0034: free users see the first 10 transcript lines. */
const FREE_TRANSCRIPT_LINES = 10;
/** Single-line subtitles render at 1.33× the user's zoom; multiline transcript
 *  rows at 1× (SPEC-051 §Target behavior). */
const SINGLELINE_TEXT_SCALE = 1.33;

interface SubtitleDisplayProps {
  lines: SubtitleSyncedLine[];
  activeLineIndex: number;
  currentTime: number;
  tokenCache?: TokenCache;
  tokenCacheLoaded?: boolean;
  onSeekToLine?: (time: number) => void;
  /** Terms to highlight in the subtitle text. */
  highlightTerms?: string[];
  /** In single-line mode, shown until playback reaches the first line (e.g. the subs-search match line). */
  defaultLine?: SubtitleSyncedLine;
  /** When true, shows only the active line (single-line subtitle mode). Default false (full transcript list). */
  singleLine?: boolean;
  /** Single-line text scale — 1.33× by default (SPEC-051), but callers that
   *  show the single line in a compact surface (e.g. the subs-search playback
   *  modal) can pass 1 to keep the text at the user's zoom scale. */
  singlelineTextScale?: number;
  /** When true (single-line mode), renders transparent/white for an on-video band. */
  overlay?: boolean;
}

export function SubtitleDisplay({ lines, activeLineIndex, currentTime, tokenCache, tokenCacheLoaded, onSeekToLine, highlightTerms, defaultLine, singleLine = false, singlelineTextScale = SINGLELINE_TEXT_SCALE, overlay = false }: SubtitleDisplayProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const { display, playback, tokenizedText } = useSettingsContext();
  const zoomRem = ZOOM_TO_REM[tokenizedText.zoom] ?? 1;
  // SPEC-082 Task 1: the translation renders at `translationSize` × the L2
  // text size (clamped to [0.5, 1], default 0.8).
  const translationFactor = translationSizeFactor({ tokenizedText });
  const { isPro } = useSubscription();
  const router = useRouter();
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
    // Before playback there is no active line — show the caller's default
    // line (e.g. the subs-search match line) instead of a placeholder.
    const shownLine = activeLine ?? defaultLine;

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
      <View className={overlay ? 'min-h-0 flex-1' : 'min-h-32 flex-1 bg-card border-t border-border'}>
        {/* Active line */}
        <Pressable
          className="flex-1 flex-col items-center justify-start px-4 pt-4 pb-2 min-h-0"
          onPress={() => { if (activeLine) onSeekToLine?.(activeLine.starttime); }}
        >
          {shownLine ? (
            <TextActionMenu
              className="w-full"
              centered
              text={shownLine.l2Line}
              l2Code={l2Lang.code}
              l1Code={baseCode(l1Lang.code)}
            >
              <View className="w-full items-center">
                <TokenizedText
                  text={shownLine.l2Line}
                  l2Code={l2Lang.code}
                  tokenCache={tokenCache}
                  tokenCacheLoaded={tokenCacheLoaded}
                  karaokeProgress={karaokeProgress}
                  highlightTerms={highlightTerms}
                  textScale={singlelineTextScale}
                  textColor={overlay ? 'text-white' : undefined}
                  // SPEC-084: selection on the transcript single-line mode,
                  // not the on-video band.
                  selectionDictionary={!overlay}
                />
                {showTranslation && shownLine.l1Line ? (
                  <Text
                    className={`text-sm text-center mt-0.5 ${overlay ? 'text-white/70' : 'text-muted-foreground'}`}
                    style={{ fontSize: translationFactor * 14 * singlelineTextScale * zoomRem }}
                  >
                    {renderInlineMarkdown(shownLine.l1Line, { markBold: true })}
                  </Text>
                ) : null}
              </View>
            </TextActionMenu>
          ) : (
            <Text className={`text-sm ${overlay ? 'text-white/50' : 'text-muted-foreground'}`}>...</Text>
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
        data={!isPro ? displayLines.slice(0, FREE_TRANSCRIPT_LINES) : displayLines}
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
                  textScale={1}
                  // SPEC-084: selection on the transcript list.
                  selectionDictionary
                />
                {item.l1Line ? (
                  <Text className="mt-1 text-sm text-muted-foreground" style={{ fontSize: translationFactor * 14 * zoomRem }}>
                    {renderInlineMarkdown(item.l1Line, { markBold: true })}
                  </Text>
                ) : null}
              </TextActionMenu>
            </Pressable>
          );
        }}
        ListFooterComponent={!isPro && displayLines.length > FREE_TRANSCRIPT_LINES ? (
          <View className="py-4 px-2 items-center">
            <Text className="text-sm text-center text-muted-foreground">
              {t('msg.upgrade_to_pro_banner')}
            </Text>
            <Button
              onPress={() => router.push('/(tabs)/(me)/go-pro' as any)}
              className="mt-3"
            >
              <Text className={buttonTextClass('default')}>
                {t('action.upgrade_to_pro')}
              </Text>
            </Button>
          </View>
        ) : null}
      />
    </View>
  );
}
