'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import type { YouTubeVideo, SubtitleLine } from '@langplayer/shared';
import { findActiveLineIndex } from '@langplayer/shared';
import {
  stripSubtitleDurationPrefix,
  extractSubtitleDuration,
  type SyncedLine,
} from '@/lib/subtitle-csv';
import { AlertCircle, Loader2 } from 'lucide-react';
import { baseCode } from '@/lib/language-data';
import { useVideoTokenCache } from '@/hooks/use-video-token-cache';
import { useCaptionNormalization } from '@/hooks/use-caption-normalization';
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

export default function WatchPage() {
  const params = useParams<{ videoId: string }>();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const { playNext, playPrevious, hasNext, hasPrevious } = useVideoPlayer();
  const { playback, updatePlayback } = useSettingsContext();
  const videoId = params.videoId;

  const [video, setVideo] = useState<YouTubeVideo | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  // Holds a translation key (not a raw message) — rendered through t() so it
  // stays localized. The fetch can fail even though the YouTube player itself
  // is playing, so this must never imply the video is missing.
  const [dataError, setDataError] = useState<string | null>(null);
  const [startTime] = useState(() => getSavedPosition(videoId));

  const { cache: tokenCache, loaded: tokenCacheLoaded } = useVideoTokenCache(video?.id, baseCode(l2.code));
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [subtitleStartTimes, setSubtitleStartTimes] = useState<number[]>([]);
  const [subtitleLines, setSubtitleLines] = useState<SyncedLine[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const [isWide, setIsWide] = useState(false);
  const isWideRef = useRef(isWide);
  isWideRef.current = isWide;
  const [translatingText, setTranslatingText] = useState<string | null>(null);

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

  // Wide = aspect ratio w:h > 1 (landscape); narrow = w:h ≤ 1 (portrait/square).
  // This handles desktops, tablets in landscape, and phones in landscape as "wide."
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const ratio = w / h;
      const wide = ratio > 1;
      setIsWide(wide);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const fetchVideo = async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}?l2=${baseCode(l2.code)}&l1=${baseCode(l1.code)}`);
        if (!res.ok) {
          setDataError('msg.failed_to_load_transcript');
          return;
        }
        const data = await res.json();
        const v = data.video ?? data;
        setVideo(v);
        // Update document title client-side (generateMetadata is static for perf)
        if (v?.title) {
          document.title = v.title;
        }
        if (data.lines) {
          setSubtitleLines(data.lines);
          setSubtitleStartTimes(data.lines.map((l: any) => l.starttime));
        }
        setIsGenerated(data?.isGenerated === true);
      } catch {
        setDataError('msg.failed_to_load_transcript');
      } finally {
        setDataLoaded(true);
      }
    };
    fetchVideo();
  }, [videoId, l1, l2]);

  const handleTimeUpdate = useCallback((time: number) => { setCurrentTime(time); }, []);
  const handleDuration = useCallback((d: number) => { setDuration(d); }, []);
  const handleStateChange = useCallback((state: number) => {
    setPaused(state === PLAYER_STATES.PAUSED || state === PLAYER_STATES.ENDED);
  }, []);

  // ── Progressive caption normalization (SPEC-029) ──
  // Auto-generated captions load raw; the hook cleans them in 40-line chunks
  // near the playhead and hands back a sparse overlay. The overlay feeds both
  // the transcript and the subtitles-mode band below.
  const rawL2Lines = useMemo<SubtitleLine[]>(
    () => subtitleLines.map((l) => ({
      line: stripSubtitleDurationPrefix(l.l2Line),
      starttime: l.starttime,
      duration: extractSubtitleDuration(l),
    })),
    [subtitleLines],
  );
  const activeSubtitleIndex = findActiveLineIndex(subtitleStartTimes, currentTime);
  const { normalizedLines: captionOverlay } = useCaptionNormalization({
    youtubeId: video?.youtube_id,
    l2Code: baseCode(l2.code),
    lines: rawL2Lines,
    enabled: isGenerated && subtitleLines.length > 0,
    activeIndex: activeSubtitleIndex,
  });
  const displaySubtitleLines = useMemo<SyncedLine[]>(() => {
    if (!captionOverlay || captionOverlay.length === 0) return subtitleLines;
    return subtitleLines.map((l, i) => {
      const cleaned = captionOverlay[i];
      return cleaned ? { ...l, l2Line: cleaned } : l;
    });
  }, [subtitleLines, captionOverlay]);

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

  // Use videoId as the YouTube ID optimistically, update from API response if different.
  // This avoids a player destroy+recreate when data arrives (youtube_id rarely differs).
  const effectiveYoutubeId = video?.youtube_id ?? videoId;

  // Render the player once with a stable identity — React preserves the DOM/iframe
  // across loading→loaded transitions since the element stays at the same position.
  const playerElement = (
    <YouTubePlayer
      ref={playerRef}
      youtubeId={effectiveYoutubeId}
      autoplay
      startTime={startTime}
      onTimeUpdate={handleTimeUpdate}
      onDuration={handleDuration}
      onStateChange={handleStateChange}
    />
  );

  // ── Error state ──
  // The video may still be playing (the player renders optimistically from the
  // URL's videoId), so keep it mounted and surface the failure where the
  // subtitles would be — never replace the player with a full-page error.
  if (dataError && !video) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 h-[calc(100vh-5rem)] overflow-hidden">
        <div className="h-full">
          <div ref={videoWrapperRef} className="pb-2">
            {playerElement}
          </div>
          <div className="flex items-start justify-center gap-2 py-4 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span className="max-w-lg">{t(dataError)}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading state: show player chrome immediately, subtitles/data come later ──
  if (!dataLoaded) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 h-[calc(100vh-5rem)] overflow-hidden">
        <div className="h-full">
          <div ref={videoWrapperRef} className="pb-2">
            {playerElement}
          </div>
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t('msg.loading')}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Subtitles Mode: Wide ──
  if (isSubtitles && isWide) {
    return (
      <div className="mx-auto h-[calc(100vh-3.5rem)] overflow-hidden">
        <div className="relative h-full">
          <div className="h-full">{playerElement}</div>
          <SubtitlesModeBand
            overlay
            subtitleLines={displaySubtitleLines}
            currentTime={currentTime}
            onSeekToLine={handleSeekToLine}
            onSwitchToTranscriptMode={handleSwitchToTranscriptMode}
            hasPrevVideo={hasPrevious}
            hasNextVideo={hasNext}
            onPrevVideo={playPrevious}
            onNextVideo={playNext}
            tokenCache={tokenCache}
            tokenCacheLoaded={tokenCacheLoaded}
            videoTitle={video!.title}
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
          subtitleLines={displaySubtitleLines}
          currentTime={currentTime}
          onSeekToLine={handleSeekToLine}
          onSwitchToTranscriptMode={handleSwitchToTranscriptMode}
          hasPrevVideo={hasPrevious}
          hasNextVideo={hasNext}
          onPrevVideo={playPrevious}
          onNextVideo={playNext}
          tokenCache={tokenCache}
          tokenCacheLoaded={tokenCacheLoaded}
          videoTitle={video!.title}
        />
      </div>
    );
  }

  const v = video!;

  // ── Transcript Mode: Narrow ──
  // The viewport is split into two regions:
  //   1. Player + controls (shrink-0) — always visible
  //   2. Tabbed panel (flex-1 min-h-0) — transcript / queue / info tabs, scrolls internally
  if (!isWide) {
    const videoInfo = (
      <div className="space-y-4">
        <VideoMeta video={v} />
        {v.channel_id && <YouTubeChannelCard channelId={v.channel_id!} />}
      </div>
    );

    return (
      <div className="mx-auto max-w-7xl h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden">
        {/* Player + controls — fixed at top */}
        <div className="shrink-0 px-4 pt-4">
          <div ref={videoWrapperRef} className="pb-2">
            {playerElement}
          </div>
          <div className="flex justify-end pb-2">
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
              translatingText={translatingText}
            />
          </div>
        </div>
        {/* Tabbed panel — fills remaining space, scrolls internally */}
        <div className="flex-1 min-h-0 px-4 pb-4">
          <TranscriptQueuePanel
            contentRef={transcriptScrollRef}
            transcript={<SubtitleDisplay youtubeId={v.youtube_id} videoTitle={v.title} tokenCache={tokenCache} tokenCacheLoaded={tokenCacheLoaded} currentTime={currentTime} onLinesLoaded={setSubtitleStartTimes} onSeekToLine={handleSeekToLine} scrollContainerRef={transcriptScrollRef} initialLines={subtitleLines.length > 0 ? subtitleLines : undefined} isGenerated={isGenerated} normalizedOverlay={subtitleLines.length > 0 ? captionOverlay : undefined} onPauseLine={() => { playerRef.current?.pause(); setPaused(true); }} onTranslationProgress={setTranslatingText} />}
            queue={<VideoQueueList currentYoutubeId={v.youtube_id} />}
            info={videoInfo}
          />
        </div>
      </div>
    );
  }

  // ── Transcript Mode: Wide ──
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 h-[calc(100vh-5rem)] overflow-hidden">
      <div className="grid h-full overflow-hidden grid-cols-[1fr_320px] gap-6">
        <div className="flex-1 space-y-4 overflow-y-auto">
          <div ref={videoWrapperRef} className="pb-2">
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
              translatingText={translatingText}
            />
          </div>
          <VideoMeta video={v} />
          {v.channel_id && <YouTubeChannelCard channelId={v.channel_id!} />}
        </div>
        <aside className="min-h-0 overflow-hidden">
          <TranscriptQueuePanel
            contentRef={transcriptScrollRef}
            transcript={<SubtitleDisplay youtubeId={v.youtube_id} videoTitle={v.title} tokenCache={tokenCache} tokenCacheLoaded={tokenCacheLoaded} currentTime={currentTime} onLinesLoaded={setSubtitleStartTimes} onSeekToLine={handleSeekToLine} scrollContainerRef={transcriptScrollRef} initialLines={subtitleLines.length > 0 ? subtitleLines : undefined} isGenerated={isGenerated} normalizedOverlay={subtitleLines.length > 0 ? captionOverlay : undefined} onPauseLine={() => { playerRef.current?.pause(); setPaused(true); }} onTranslationProgress={setTranslatingText} />}
            queue={<VideoQueueList currentYoutubeId={v.youtube_id} />}
          />
        </aside>
      </div>
    </div>
  );
}
