import React, { useMemo, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { TokenizedText } from '../TokenizedText';
import { ICON_MUTED, ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { SkipBack, SkipForward, ChevronLeft, ChevronRight, PanelRightOpen } from 'lucide-react-native';
import type { TokenCache } from '@langplayer/shared';

interface SubtitleLine {
  starttime: number;
  l2Line: string;
  l1Line: string;
}

interface SubtitlesModeBandProps {
  subtitleLines: SubtitleLine[];
  currentTime: number;
  onSeekToLine: (time: number) => void;
  onSwitchToTranscriptMode: () => void;
  hasPrevVideo: boolean;
  hasNextVideo: boolean;
  onPrevVideo: () => void;
  onNextVideo: () => void;
  tokenCache?: TokenCache;
  tokenCacheLoaded?: boolean;
  videoTitle?: string;
  overlay?: boolean;
}

export function SubtitlesModeBand({
  subtitleLines,
  currentTime,
  onSeekToLine,
  onSwitchToTranscriptMode,
  hasPrevVideo,
  hasNextVideo,
  onPrevVideo,
  onNextVideo,
  tokenCache,
  tokenCacheLoaded,
  videoTitle,
  overlay = true,
}: SubtitlesModeBandProps) {
  const { l2Lang } = useLanguage();
  const { display } = useSettingsContext();
  const showTranslation = display.translation;

  const activeIndex = useMemo(() => {
    if (subtitleLines.length === 0) return -1;
    let idx = 0;
    for (let i = 1; i < subtitleLines.length; i++) {
      if (subtitleLines[i]!.starttime <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [currentTime, subtitleLines]);

  const activeLine = activeIndex >= 0 ? subtitleLines[activeIndex] : null;
  const isFirstLine = activeIndex <= 0;
  const isLastLine = activeIndex >= subtitleLines.length - 1;

  const handlePrevLine = useCallback(() => {
    if (isFirstLine || !activeLine) return;
    const prev = subtitleLines[activeIndex - 1];
    if (prev) onSeekToLine(prev.starttime);
  }, [activeIndex, subtitleLines, onSeekToLine, isFirstLine, activeLine]);

  const handleNextLine = useCallback(() => {
    if (isLastLine || !activeLine) return;
    const next = subtitleLines[activeIndex + 1];
    if (next) onSeekToLine(next.starttime);
  }, [activeIndex, subtitleLines, onSeekToLine, isLastLine, activeLine]);

  const handleSubtitleRowPress = useCallback(() => {
    if (activeLine) onSeekToLine(activeLine.starttime);
  }, [activeLine, onSeekToLine]);

  const btnColor = overlay ? ICON_ON_PRIMARY : ICON_MUTED;
  const containerBg = overlay ? 'bg-black/70' : 'bg-card border-t border-border';
  const textColor = overlay ? 'text-white' : 'text-foreground';
  const transColor = overlay ? 'text-white/70' : 'text-muted-foreground';
  const placeholderColor = overlay ? 'text-white/50' : 'text-muted-foreground';
  const separatorColor = overlay ? 'border-white/20' : 'border-border';

  return (
    <View className={`${containerBg} min-h-[6rem] ${overlay ? 'absolute bottom-0 left-0 right-0 z-10 rounded-t-xl' : ''}`}>
      {/* Control row */}
      <View className="flex-row items-center gap-0.5 px-2 py-1">
        <Pressable
          onPress={onPrevVideo}
          disabled={!hasPrevVideo}
          className="rounded p-1.5 active:bg-white/10 disabled:opacity-30"
        >
          <SkipBack size={18} color={btnColor} />
        </Pressable>
        <Pressable
          onPress={handlePrevLine}
          disabled={isFirstLine}
          className="rounded p-1.5 active:bg-white/10 disabled:opacity-30"
        >
          <ChevronLeft size={20} color={btnColor} />
        </Pressable>
        <Pressable
          onPress={handleNextLine}
          disabled={isLastLine}
          className="rounded p-1.5 active:bg-white/10 disabled:opacity-30"
        >
          <ChevronRight size={20} color={btnColor} />
        </Pressable>
        <Pressable
          onPress={onNextVideo}
          disabled={!hasNextVideo}
          className="rounded p-1.5 active:bg-white/10 disabled:opacity-30"
        >
          <SkipForward size={18} color={btnColor} />
        </Pressable>
        <View className="flex-1" />
        <Pressable
          onPress={onSwitchToTranscriptMode}
          className="rounded p-1.5 active:bg-white/10"
        >
          <PanelRightOpen size={18} color={btnColor} />
        </Pressable>
      </View>

      {/* Separator */}
      <View className={`mx-3 border-t ${separatorColor}`} />

      {/* Subtitle row */}
      <Pressable
        className="flex-1 flex-col items-center justify-center px-4 py-2 min-h-0"
        onPress={handleSubtitleRowPress}
      >
        {activeLine ? (
          <>
            <Text className={`text-center ${textColor}`}>
              <TokenizedText
                text={activeLine.l2Line}
                l2Code={l2Lang.code}
                tokenCache={tokenCache}
                tokenCacheLoaded={tokenCacheLoaded}
                context={videoTitle ? { videoTitle } : undefined}
              />
            </Text>
            {showTranslation && activeLine.l1Line ? (
              <Text className={`text-sm text-center mt-0.5 ${transColor}`}>
                {activeLine.l1Line}
              </Text>
            ) : null}
          </>
        ) : (
          <Text className={`text-sm ${placeholderColor}`}>...</Text>
        )}
      </Pressable>
    </View>
  );
}
