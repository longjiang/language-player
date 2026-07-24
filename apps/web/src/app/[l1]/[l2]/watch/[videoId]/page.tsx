'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useVideoPlayer } from '@/providers/video-player-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { YouTubePlayer, type YouTubePlayerHandle, PLAYER_STATES } from '@/components/video/youtube-player';
import { VideoMeta } from '@/components/video/video-meta';
import { VideoControlBar } from '@/components/video/video-control-bar';
import { TranscriptQueuePanel } from '@/components/video/transcript-queue-panel';
import { VideoQueueList } from '@/components/video/video-queue-list';
import { SubtitleDisplay } from '@/components/video/subtitle-display';
import { SubtitlesModeBand } from '@/components/video/subtitles-mode-band';
import type { YouTubeVideo } from '@langplayer/shared';
import { AlertCircle, Loader2 } from 'lucide-react';
import { baseCode } from '@/lib/language-data';
import { useVideoTokenCache } from '@/hooks/use-video-token-cache';
import { useWatchHistoryRecorder } from '@/hooks/use-watch-history-recorder';
import { YouTubeChannelCard } from '@/components/video/youtube-channel-card';

const WATCH_POS_PREFIX = 'lp-watch-pos-';
const SAVE_POS_INTERVAL = 5000;

function getSavedPosition(videoId: string): number {
  try {
    const raw = localStorage.getItem(WATCH_POS_PREFIX + videoId);
    if (raw) {
      const pos = parseFloat(raw);
      return Number.isFinite(pos) && pos > 1 ? pos : 0;
    }
  } catch { /* localStorage unavailable */ }
  return 0;
}

function savePosition(videoId: string, time: number) {
  try {
    if (time > 1) {
      localStorage.setItem(WATCH_POS_PREFIX + videoId, String(Math.round(time)));
    }
  } catch { /* quota exceeded — ignore */ }
}

interface SyncedLine {
  starttime: number;
  l1Line: string;
  l2Line: string;
}

export default function WatchPage() {
  const params = useParams<{ videoId: string }>();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const { playNext, playPrevious, hasNext, hasPrevious } = useVideoPlayer();
  const { playback, updatePlayback } = useSettingsContext();
  const videoId = params.videoId;

  const [video, setVideo] = useState<YouTubeVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState(() => getSavedPosition(videoId));

  const { cache: tokenCache, loaded: tokenCacheLoaded } = useVideoTokenCache(videoId, baseCode(l2.code));
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [subtitleStartTimes, setSubtitleStartTimes] = useState<number[]>([]);
  const [subtitleLines, setSubtitleLines] = useState<SyncedLine[]>([]);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const [isWide, setIsWide] = useState(false);

  useWatchHistoryRecorder(video?.id, currentTime);

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentTimeRef.current > 1) {
        savePosition(videoId, currentTimeRef.current);
      }
    }, SAVE_POS_INTERVAL);
    return () => clearInterval(interval);
  }, [videoId]);

  useEffect(() => {
    const handleBeforeUnload = () => savePosition(videoId, currentTimeRef.current);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') savePosition(videoId, currentTimeRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      savePosition(videoId, currentTimeRef.current);
    };
  }, [videoId]);

  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const fetchVideo = async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}?l2=${baseCode(l2.code)}&l1=${baseCode(l1.code)}`);
        if (!res.ok) throw new Error('Video not found');
        const data = await res.json();
        setVideo(data.video ?? data);
        if (data.lines) {
          setSubtitleLines(data.lines);
          setSubtitleStartTimes(data.lines.map((l: any) => l.starttime));
        }
      } catch (err: any) {
        setError(err.message ?? 'Failed to load video');
      } finally {
        setLoading(false);
      }
    };
    fetchVideo();
  }, [videoId]);

  const handleTimeUpdate = useCallback((time: number) => { setCurrentTime(time); }, []);
  const handleDuration = useCallback((d: number) => { setDuration(d); }, []);
  const handleStateChange = useCallback((state: number) => {
    setPaused(state === PLAYER_STATES.PAUSED || state === PLAYER_STATES.ENDED);
  }, []);

  const handlePauseToggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (paused) { player.play(); setPaused(false); }
    else { player.pause(); setPaused(true); }
  }, [paused]);

  const handleRewind = useCallback(() => {
    playerRef.current?.seekTo(Math.max(0, currentTime - 2));
  }, [currentTime]);

  const handleRewindToLine = useCallback(() => {
    for (let i = subtitleStartTimes.length - 1; i >= 0; i--) {
      if (subtitleStartTimes[i]! <= currentTime) {
        playerRef.current?.seekTo(subtitleStartTimes[i]!);
        return;
      }
    }
  }, [currentTime, subtitleStartTimes]);

  const handlePreviousLine = useCallback(() => {
    for (let i = subtitleStartTimes.length - 1; i >= 0; i--) {
      if (subtitleStartTimes[i]! < currentTime - 0.5) {
        playerRef.current?.seekTo(subtitleStartTimes[i]!);
        return;
      }
    }
    playerRef.current?.seekTo(Math.max(0, currentTime - 3));
  }, [currentTime, subtitleStartTimes]);

  const handleNextLine = useCallback(() => {
    for (let i = 0; i < subtitleStartTimes.length; i++) {
      if (subtitleStartTimes[i]! > currentTime + 0.5) {
        playerRef.current?.seekTo(subtitleStartTimes[i]!);
        return;
      }
    }
    playerRef.current?.seekTo(Math.min(duration, currentTime + 3));
  }, [currentTime, duration, subtitleStartTimes]);

  const isSubtitles = playback.transcriptMode === 'subtitles';

  const handleSeekBarClick = useCallback(
    (fraction: number) => { playerRef.current?.seekTo(fraction * duration); },
    [duration],
  );

  const handleSeekToLine = useCallback((t: number) => { playerRef.current?.seekTo(t); }, []);

  const handleSwitchToTranscriptMode = useCallback(() => {
    updatePlayback({ transcriptMode: 'transcript' });
  }, [updatePlayback]);

  const handleSwitchToSubtitlesMode = useCallback(() => {
    updatePlayback({ transcriptMode: 'subtitles' });
  }, [updatePlayback]);

  const handleTogglePanel = useCallback(() => {
    updatePlayback({ transcriptMode: isSubtitles ? 'transcript' : 'subtitles' });
  }, [updatePlayback, isSubtitles]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePauseToggle();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey && hasPrevious) { playPrevious(); }
          else { handlePreviousLine(); }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey && hasNext) { playNext(); }
          else { handleNextLine(); }
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleRewindToLine();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePauseToggle, handlePreviousLine, handleNextLine, handleRewindToLine, hasPrevious, hasNext, playPrevious, playNext]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">{t('msg.video_unavailable')}</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (!video) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">{t('msg.video_unavailable')}</h1>
        <p className="mt-2 text-muted-foreground">{t('msg.video_unavailable')}</p>
      </div>
    );
  }

  const v = video;

  const playerElement = (
    <YouTubePlayer
      ref={playerRef}
      youtubeId={v.youtube_id}
      autoplay
      startTime={startTime}
      onTimeUpdate={handleTimeUpdate}
      onDuration={handleDuration}
      onStateChange={handleStateChange}
    />
  );

  // ── Subtitles Mode: Wide ──
  if (isSubtitles && isWide) {
    return (
      <div className="mx-auto h-[calc(100vh-3.5rem)] overflow-hidden">
        <div className="relative h-full">
          <div className="h-full">{playerElement}</div>
          <SubtitlesModeBand
            overlay
            subtitleLines={subtitleLines}
            currentTime={currentTime}
            onSeekToLine={handleSeekToLine}
            onSwitchToTranscriptMode={handleSwitchToTranscriptMode}
            hasPrevVideo={hasPrevious}
            hasNextVideo={hasNext}
            onPrevVideo={playPrevious}
            onNextVideo={playNext}
            tokenCache={tokenCache}
            tokenCacheLoaded={tokenCacheLoaded}
            videoTitle={video.title}
          />
        </div>
      </div>
    );
  }

  // ── Subtitles Mode: Narrow ──
  if (isSubtitles) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div ref={videoWrapperRef} className="bg-background pb-2">
          {playerElement}
        </div>
        <SubtitlesModeBand
          overlay={false}
          subtitleLines={subtitleLines}
          currentTime={currentTime}
          onSeekToLine={handleSeekToLine}
          onSwitchToTranscriptMode={handleSwitchToTranscriptMode}
          hasPrevVideo={hasPrevious}
          hasNextVideo={hasNext}
          onPrevVideo={playPrevious}
          onNextVideo={playNext}
          tokenCache={tokenCache}
          tokenCacheLoaded={tokenCacheLoaded}
          videoTitle={video.title}
        />
      </div>
    );
  }

  // ── Transcript Mode: Narrow ──
  if (!isWide) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col gap-6">
          <div className="sticky top-[3.5rem] z-10 bg-background">
            <div ref={videoWrapperRef} className="pb-2">
              {playerElement}
            </div>
            <div className="flex justify-end pb-3">
              <VideoControlBar
                reduced
                playerRef={playerRef}
                currentTime={currentTime}
                duration={duration}
                paused={paused}
                onPauseToggle={handlePauseToggle}
                onPreviousLine={handlePreviousLine}
                onNextLine={handleNextLine}
                onPreviousVideo={playPrevious}
                onNextVideo={playNext}
                onTogglePanel={handleTogglePanel}
                hasPreviousVideo={hasPrevious}
                hasNextVideo={hasNext}
              />
            </div>
          </div>
          <VideoMeta video={v} />
          {v.channel_id && <YouTubeChannelCard channelId={v.channel_id!} />}
          <TranscriptQueuePanel
            contentRef={transcriptScrollRef}
            transcript={<SubtitleDisplay youtubeId={v.youtube_id} videoTitle={v.title} tokenCache={tokenCache} tokenCacheLoaded={tokenCacheLoaded} currentTime={currentTime} onLinesLoaded={setSubtitleStartTimes} onSeekToLine={handleSeekToLine} scrollContainerRef={transcriptScrollRef} initialLines={subtitleLines.length > 0 ? subtitleLines : undefined} />}
            queue={<VideoQueueList currentYoutubeId={v.youtube_id} />}
          />
        </div>
      </div>
    );
  }

  // ── Transcript Mode: Wide ──
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:h-[calc(100vh-5rem)] lg:overflow-hidden">
      <div className="flex flex-col gap-6 lg:grid lg:h-full lg:overflow-hidden lg:grid-cols-[1fr_320px]">
        <div className="flex-1 space-y-4 lg:overflow-y-auto">
          <div ref={videoWrapperRef} className="sticky top-[3.5rem] z-10 bg-background pb-2 lg:static lg:top-auto lg:z-auto">
            {playerElement}
          </div>
          <div className="flex justify-end">
            <VideoControlBar
              reduced
              playerRef={playerRef}
              currentTime={currentTime}
              duration={duration}
              paused={paused}
              onPauseToggle={handlePauseToggle}
              onPreviousLine={handlePreviousLine}
              onNextLine={handleNextLine}
              onPreviousVideo={playPrevious}
              onNextVideo={playNext}
              onTogglePanel={handleTogglePanel}
              hasPreviousVideo={hasPrevious}
              hasNextVideo={hasNext}
            />
          </div>
          <VideoMeta video={v} />
          {v.channel_id && <YouTubeChannelCard channelId={v.channel_id!} />}
        </div>
        <aside className="min-h-0 overflow-hidden">
          <TranscriptQueuePanel
            contentRef={transcriptScrollRef}
            transcript={<SubtitleDisplay youtubeId={v.youtube_id} videoTitle={v.title} tokenCache={tokenCache} tokenCacheLoaded={tokenCacheLoaded} currentTime={currentTime} onLinesLoaded={setSubtitleStartTimes} onSeekToLine={handleSeekToLine} scrollContainerRef={transcriptScrollRef} initialLines={subtitleLines.length > 0 ? subtitleLines : undefined} />}
            queue={<VideoQueueList currentYoutubeId={v.youtube_id} />}
          />
        </aside>
      </div>
    </div>
  );
}

