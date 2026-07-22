import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { TokenizedText } from './TokenizedText';
import type { SubtitleLine } from '@langplayer/shared';
import type { TokenCache } from '@langplayer/shared';

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
  const [l2Lines, setL2Lines] = useState<SubtitleLine[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
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
    (async () => {
      try {
        const res = await fetch(`${PYTHON_API_URL}/videos/${youtubeId}/subtitles?l2=${l2Lang.code}&l1=${l1Lang.code}`);
        if (!res.ok) return;
        const data = await res.json();
        const lines: SubtitleLine[] = (data.lines ?? []).map((l: any) => ({
          line: stripDurationPrefix(l.l2Line ?? ''),
          starttime: l.starttime,
        }));
        setL2Lines(lines);
        onLinesLoaded?.(lines.map((l) => l.starttime));
      } catch {}
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
            />
            {translation && showTranslation && (
              <Text className="mt-1 text-sm text-muted-foreground">
                {translation.line}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
