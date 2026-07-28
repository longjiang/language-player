import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { useActiveLineIndex } from '@/hooks/use-active-line-index';
import { useTranscriptAutoScroll } from '@/hooks/use-transcript-auto-scroll';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { TokenizedText } from '../TokenizedText';
import { parseSubtitleCSV } from '@langplayer/utils';
import type { DictionaryEntry, SubtitleLine, TokenCache, LemmatizedToken } from '@langplayer/shared';

interface SubtitleDisplayProps {
  youtubeId?: string;
  currentTime: number;
  videoTitle?: string;
  tokenCache?: TokenCache;
  tokenCacheLoaded?: boolean;
  onLinesLoaded?: (startTimes: number[]) => void;
  onSeekToLine?: (starttime: number) => void;
  initialLines?: { starttime: number; l2Line: string }[];
  highlightTerms?: string[];
}

function stripDurationPrefix(text: string): string {
  return text.replace(/^[\d.]+,\s*/, '');
}

export function SubtitleDisplay({
  youtubeId,
  currentTime,
  videoTitle,
  tokenCache,
  tokenCacheLoaded,
  onLinesLoaded,
  onSeekToLine,
  initialLines,
  highlightTerms,
}: SubtitleDisplayProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, playback } = useSettingsContext();
  const t = useT();
  const router = useRouter();
  const { setDetailHead, setSidebarSource, setCameFromSearch } = useDictionaryContext();
  const [l2Lines, setL2Lines] = useState<SubtitleLine[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const scrollRef = useRef<FlatList<SubtitleLine>>(null);

  // ── Batch lemmatization: one request for all lines, then pass to TokenizedText as preloaded tokens ──
  const [batchTokens, setBatchTokens] = useState<Record<number, LemmatizedToken[]>>({});
  const [loadingBatch, setLoadingBatch] = useState(false);
  const batchGenRef = useRef(0);

  const showTranslation = display.translation;
  const { translatedLines, loading: translating, progress } = useSubtitleTranslation(
    l2Lines,
    l1Lang.code,
    l2Lang.code,
    showTranslation,
  );

  // Load initial lines or fetch from API
  useEffect(() => {
    if (initialLines) {
      const lines = initialLines.map((l) => ({ line: stripDurationPrefix(l.l2Line), starttime: l.starttime }));
      setL2Lines(lines);
      onLinesLoaded?.(lines.map((l) => l.starttime));
      return;
    }
    if (!youtubeId) return;
    setLoadingSubs(true);
    (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let lines: SubtitleLine[] = [];

      try {
        // 1. Try Directus first (fast — stored subs in youtube_videos table)
        const dr = await fetch(
          `${PYTHON_API_URL}/videos?youtube_id=${encodeURIComponent(youtubeId)}&subs_l2=1&l2=${l2Lang.code}`,
          { signal: controller.signal },
        );
        if (dr.ok) {
          const dj = await dr.json();
          const video = Array.isArray(dj) ? dj[0] : dj?.data?.[0] ?? dj;
          if (video?.subs_l2 && typeof video.subs_l2 === 'string' && video.subs_l2.length > 100) {
            lines = parseSubtitleCSV(video.subs_l2);
          }
        }
      } catch { /* Directus failed, fall through to YouTube */ }

      if (lines.length === 0) {
        try {
          // 2. Fall back to YouTube transcript API
          const yr = await fetch(
            `${PYTHON_API_URL}/get_best_l2_subs?v=${encodeURIComponent(youtubeId)}&l2=${l2Lang.code}`,
            { signal: controller.signal },
          );
          if (yr.ok) {
            const yd = await yr.json();
            if (Array.isArray(yd)) {
              lines = yd.map((item: any) => ({
                line: item.text ?? '',
                starttime: item.start ?? 0,
              }));
            }
          }
        } catch { /* YouTube API also failed */ }
      }

      clearTimeout(timeout);
      if (lines.length === 0) { setLoadingSubs(false); return; }
      setL2Lines(lines);
      onLinesLoaded?.(lines.map((l) => l.starttime));
      setLoadingSubs(false);
    })();
  }, [youtubeId, initialLines]);

  // ── Batch lemmatize all subtitle lines (1 API call instead of N) ──
  useEffect(() => {
    if (l2Lines.length === 0) return;
    // Skip if tokenCache is about to populate — it takes priority
    if (tokenCache && !tokenCacheLoaded) return;

    const gen = ++batchGenRef.current;
    setLoadingBatch(true);
    const texts = l2Lines.map(l => l.line);

    if (__DEV__) console.log(`[lemmatize] 🎬 SUB-BATCH REQ l2=${l2Lang.code} lines=${texts.length}`);

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
        if (__DEV__) console.log(`[lemmatize] 🎬 SUB-BATCH OK l2=${l2Lang.code} lines=${results.length} withTokens=${Object.keys(map).length}`);
        setBatchTokens(map);
        setLoadingBatch(false);
      })
      .catch(async () => {
        if (batchGenRef.current !== gen) return;
        if (__DEV__) console.log(`[lemmatize] 🎬 SUB-BATCH FAIL → falling back to per-line`);
        // Fallback: tokenize one by one (uses existing lemmatizeText with cache/dedup)
        const { lemmatizeText } = await import('@/lib/tokenizer');
        const results = await Promise.all(texts.map(t => lemmatizeText(t, l2Lang.code)));
        if (batchGenRef.current !== gen) return;
        const map: Record<number, LemmatizedToken[]> = {};
        results.forEach((tokens, i) => { if (tokens?.length) map[i] = tokens; });
        setBatchTokens(map);
        setLoadingBatch(false);
      });
  }, [l2Lines, l2Lang.code, tokenCache, tokenCacheLoaded]);

  // ── Auto-scroll: visibility-gated, throttled, seek-aware ──
  const startTimes = useMemo(() => l2Lines.map(l => l.starttime), [l2Lines]);
  const computedActiveIdx = useActiveLineIndex(startTimes, currentTime);

  // ── Item height: start with a conservative estimate, then measure real height via onLayout ──
  const estimatedFallback = showTranslation ? 100 : 56;
  const [measuredItemHeight, setMeasuredItemHeight] = useState(estimatedFallback);

  // Reset measurement when translation visibility changes
  useEffect(() => {
    setMeasuredItemHeight(estimatedFallback);
  }, [estimatedFallback]);

  // ── Auto-scroll: visibility-gated, throttled, seek-aware ──
  const {
    onScroll: autoScrollOnScroll,
    onLayout: autoScrollOnLayout,
    onScrollBeginDrag,
  } = useTranscriptAutoScroll({
    activeIndex: computedActiveIdx,
    flatListRef: scrollRef,
    smoothScrollEnabled: playback.smoothScroll,
    estimatedItemHeight: measuredItemHeight,
  });

  // Keep state in sync with computed value (scroll is handled by useTranscriptAutoScroll)
  useEffect(() => {
    setActiveIdx(computedActiveIdx);
  }, [computedActiveIdx]);

  if (loadingSubs) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  if (l2Lines.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <Text className="text-muted-foreground">{t('subtitle.subtitles_unavailable')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={scrollRef}
      data={l2Lines}
      keyExtractor={(line) => String(line.starttime)}
      initialNumToRender={5}
      windowSize={3}
      maxToRenderPerBatch={5}
      getItemLayout={(_, index) => ({
        // Estimated item height — refined by onLayout measurement on first render.
        // Variable-height lines cause occasional onScrollToIndexFailed (handled below).
        length: measuredItemHeight,
        offset: measuredItemHeight * index,
        index,
      })}
      contentContainerStyle={{ paddingHorizontal: 12 }}
      onScroll={autoScrollOnScroll}
      onLayout={autoScrollOnLayout}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollToIndexFailed={() => {
        // Fallback: approximate scroll by offset (lines may be variable height)
      }}
      ListHeaderComponent={translating || loadingBatch ? (
        <View className="py-1">
          <Text className="text-xs text-muted-foreground">
            {translating ? `Translating… ${progress}/${l2Lines.length}` : ''}
            {loadingBatch ? ' Making words interactive…' : ''}
          </Text>
        </View>
      ) : null}
      renderItem={({ item: line, index: i }) => {
        const isActive = i === activeIdx;
        const translation = translatedLines[i];
        const preloadedTokens = batchTokens[i];

        // ── Karaoke: compute progress for active line only ──
        let karaokeProgress: number | undefined;
        if (isActive && playback.karaokeMode) {
          const lineDuration = line.duration
            ?? (l2Lines[i + 1] ? l2Lines[i + 1]!.starttime - line.starttime : 5);
          karaokeProgress = lineDuration > 0
            ? Math.min(1, Math.max(0, (currentTime - line.starttime) / lineDuration))
            : 0;
        }

        return (
          <Pressable
            onPress={() => onSeekToLine?.(line.starttime)}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > measuredItemHeight) {
                setMeasuredItemHeight(h);
              }
            }}
            className={`rounded-lg px-3 py-2 mb-1 ${isActive ? 'bg-primary/10 border border-primary/30' : ''}`}
          >
            {__DEV__ && (
              <Text className="text-[10px] text-muted-foreground/40 mb-0.5">
                #{i} · y≈{measuredItemHeight * i}px
              </Text>
            )}
            <TokenizedText
              testID={`subtitle-line-${i}`}
              text={line.line}
              l2Code={l2Lang.code}
              highlightTerms={highlightTerms}
              tokenCache={tokenCache}
              tokenCacheLoaded={tokenCacheLoaded}
              tokens={preloadedTokens}
              karaokeProgress={karaokeProgress}
            />
            {translation && showTranslation && (
              <Text className="mt-1 text-sm text-muted-foreground">
                {translation.line}
              </Text>
            )}
          </Pressable>
        );
      }}
    />
  );
}
