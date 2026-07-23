import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { TokenizedText } from '../TokenizedText';
import { DictionaryPopup } from '../dictionary/DictionaryPopup';
import type { DictionaryEntry, SubtitleLine } from '@langplayer/shared';
import type { TokenCache } from '@langplayer/shared';

/** Parse Directus-style CSV subs_l2 string → SubtitleLine[]. Format: starttime,line */
function parseCSVSubs(csv: string): SubtitleLine[] {
  const lines: SubtitleLine[] = [];
  const rows = csv.split('\n');
  for (const row of rows) {
    const parts = row.split(',');
    const t = parseFloat(parts[0]!);
    if (isNaN(t)) continue;
    const text = parts.slice(1).join(',').trim();
    if (!text) continue;
    lines.push({ starttime: t, line: text });
  }
  return lines;
}

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
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

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
            lines = parseCSVSubs(video.subs_l2);
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

  // Find active line by current video time
  useEffect(() => {
    if (l2Lines.length === 0) return;
    let idx = -1;
    for (let i = 0; i < l2Lines.length; i++) {
      if (l2Lines[i]!.starttime <= currentTime) idx = i;
      else break;
    }
    if (idx !== activeIdx) {
      setActiveIdx(idx);
      // Auto-scroll to active line
      if (idx >= 0 && scrollRef.current) {
        scrollRef.current.scrollTo({ y: idx * 48, animated: true });
      }
    }
  }, [currentTime, l2Lines, activeIdx]);

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
    <ScrollView ref={scrollRef} className="flex-1 px-3">
      {translating && (
        <View className="py-1">
          <Text className="text-xs text-muted-foreground">
            Translating… {progress}/{l2Lines.length}
          </Text>
        </View>
      )}
      {l2Lines.map((line, i) => {
        const isActive = i === activeIdx;
        const translation = translatedLines[i];

        return (
          <Pressable
            key={i}
            onPress={() => onSeekToLine?.(line.starttime)}
            className={`rounded-lg px-3 py-2 mb-1 ${isActive ? 'bg-primary/10 border border-primary/30' : ''}`}
          >
            <TokenizedText
              text={line.line}
              l2Code={l2Lang.code}
              highlightTerms={highlightTerms}
              onWordPress={(word) => setSelectedWord(word)}
            />
            {translation && showTranslation && (
              <Text className="mt-1 text-sm text-muted-foreground">
                {translation.line}
              </Text>
            )}
          </Pressable>
        );
      })}
      <DictionaryPopup
        visible={!!selectedWord}
        word={selectedWord ?? ''}
        onClose={() => setSelectedWord(null)}
        onViewDetail={(entry: DictionaryEntry, popupResults: DictionaryEntry[]) => {
          setSelectedWord(null); // close popup before navigating
          setDetailHead(entry.head);
          setSidebarSource({ kind: 'results', items: popupResults });
          setCameFromSearch(true);
          const safeId = entry.id.replace(/,/g, '~');
          router.push(`word/${safeId}` as any);
        }}
      />
    </ScrollView>
  );
}
