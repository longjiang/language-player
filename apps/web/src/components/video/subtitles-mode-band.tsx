'use client';

import { useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, SkipBack, SkipForward, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TokenizedText } from '@/components/tokenized-text';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { cn } from '@/lib/utils';
import type { SyncedLine } from '@/lib/subtitle-csv';
import type { TokenCache } from '@langplayer/shared';

interface SubtitlesModeBandProps {
  subtitleLines: SyncedLine[];
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
  const { l2 } = useLanguage();
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
    if (isFirstLine) return;
    const prev = subtitleLines[activeIndex - 1];
    if (prev) onSeekToLine(prev.starttime);
  }, [activeIndex, subtitleLines, onSeekToLine, isFirstLine]);

  const handleNextLine = useCallback(() => {
    if (isLastLine) return;
    const next = subtitleLines[activeIndex + 1];
    if (next) onSeekToLine(next.starttime);
  }, [activeIndex, subtitleLines, onSeekToLine, isLastLine]);

  const handleSubtitleRowClick = useCallback(
    (e: React.MouseEvent) => {
      if (activeLine && e.target === e.currentTarget) {
        onSeekToLine(activeLine.starttime);
      }
    },
    [activeLine, onSeekToLine],
  );

  const containerClass = overlay
    ? 'absolute bottom-14 left-4 right-4 z-10 bg-black/70 backdrop-blur-sm rounded-t-xl'
    : 'bg-card border-t border-border';

  const btnColorClass = overlay
    ? 'text-white/80 hover:text-white hover:bg-white/10'
    : 'text-muted-foreground hover:text-foreground';
  const separatorClass = overlay ? 'border-white/20' : 'border-border';
  const textClass = overlay ? 'text-white' : 'text-foreground';
  const transClass = overlay ? 'text-white/70' : 'text-muted-foreground';
  const placeholderClass = overlay ? 'text-white/50' : 'text-muted-foreground';

  return (
    <div className={cn(containerClass, 'min-h-[6rem] flex flex-col')}>
      <div className="flex items-center gap-0.5 px-2 py-1">
        <Button
          variant="ghost" size="icon"
          className={cn('h-8 w-8', btnColorClass)}
          onClick={onPrevVideo} disabled={!hasPrevVideo}
          title="Previous video"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className={cn('h-8 w-8', btnColorClass)}
          onClick={handlePrevLine} disabled={isFirstLine}
          title="Previous subtitle line"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className={cn('h-8 w-8', btnColorClass)}
          onClick={handleNextLine} disabled={isLastLine}
          title="Next subtitle line"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className={cn('h-8 w-8', btnColorClass)}
          onClick={onNextVideo} disabled={!hasNextVideo}
          title="Next video"
        >
          <SkipForward className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost" size="icon"
          className={cn('h-8 w-8', btnColorClass)}
          onClick={onSwitchToTranscriptMode}
          title="Show transcript & queue"
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
      </div>

      <div className={cn('mx-3 border-t', separatorClass)} />

      <div
        className="flex-1 flex flex-col items-center justify-center px-4 py-2 cursor-pointer min-h-0"
        onClick={handleSubtitleRowClick}
      >
        {activeLine ? (
          <>
            <div className={cn('text-center', textClass)}>
              <TokenizedText
                text={activeLine.l2Line}
                l2Code={l2.code}
                tokenCache={tokenCache}
                tokenCacheLoaded={tokenCacheLoaded}
                context={videoTitle ? { videoTitle } : undefined}
              />
            </div>
            {showTranslation && activeLine.l1Line && (
              <p className={cn('text-sm text-center mt-0.5', transClass)}>
                {activeLine.l1Line}
              </p>
            )}
          </>
        ) : (
          <p className={cn('text-sm', placeholderClass)}>...</p>
        )}
      </div>
    </div>
  );
}
