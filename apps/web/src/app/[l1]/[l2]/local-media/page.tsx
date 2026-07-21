'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useCustomMedia } from '@/hooks/use-custom-media';
import {
  HTML5Player,
  PLAYER_STATES,
  type YouTubePlayerHandle,
} from '@/components/video/html5-player';
import { VideoControlBar } from '@/components/video/video-control-bar';
import { SubtitleDisplay } from '@/components/video/subtitle-display';
import { CustomMediaUpload } from '@/components/video/custom-media-upload';
import { Loader2 } from 'lucide-react';

export default function CustomMediaPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const customMedia = useCustomMedia();

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [subtitleStartTimes, setSubtitleStartTimes] = useState<number[]>([]);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  // Keep a ref to currentTime for save effects
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // Auto-save position every 5 seconds during playback
  useEffect(() => {
    if (!customMedia.hasMedia) return;
    const interval = setInterval(() => {
      customMedia.savePosition(currentTimeRef.current);
    }, 5000);
    return () => clearInterval(interval);
  }, [customMedia.hasMedia, customMedia.savePosition]);

  // Save position on tab close / navigation away
  useEffect(() => {
    const save = () => customMedia.savePosition(currentTimeRef.current);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', handleVisibility);
      save();
    };
  }, [customMedia.savePosition]);

  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), []);
  const handleDuration = useCallback((d: number) => setDuration(d), []);

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

  const handleSeekBarClick = useCallback(
    (fraction: number) => playerRef.current?.seekTo(fraction * duration),
    [duration],
  );

  // Keyboard shortcuts (matching watch page)
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePauseToggle, handlePreviousLine, handleNextLine, handleRewind]);

  // ── Loading state while restoring from IndexedDB ──
  if (customMedia.initializing) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── No media loaded — show upload ──
  if (!customMedia.hasMedia) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="mb-4 text-xl font-bold">{t('title.local_media')}</h1>
        <CustomMediaUpload
          onOpenFile={customMedia.openFile}
          onLoadCaptions={customMedia.loadCaptions}
          onClear={customMedia.clear}
          onRequestPermission={customMedia.requestPermission}
          fileName={customMedia.fileName}
          isAudio={customMedia.isAudio}
          hasSubtitles={customMedia.subtitleLines.length > 0}
          needsPermission={customMedia.needsPermission}
          hasMedia={customMedia.hasMedia}
        />
      </div>
    );
  }

  // ── Media loaded — player + transcript ──
  const hasSubtitles = customMedia.subtitleLines.length > 0;
  const initialLines = customMedia.subtitleLines.map((l) => ({
    starttime: l.starttime,
    l1Line: '',
    l2Line: l.line,
  }));

  return (
    <div className={`mx-auto max-w-7xl px-4 py-6 ${hasSubtitles ? 'lg:h-[calc(100vh-5rem)] lg:overflow-hidden' : ''}`}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">{t('title.local_media')}</h1>
      </div>

      <div className={`flex flex-col gap-6 ${hasSubtitles ? 'lg:grid lg:h-full lg:overflow-hidden lg:grid-cols-[1fr_320px]' : ''}`}>
        {/* Left column: file bar + player + controls */}
        <div className={`flex-1 space-y-4 ${hasSubtitles ? 'lg:overflow-y-auto' : ''}`}>
          <CustomMediaUpload
            onOpenFile={customMedia.openFile}
            onLoadCaptions={customMedia.loadCaptions}
            onClear={customMedia.clear}
            onRequestPermission={customMedia.requestPermission}
            fileName={customMedia.fileName}
            isAudio={customMedia.isAudio}
            hasSubtitles={hasSubtitles}
            needsPermission={customMedia.needsPermission}
            hasMedia={customMedia.hasMedia}
          />

          <HTML5Player
            ref={playerRef}
            src={customMedia.mediaUrl!}
            isAudio={customMedia.isAudio}
            autoplay
            startTime={customMedia.savedPosition}
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
          />
        </div>

        {/* Right column: transcript (only when captions loaded) */}
        {hasSubtitles && (
          <aside className="min-h-0 overflow-hidden">
            <div ref={transcriptScrollRef} className="h-full overflow-y-auto rounded-xl border border-border bg-card p-4">
              <SubtitleDisplay
                youtubeId=""
                videoTitle={customMedia.fileName ?? undefined}
                currentTime={currentTime}
                onLinesLoaded={setSubtitleStartTimes}
                onSeekToLine={(t) => playerRef.current?.seekTo(t)}
                scrollContainerRef={transcriptScrollRef}
                initialLines={initialLines}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
