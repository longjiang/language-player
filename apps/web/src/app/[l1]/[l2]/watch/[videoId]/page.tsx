'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useVideoPlayer } from '@/providers/video-player-provider';
import { useT } from '@/hooks/use-t';
import { YouTubePlayer, type YouTubePlayerHandle, PLAYER_STATES } from '@/components/video/youtube-player';
import { VideoMeta } from '@/components/video/video-meta';
import { VideoControlBar } from '@/components/video/video-control-bar';
import { SubtitleDisplay } from '@/components/video/subtitle-display';
import type { YouTubeVideo } from '@langplayer/shared';
import { AlertCircle, Loader2, SkipBack, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { baseCode } from '@/lib/language-data';

export default function WatchPage() {
  const params = useParams<{ videoId: string }>();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const { playNext, playPrevious, hasNext, hasPrevious } = useVideoPlayer();
  const videoId = params.videoId;

  const [video, setVideo] = useState<YouTubeVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [subtitleStartTimes, setSubtitleStartTimes] = useState<number[]>([]);
  const playerRef = useRef<YouTubePlayerHandle>(null);

  // Fetch video metadata on mount
  useEffect(() => {
    const fetchVideo = async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}?l2=${baseCode(l2.code)}`);
        if (!res.ok) throw new Error('Video not found');
        const data = await res.json();
        setVideo(data);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load video');
      } finally {
        setLoading(false);
      }
    };
    fetchVideo();
  }, [videoId]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleDuration = useCallback((d: number) => {
    setDuration(d);
  }, []);

  const handleStateChange = useCallback((state: number) => {
    setPaused(state === PLAYER_STATES.PAUSED || state === PLAYER_STATES.ENDED);
  }, []);

  const handlePauseToggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (paused) {
      player.play();
      setPaused(false);
    } else {
      player.pause();
      setPaused(true);
    }
  }, [paused]);

  const handleRewind = useCallback(() => {
    playerRef.current?.seekTo(Math.max(0, currentTime - 2));
  }, [currentTime]);

  const handlePreviousLine = useCallback(() => {
    // Find the subtitle line that ended just before currentTime
    for (let i = subtitleStartTimes.length - 1; i >= 0; i--) {
      if (subtitleStartTimes[i]! < currentTime - 0.5) {
        playerRef.current?.seekTo(subtitleStartTimes[i]!);
        return;
      }
    }
    // Fallback: seek back 3 seconds
    playerRef.current?.seekTo(Math.max(0, currentTime - 3));
  }, [currentTime, subtitleStartTimes]);

  const handleNextLine = useCallback(() => {
    // Find the next subtitle line after currentTime
    for (let i = 0; i < subtitleStartTimes.length; i++) {
      if (subtitleStartTimes[i]! > currentTime + 0.5) {
        playerRef.current?.seekTo(subtitleStartTimes[i]!);
        return;
      }
    }
    // Fallback: seek forward 3 seconds
    playerRef.current?.seekTo(Math.min(duration, currentTime + 3));
  }, [currentTime, duration, subtitleStartTimes]);

  const handleSeekBarClick = useCallback(
    (fraction: number) => {
      playerRef.current?.seekTo(fraction * duration);
    },
    [duration],
  );

  // Keyboard shortcuts (matching Classic: Space, R, ←, →, M)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePauseToggle();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePreviousLine();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNextLine();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleRewind();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          // Speed toggle handled by VideoControlBar internally
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePauseToggle, handlePreviousLine, handleNextLine, handleRewind]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">{t('msg.video_unavailable')}</h1>
        <p className="mt-2 text-muted-foreground">
          {error ?? t('msg.video_unavailable')}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main: Player + Controls + Meta + Subtitles */}
        <div className="space-y-4">
          <YouTubePlayer
            ref={playerRef}
            youtubeId={video.youtube_id}
            autoplay
            onTimeUpdate={handleTimeUpdate}
            onDuration={handleDuration}
            onStateChange={handleStateChange}
          />

          <VideoControlBar
            playerRef={playerRef}
            currentTime={currentTime}
            duration={duration}
            paused={paused}
            onPauseToggle={handlePauseToggle}
            onPreviousLine={handlePreviousLine}
            onNextLine={handleNextLine}
            onRewind={handleRewind}
            onSeekBarClick={handleSeekBarClick}
            onPreviousVideo={hasPrevious ? playPrevious : undefined}
            onNextVideo={hasNext ? playNext : undefined}
          />

          <VideoMeta video={video} />
          <SubtitleDisplay
            youtubeId={video.youtube_id}
            currentTime={currentTime}
            onLinesLoaded={setSubtitleStartTimes}
          />
        </div>

        {/* Sidebar: Up Next */}
        <aside className="hidden lg:block">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 font-semibold">{t('title.up_next')}</h3>
            {hasNext || hasPrevious ? (
              <div className="space-y-2">
                {hasPrevious && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={playPrevious}
                  >
                    <SkipBack className="mr-2 h-4 w-4" />
                    {t('action.previous_video')}
                  </Button>
                )}
                {hasNext && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={playNext}
                  >
                    <SkipForward className="mr-2 h-4 w-4" />
                    {t('action.next_video')}
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('msg.related_videos')}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
