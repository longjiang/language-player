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
  Info,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
  onOpenInfo?: () => void;
  hasPreviousLine?: boolean;
  hasNextLine?: boolean;
  className?: string;
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
  onOpenInfo,
  hasPreviousLine = true,
  hasNextLine = true,
  className,
}: VideoControlBarProps) {
  const [speedIndex, setSpeedIndex] = useState(0);

  const currentSpeed = SPEEDS[speedIndex];

  const toggleSpeed = useCallback(() => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    playerRef.current?.setPlaybackRate(SPEEDS[next]);
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

  return (
    <div className={cn('space-y-2', className)}>
      {/* Progress bar */}
      <div className="relative h-1 w-full rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-300"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {/* Time display */}
      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>{formatTime(currentTime)}</span>
        <span>/</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-center gap-1">
        {/* Info */}
        {onOpenInfo && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={onOpenInfo}
            title="Video info"
          >
            <Info className="h-4 w-4" />
          </Button>
        )}

        {/* Previous line */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={onPreviousLine}
          disabled={!hasPreviousLine}
          title="Previous line (←)"
        >
          <ChevronUp className="h-5 w-5" />
        </Button>

        {/* Rewind */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={handleRewind}
          title="Rewind 2s (R)"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>

        {/* Play/Pause */}
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10"
          onClick={onPauseToggle}
          title={paused ? 'Play (Space)' : 'Pause (Space)'}
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
          title="Next line (→)"
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
          title="Speed (M)"
        >
          <Gauge className="h-4 w-4" />
          {currentSpeed === 1 ? '1×' : `${currentSpeed}×`}
        </Button>
      </div>
    </div>
  );
}
