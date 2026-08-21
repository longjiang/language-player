'use client';

import { useState, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Gauge,
  PanelRightOpen,
  PanelRightClose,
  Clock,
  ChevronLeft,
  ChevronRight,
  Heart,
  Bookmark,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useT } from '@/hooks/use-t';
import type { YouTubePlayerHandle } from './youtube-player';

// Speed options matching Classic: 1x → 0.75x → 0.5x → 1x
const SPEEDS = [1, 0.75, 0.5] as const;

interface VideoControlBarProps {
  playerRef: React.RefObject<YouTubePlayerHandle | null>;
  currentTime: number;
  duration: number;
  paused: boolean;
  onPauseToggle: () => void;
  onPreviousLine?: () => void;
  onNextLine?: () => void;
  onRewind?: () => void;
  onTogglePanel?: () => void;
  /** Whether the side panel (transcript) is currently open. When provided,
   *  the panel toggle icon reflects the state (PanelRightClose when open,
   *  PanelRightOpen when closed). Defaults to the watch page's behavior. */
  panelOpen?: boolean;
  onPreviousVideo?: () => void;
  onNextVideo?: () => void;
  onSeekBarClick?: (fraction: number) => void;
  hasPreviousLine?: boolean;
  hasNextLine?: boolean;
  hasPreviousVideo?: boolean;
  hasNextVideo?: boolean;
  /** Optional "Video X of Y" label shown between the prev/next video buttons. */
  videoCountText?: string | null;
  className?: string;
  /** When true, only shows LP-specific controls: ⏮ ← → ⏭ ◧. No progress, time, play, rewind, or speed. */
  reduced?: boolean;
  /** Places the sidebar toggle after the like and playlist controls. */
  panelAtEnd?: boolean;
  /** Optional translation progress text shown inline in reduced mode (e.g. "Translating 5/120"). */
  translatingText?: string | null;
  /** Like state + handler. When omitted, the heart button is hidden. */
  liked?: boolean;
  onToggleLike?: () => void;
  likeDisabled?: boolean;
  /** Opens the "save to playlist" dialog. When omitted, the bookmark is hidden. */
  onSaveToPlaylist?: () => void;
  playlistDisabled?: boolean;
}

export function VideoControlBar({
  playerRef,
  currentTime,
  duration,
  paused,
  onPauseToggle,
  onPreviousLine,
  onNextLine,
  onRewind,
  onTogglePanel,
  panelOpen,
  onPreviousVideo,
  onNextVideo,
  onSeekBarClick,
  hasPreviousLine = true,
  hasNextLine = true,
  hasPreviousVideo = false,
  hasNextVideo = false,
  videoCountText,
  className,
  reduced = false,
  panelAtEnd = false,
  translatingText,
  liked = false,
  onToggleLike,
  likeDisabled = false,
  onSaveToPlaylist,
  playlistDisabled = false,
}: VideoControlBarProps) {
  const t = useT();
  const [speedIndex, setSpeedIndex] = useState(0);

  const currentSpeed = SPEEDS[speedIndex];

  const toggleSpeed = useCallback(() => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    playerRef.current?.setPlaybackRate(SPEEDS[next]!);
  }, [speedIndex, playerRef]);

  const handleRewind = useCallback(() => {
    if (onRewind) {
      onRewind();
    } else {
      playerRef.current?.seekTo(Math.max(0, currentTime - 2));
    }
  }, [onRewind, currentTime, playerRef]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Reduced mode: compact inline bar with only LP-specific controls ──
  if (reduced) {
    return (
      <div className={cn('inline-flex items-center gap-0.5', className)}>
        {translatingText && (
          <span className="text-xs text-muted-foreground tabular-nums mr-1">{translatingText}</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={onPreviousVideo}
          disabled={!hasPreviousVideo || !onPreviousVideo}
          title={t('a11y.previous_video')}
        >
          <SkipBack className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={onPreviousLine}
          disabled={!hasPreviousLine}
          title={t('a11y.previous_line')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {videoCountText && (
          <span className="px-1 text-xs tabular-nums text-muted-foreground">
            {videoCountText}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={onNextLine}
          disabled={!hasNextLine}
          title={t('a11y.next_line')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={onNextVideo}
          disabled={!hasNextVideo || !onNextVideo}
          title={t('a11y.next_video')}
        >
          <SkipForward className="h-3.5 w-3.5" />
        </Button>
        {onTogglePanel && (
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7 text-muted-foreground hover:text-foreground', panelAtEnd && 'order-last')}
            onClick={onTogglePanel}
            title={t('a11y.video_info')}
            aria-pressed={panelOpen}
          >
            {panelOpen === false
              ? <PanelRightOpen className="h-3.5 w-3.5" />
              : <PanelRightClose className="h-3.5 w-3.5" />}
          </Button>
        )}
        {onToggleLike && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30',
              liked && 'text-destructive hover:text-destructive',
            )}
            onClick={onToggleLike}
            disabled={likeDisabled}
            title={liked ? t('action.unlike_video') : t('action.like_video')}
            aria-pressed={liked}
          >
            <Heart className={cn('h-3.5 w-3.5', liked && 'fill-current')} />
          </Button>
        )}
        {onSaveToPlaylist && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
            onClick={onSaveToPlaylist}
            disabled={playlistDisabled}
            title={t('action.add_to_playlist')}
          >
            <Bookmark className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  // ── Full mode ──
  return (
    <div className={cn('space-y-2', className)}>
      {/* Progress bar */}
      <button
        className="relative h-2 w-full cursor-pointer rounded-full bg-muted hover:h-3 transition-all group"
        onClick={(e) => {
          if (onSeekBarClick && duration > 0) {
            const rect = e.currentTarget.getBoundingClientRect();
            const fraction = (e.clientX - rect.left) / rect.width;
            onSeekBarClick(Math.max(0, Math.min(1, fraction)));
          }
        }}
        title={t('a11y.click_to_seek')}
        aria-label={t('a11y.seek_bar')}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-100"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </button>

      {/* Time display */}
      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>{formatTime(currentTime)}</span>
        <span>/</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-center gap-1">
        {/* Previous video (queue) */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={onPreviousVideo}
          disabled={!hasPreviousVideo || !onPreviousVideo}
          title={t('a11y.previous_video')}
        >
          <SkipBack className="h-4 w-4" />
        </Button>

        {/* Panel toggle */}
        {onTogglePanel && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={onTogglePanel}
            title={t('a11y.video_info')}
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        )}

        {/* Previous line */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={onPreviousLine}
          disabled={!hasPreviousLine}
          title={t('a11y.previous_line')}
        >
          <ChevronUp className="h-5 w-5" />
        </Button>

        {/* Rewind */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={handleRewind}
          title={t('a11y.rewind_2s')}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>

        {/* Play/Pause */}
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10"
          onClick={onPauseToggle}
          title={paused ? t('a11y.play') : t('a11y.pause')}
        >
          {paused ? (
            <Play className="h-5 w-5" />
          ) : (
            <Pause className="h-5 w-5" />
          )}
        </Button>

        {/* Next line */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={onNextLine}
          disabled={!hasNextLine}
          title={t('a11y.next_line')}
        >
          <ChevronDown className="h-5 w-5" />
        </Button>

        {/* Speed toggle */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-9 gap-1 px-2 text-xs font-medium',
            currentSpeed !== 1
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={toggleSpeed}
          title={t('a11y.speed')}
        >
          <Gauge className="h-4 w-4" />
          {currentSpeed === 1 ? '1×' : `${currentSpeed}×`}
        </Button>

        {/* Next video (queue) */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={onNextVideo}
          disabled={!hasNextVideo || !onNextVideo}
          title={t('a11y.next_video')}
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        {/* Like */}
        {onToggleLike && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-9 w-9 text-muted-foreground hover:text-foreground disabled:opacity-30',
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

        {/* Save to playlist */}
        {onSaveToPlaylist && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground disabled:opacity-30"
            onClick={onSaveToPlaylist}
            disabled={playlistDisabled}
            title={t('action.add_to_playlist')}
          >
            <Bookmark className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
