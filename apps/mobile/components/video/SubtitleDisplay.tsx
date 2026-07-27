import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { TokenizedText } from '../TokenizedText';
import { parseSubtitleCSV } from '@langplayer/utils';
import type { DictionaryEntry, SubtitleLine, TokenCache } from '@langplayer/shared';

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
  const { display } = useSettingsContext();
  const t = useT();
  const router = useRouter();
  const { setDetailHead, setSidebarSource, setCameFromSearch } = useDictionaryContext();
  const [l2Lines, setL2Lines] = useState<SubtitleLine[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const scrollRef = useRef<FlatList<SubtitleLine>>(null);

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

  // Find active line by current video time — synchronous, no feedback loop
  const computedActiveIdx = useMemo(() => {
    if (l2Lines.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < l2Lines.length; i++) {
      if (l2Lines[i]!.starttime <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [currentTime, l2Lines]);

  // Keep state in sync with computed value; scroll when it changes
  useEffect(() => {
    if (computedActiveIdx !== activeIdx) {
      setActiveIdx(computedActiveIdx);
      if (computedActiveIdx >= 0 && scrollRef.current) {
        scrollRef.current.scrollToIndex({ index: computedActiveIdx, animated: true, viewPosition: 0.5 });
      }
    }
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
      initialNumToRender={10}
      windowSize={5}
      maxToRenderPerBatch={10}
      getItemLayout={(_, index) => ({
        // Estimated item height (py-2 + mb-1 + text-base + optional translation).
        // Variable-height lines cause occasional onScrollToIndexFailed (handled below).
        length: 48,
        offset: 48 * index,
        index,
      })}
      contentContainerStyle={{ paddingHorizontal: 12 }}
      onScrollToIndexFailed={() => {
        // Fallback: approximate scroll by offset (lines may be variable height)
      }}
      ListHeaderComponent={translating ? (
        <View className="py-1">
          <Text className="text-xs text-muted-foreground">
            Translating… {progress}/{l2Lines.length}
          </Text>
        </View>
      ) : null}
      renderItem={({ item: line, index: i }) => {
        const isActive = i === activeIdx;
        const translation = translatedLines[i];

        return (
          <Pressable
            onPress={() => onSeekToLine?.(line.starttime)}
            className={`rounded-lg px-3 py-2 mb-1 ${isActive ? 'bg-primary/10 border border-primary/30' : ''}`}
          >
            <TokenizedText
              text={line.line}
              l2Code={l2Lang.code}
              highlightTerms={highlightTerms}
              tokenCache={tokenCache}
              tokenCacheLoaded={tokenCacheLoaded}
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
