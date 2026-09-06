'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useVideoPlayer } from '@/providers/video-player-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { log } from '@/lib/logger';
import { YouTubePlayer, type YouTubePlayerHandle, PLAYER_STATES } from '@/components/video/youtube-player';
import { VideoMeta } from '@/components/video/video-meta';
import { VideoControlBar } from '@/components/video/video-control-bar';
import { VideoQueueList } from '@/components/video/video-queue-list';
import { SubtitleDisplay } from '@/components/video/subtitle-display';
import { VideoSidebarPanel, type SidebarTabKey } from '@/components/video/video-sidebar-panel';
import { VideoAskAi } from '@/components/video/video-ask-ai';
import type { YouTubeVideo, SubtitleLine } from '@langplayer/shared';
import { findActiveLineIndex } from '@langplayer/shared';
import {
  stripSubtitleDurationPrefix,
  extractSubtitleDuration,
  type SyncedLine,
} from '@/lib/subtitle-csv';
import { AlertCircle, Loader2, FileText, ListVideo, Info, Sparkles } from 'lucide-react';
import { baseCode } from '@/lib/language-data';
import { useVideoTokenCache } from '@/hooks/use-video-token-cache';
import { useCaptionNormalization } from '@/hooks/use-caption-normalization';
import { useWatchHistoryRecorder } from '@/hooks/use-watch-history-recorder';
import { useProgressLevel } from '@/hooks/use-progress';
import { buildVideoQueue } from '@/lib/video-queue';
import { YouTubeChannelCard } from '@/components/video/youtube-channel-card';
import { AddToPlaylistDialog } from '@/components/video/add-to-playlist-dialog';
import { useUserLibraryContext } from '@/providers/user-library-provider';

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
  const { playNext, playPrevious, hasNext, hasPrevious, restoreQueueIfCurrent, setQueue, queueState } = useVideoPlayer();
  const { playback, updatePlayback } = useSettingsContext();
  const { isLiked, toggleLike, isSignedIn } = useUserLibraryContext();
  const videoId = params.videoId;
  const l2Code = baseCode(l2.code);

  const [video, setVideo] = useState<YouTubeVideo | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  // Holds a translation key (not a raw message) — rendered through t() so it
  // stays localized. The fetch can fail even though the YouTube player itself
  // is playing, so this must never imply the video is missing.
  const [dataError, setDataError] = useState<string | null>(null);
  const [startTime] = useState(() => getSavedPosition(videoId));

  const { cache: tokenCache, loaded: tokenCacheLoaded } = useVideoTokenCache(video?.id, baseCode(l2.code));
  const userLevel = useProgressLevel(baseCode(l2.code));
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [subtitleStartTimes, setSubtitleStartTimes] = useState<number[]>([]);
  const [subtitleLines, setSubtitleLines] = useState<SyncedLine[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const col1Ref = useRef<HTMLDivElement>(null);
  // Visible height of the scrollable left column (SPEC-010 wide layout). The
  // player contain-fits against this so a non-16:9 video (e.g. 4:3) renders
  // larger instead of being letterboxed inside a forced 16:9 box.
  const [playerAvailHeight, setPlayerAvailHeight] = useState(0);
  const [isWide, setIsWide] = useState(false);
  const isWideRef = useRef(isWide);
  isWideRef.current = isWide;
  const [translatingText, setTranslatingText] = useState<string | null>(null);
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);
  /** Active transcript/queue/info/ai sidebar tab (controlled so AI timestamp
   *  clicks can switch back to the transcript). */
  const [sidebarTab, setSidebarTab] = useState<SidebarTabKey>('subs');

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

  // Measure the visible height of the left column so the player can contain-fit
  // to it (SPEC-010 wide layout). Re-measures on resize / layout changes.
  useEffect(() => {
    const el = col1Ref.current;
    if (!el) return;
    const update = () => setPlayerAvailHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const fetchVideo = async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}?l2=${l2Code}&l1=${baseCode(l1.code)}`);
        if (!res.ok) {
          setDataError('msg.failed_to_load_transcript');
          return;
        }
        const data = await res.json();
        const v = data.video ?? data;
        setVideo(v);
        // Aspect-ratio trace: log the native aspect ratio returned by the
        // server so the contain-fit can be confirmed end-to-end.
        log('[aspectRatio] web fetch', {
          videoId,
          aspect_ratio: typeof v?.aspect_ratio === 'number' ? v.aspect_ratio : null,
        });
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
  }, [videoId, l1, l2, l2Code]);

  // ── Watch queue: restore on refresh / build from the video ──
  // The queue is normally set by the grid before navigation (playVideo). When
  // a video is opened WITHOUT a grid-set queue — a cold link, a page refresh,
  // or the watch-history page — the queue is built here:
  //   - TV show episode → the show's episodes (positioned on the current video)
  //   - otherwise       → level-matched recommendations (SPEC-071 §8.2)
  const queueBuildRef = useRef(false);

  // When the video changes (back/forward between two videos) reset the guard
  // so the queue is rebuilt for the newly shown video. Grid navigation is
  // unaffected: playVideo/playNext set the queue before the video loads, so
  // the build effect short-circuits on the matching current video.
  useEffect(() => {
    queueBuildRef.current = false;
  }, [videoId]);

  useEffect(() => {
    if (!video || queueBuildRef.current) return;
    // Grid-set (or already-built) queue already covers this video → keep it.
    if (queueState.currentVideo?.youtube_id === video.youtube_id) {
      queueBuildRef.current = true;
      return;
    }

    let cancelled = false;
    (async () => {
      // Try to restore a persisted queue from a prior session (page refresh).
      const restored = await restoreQueueIfCurrent(video.youtube_id);
      if (cancelled) return;
      if (restored) {
        queueBuildRef.current = true;
        return;
      }
      // No persisted queue, no grid queue → build from the video.
      const result = await buildVideoQueue(video, baseCode(l2.code), userLevel);
      if (cancelled) return;
      queueBuildRef.current = true;
      if (result) {
        setQueue(video, result.queue, result.queueType, result.metadata);
      } else {
        // Nothing to build from (fetch failed) → single-video queue so
        // prev/next and the queue tab stay defined.
        setQueue(video, [video], 'recommended');
      }
    })();

    return () => { cancelled = true; };
  }, [
    video,
    queueState.currentVideo?.youtube_id,
    userLevel,
    setQueue,
    restoreQueueIfCurrent,
    l2.code,
  ]);

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
    l2Code,
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
    // Always seek to the previous line (the line before the currently active
    // one) — never to the start of the current line. `findActiveLineIndex`
    // returns the active line; subtracting one jumps to the prior line. When
    // already on the first line (or before it) there is no previous line, so
    // fall back to a small rewind.
    const prevIndex = findActiveLineIndex(subtitleStartTimes, currentTime) - 1;
    if (prevIndex >= 0 && subtitleStartTimes[prevIndex] !== undefined) {
      playerRef.current?.seekTo(subtitleStartTimes[prevIndex]!);
    } else {
      playerRef.current?.seekTo(Math.max(0, currentTime - 3));
    }
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

  const handleToggleLike = useCallback(() => {
    if (video) void toggleLike(video);
  }, [toggleLike, video]);

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
      // SPEC-010 wide layout: contain-fit non-16:9 videos to the visible part
      // of the scrollable column. Only on widescreen (narrow keeps 16:9).
      aspectRatio={isWide ? video?.aspect_ratio : undefined}
      availableHeight={isWide ? playerAvailHeight || undefined : undefined}
    />
  );

  // ── Stable layout ──
  // Render the player in a fixed tree position across every mode (loading,
  // error, subtitles/transcript, wide/narrow). Only CSS classes change when
  // the layout toggles, so React never unmounts the YouTube iframe and
  // playback continues uninterrupted through window resize / orientation
  // changes. Loading/error states surface below the player, never replacing it.
  const v = dataLoaded && !dataError && video ? video : null;

  const outerClass =
    isSubtitles && isWide
      ? 'mx-auto h-[calc(100vh-3.5rem)] overflow-hidden'
      : isSubtitles
        ? 'mx-auto max-w-7xl px-4 py-6'
        : isWide
          ? 'mx-auto max-w-7xl px-4 py-6 h-[calc(100vh-5rem)] overflow-hidden'
          : 'mx-auto max-w-7xl h-[calc(100vh-3.5rem)] overflow-hidden';

  const layoutClass =
    isSubtitles && isWide
      ? 'relative h-full'
      : isSubtitles
        ? ''
        : isWide
          ? 'grid h-full grid-cols-[1fr_320px] gap-6'
          : 'flex h-full flex-col';

  const col1Class =
    isSubtitles && isWide
      ? 'h-full'
      : isSubtitles
        ? ''
        : isWide
          ? 'flex-1 space-y-4 overflow-y-auto'
          : 'shrink-0 px-4 pt-4';

  const playerSlotClass =
    isSubtitles && isWide
      ? 'h-full'
      : isSubtitles
        ? 'bg-background pb-2'
        : 'pb-2';

  const videoInfo = v ? (
    <div className="space-y-4">
      <VideoMeta video={v} />
      {v.channel_id && <YouTubeChannelCard channelId={v.channel_id} />}
    </div>
  ) : undefined;

  return (
    <div className={outerClass}>
      <div className={layoutClass}>
        {/* Player slot — same tree position in every mode */}
        <div ref={col1Ref} className={col1Class}>
          <div ref={videoWrapperRef} className={playerSlotClass}>
            {playerElement}
          </div>

          {v && !isSubtitles && (
            <div className={`flex justify-end${isWide ? '' : ' pb-2'}`}>
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
                panelAtEnd={isWide && !isSubtitles}
                hasPreviousLine={activeSubtitleIndex > 0}
                hasPreviousVideo={hasPrevious}
                hasNextVideo={hasNext}
                translatingText={translatingText}
                liked={!!video && isLiked(l2Code, video)}
                onToggleLike={handleToggleLike}
                likeDisabled={!isSignedIn || !video?.id}
                onSaveToPlaylist={() => setPlaylistDialogOpen(true)}
                playlistDisabled={!isSignedIn}
              />
            </div>
          )}

          {v && !isSubtitles && isWide && videoInfo}

          {v && isSubtitles && !isWide && (
            <SubtitleDisplay
              band
              overlay={false}
              initialLines={displaySubtitleLines}
              currentTime={currentTime}
              onSeekToLine={handleSeekToLine}
              onSwitchToTranscriptMode={handleSwitchToTranscriptMode}
              hasPrevVideo={hasPrevious}
              hasNextVideo={hasNext}
              onPrevVideo={playPrevious}
              onNextVideo={playNext}
              tokenCache={tokenCache}
              tokenCacheLoaded={tokenCacheLoaded}
              videoTitle={v.title}
              liked={isLiked(l2Code, v)}
              onToggleLike={handleToggleLike}
              likeDisabled={!isSignedIn || !v.id}
              onSaveToPlaylist={() => setPlaylistDialogOpen(true)}
              playlistDisabled={!isSignedIn}
            />
          )}

          {/* Loading / error status — never replaces the player */}
          {!v && (
            <div className="flex items-start justify-center gap-2 py-4 text-sm text-muted-foreground">
              {dataError ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              <span className="max-w-lg">{dataError ? t(dataError) : t('msg.loading')}</span>
            </div>
          )}
        </div>

        {/* Subtitles overlay (wide) */}
        {v && isSubtitles && isWide && (
          <SubtitleDisplay
            band
            overlay
            initialLines={displaySubtitleLines}
            currentTime={currentTime}
            onSeekToLine={handleSeekToLine}
            onSwitchToTranscriptMode={handleSwitchToTranscriptMode}
            hasPrevVideo={hasPrevious}
            hasNextVideo={hasNext}
            onPrevVideo={playPrevious}
            onNextVideo={playNext}
            tokenCache={tokenCache}
            tokenCacheLoaded={tokenCacheLoaded}
            videoTitle={v.title}
            liked={isLiked(l2Code, v)}
            onToggleLike={handleToggleLike}
            likeDisabled={!isSignedIn || !v.id}
            onSaveToPlaylist={() => setPlaylistDialogOpen(true)}
            playlistDisabled={!isSignedIn}
          />
        )}

        {/* Transcript / queue panel (transcript mode) */}
        {v && !isSubtitles && (
          <div className={isWide ? 'min-h-0 overflow-hidden' : 'flex-1 min-h-0 px-4 pb-4'}>
            <VideoSidebarPanel
              contentRef={transcriptScrollRef}
              activeTab={sidebarTab}
              onTabChange={setSidebarTab}
              tabs={[
                { key: 'subs', label: t('title.transcript'), icon: <FileText className="h-4 w-4" /> },
                { key: 'ai', label: t('action.ask_ai'), icon: <Sparkles className="h-4 w-4" /> },
                { key: 'queue', label: t('title.queue'), icon: <ListVideo className="h-4 w-4" /> },
                ...(isWide ? [] : [{ key: 'info' as const, label: t('title.info'), icon: <Info className="h-4 w-4" /> }]),
              ]}
            >
              {(tab) => {
                if (tab === 'subs') {
                  return <SubtitleDisplay youtubeId={v.youtube_id} videoTitle={v.title} tokenCache={tokenCache} tokenCacheLoaded={tokenCacheLoaded} currentTime={currentTime} onLinesLoaded={setSubtitleStartTimes} onSeekToLine={handleSeekToLine} scrollContainerRef={transcriptScrollRef} initialLines={subtitleLines.length > 0 ? subtitleLines : undefined} isGenerated={isGenerated} normalizedOverlay={subtitleLines.length > 0 ? captionOverlay : undefined} onPauseLine={() => { playerRef.current?.pause(); setPaused(true); }} onTranslationProgress={setTranslatingText} />;
                }
                if (tab === 'ai') {
                  return (
                    <VideoAskAi
                      videoTitle={v.title ?? ''}
                      subtitleLines={displaySubtitleLines.map((l) => ({ starttime: l.starttime, l2Line: l.l2Line }))}
                      onSeek={(time) => { handleSeekToLine(time); setSidebarTab('subs'); }}
                      storageKey={`lp-ask-ai:video:${videoId}`}
                    />
                  );
                }
                if (tab === 'queue') {
                  return <VideoQueueList currentYoutubeId={v.youtube_id} />;
                }
                return videoInfo;
              }}
            </VideoSidebarPanel>
          </div>
        )}
      </div>
      <AddToPlaylistDialog
        open={playlistDialogOpen}
        onOpenChange={setPlaylistDialogOpen}
        video={video}
      />
    </div>
  );
}
