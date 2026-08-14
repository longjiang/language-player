'use client';

import { useMemo, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  PanelRightOpen,
  Heart,
  Bookmark,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TokenizedText } from '@/components/tokenized-text';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useTextScale } from '@/hooks/use-text-scale';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import type { SyncedLine } from '@/lib/subtitle-csv';
import { stripSubtitleDurationPrefix } from '@/lib/subtitle-csv';
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
  liked?: boolean;
  onToggleLike?: () => void;
  likeDisabled?: boolean;
  onSaveToPlaylist?: () => void;
  playlistDisabled?: boolean;
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
  liked = false,
  onToggleLike,
  likeDisabled = false,
  onSaveToPlaylist,
  playlistDisabled = false,
}: SubtitlesModeBandProps) {
  const { l2 } = useLanguage();
  const { display } = useSettingsContext();
  const t = useT();
  const textZoomFactor = useTextScale();
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

  const activeDisplayText = activeLine ? stripSubtitleDurationPrefix(activeLine.l2Line) : '';

  return (
    <div className={cn(containerClass, 'min-h-[6rem] flex flex-col')}>
      <div className="flex items-center gap-0.5 px-2 py-1">
        <Button
          variant="ghost" size="icon"
          className={cn('h-8 w-8', btnColorClass)}
          onClick={onPrevVideo} disabled={!hasPrevVideo}
          title={t('player.previous_video')}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className={cn('h-8 w-8', btnColorClass)}
          onClick={handlePrevLine} disabled={isFirstLine}
          title={t('player.previous_subtitle_line')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className={cn('h-8 w-8', btnColorClass)}
          onClick={handleNextLine} disabled={isLastLine}
          title={t('player.next_subtitle_line')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className={cn('h-8 w-8', btnColorClass)}
          onClick={onNextVideo} disabled={!hasNextVideo}
          title={t('player.next_video')}
        >
          <SkipForward className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        {onToggleLike && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8',
              btnColorClass,
              liked && 'text-destructive hover:text-destructive',
            )}
            onClick={onToggleLike}
            disabled={likeDisabled}
            title={liked ? t('action.unlike_video') : t('action.like_video')}
            aria-pressed={liked}
          >
            <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
          </Button>
        )}
        {onSaveToPlaylist && (
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', btnColorClass)}
            onClick={onSaveToPlaylist}
            disabled={playlistDisabled}
            title={t('action.add_to_playlist')}
          >
            <Bookmark className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost" size="icon"
          className={cn('h-8 w-8', btnColorClass)}
          onClick={onSwitchToTranscriptMode}
          title={t('player.show_transcript_and_queue')}
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
                text={activeDisplayText}
                l2Code={l2.code}
                textScale={1.5}
                tokenCache={tokenCache}
                tokenCacheLoaded={tokenCacheLoaded}
                context={videoTitle ? { videoTitle } : undefined}
              />
            </div>
            {showTranslation && activeLine.l1Line && (
              // Same 1.5× multiplier as the L2 subtitle line (SPEC-051).
              <p
                className={cn('text-sm text-center mt-0.5 leading-relaxed', transClass)}
                style={{ fontSize: `${0.875 * 1.5 * textZoomFactor}rem` }}
              >
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
