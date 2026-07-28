import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { TokenizedText } from '../TokenizedText';
import { PYTHON_API_URL } from '@/lib/api-url';
import { SCROLL } from '@langplayer/shared';
import type { SubtitleLine, SubtitleSyncedLine, TokenCache, LemmatizedToken } from '@langplayer/shared';

interface SimpleSubsForDebugProps {
  lines: SubtitleSyncedLine[];
  activeLineIndex: number;
  currentTime: number;
  tokenCache?: TokenCache;
  tokenCacheLoaded?: boolean;
  onSeekToLine?: (time: number) => void;
}

export function SimpleSubsForDebug({ lines, activeLineIndex, currentTime, tokenCache, tokenCacheLoaded, onSeekToLine }: SimpleSubsForDebugProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, playback } = useSettingsContext();
  const flatListRef = useRef<FlatList>(null);
  const userScrolledUntil = useRef(0);
  const lastScrolledIdx = useRef(-1);
  const lastAutoScrollTime = useRef(0);
  const isInitialLoad = useRef(true);

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
  }, []);

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
    flatListRef.current?.scrollToIndex({
      index: activeLineIndex,
      animated: !isInitialLoad.current && !isSeek && !isFullyOut,
      viewPosition: 0.5,
    });
    isInitialLoad.current = false;
  }, [activeLineIndex, containerHeight, estimatedItemHeight]);

  return (
    <View className="flex-1 bg-background">
      {loading || loadingBatch ? (
        <Text className="px-4 py-1 text-xs text-muted-foreground">
          {showTranslation && loading ? `Translating… ${progress}/${lines.length}` : ''}
          {loadingBatch ? ' Making words interactive…' : ''}
        </Text>
      ) : null}
      <FlatList
        ref={flatListRef}
        data={displayLines}
        keyExtractor={(_, i) => String(i)}
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        onLayout={onLayout}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
        }}
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
              className={`px-4 py-2 ${
                isActive
                  ? 'mx-2 rounded-xl border-2 border-primary'
                  : 'mx-2 rounded-xl border border-border'
              }`}
            >
              <Text className="text-xs tabular-nums text-muted-foreground">{item.starttime}s</Text>
              <TokenizedText
                text={item.l2Line}
                l2Code={l2Lang.code}
                tokenCache={tokenCache}
                tokenCacheLoaded={tokenCacheLoaded}
                tokens={preloadedTokens}
                karaokeProgress={karaokeProgress}
              />
              {item.l1Line ? (
                <Text className="mt-0.5 text-sm text-muted-foreground">{item.l1Line}</Text>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
