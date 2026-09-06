import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, FlatList, PanResponder, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { localizedError } from '@/lib/errors';
import { e2e } from '@/lib/e2e';
import { log } from '@/lib/logger';
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useUserLibraryContext } from '@/contexts/UserLibraryContext';
import { useVideoTokenCache } from '@/hooks/use-video-token-cache';
import { useWatchHistoryRecorder } from '@/hooks/use-watch-history-recorder';
import { useActiveLineIndex } from '@/hooks/use-active-line-index';
import { YouTubePlayer, type YouTubePlayerHandle } from '@/components/video/YouTubePlayer';
import { VideoControlBar } from '@/components/video/VideoControlBar';
import { TranscriptQueuePanel } from '@/components/video/TranscriptQueuePanel';
import { SubtitleDisplay } from '@/components/video/SubtitleDisplay';
import { VideoQueueList } from '@/components/video/VideoQueueList';
import { VideoMeta } from '@/components/video/VideoMeta';
import { YouTubeChannelCard } from '@/components/video/YouTubeChannelCard';
import { AddToPlaylistDialog } from '@/components/video/AddToPlaylistDialog';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED, ICON_DESTRUCTIVE } from '@/lib/theme-colors';
import { parseSubtitleCSV } from '@langplayer/utils';
import { AlertCircle } from 'lucide-react-native';
import { SUPPORTED_L2S, type SubtitleSyncedLine, type YouTubeVideo } from '@langplayer/shared';

const WATCH_POS_PREFIX = 'lp-watch-pos-';
const SAVE_POS_INTERVAL = 5000;

/** Parse ISO 8601 duration (PT1M25S, PT1H23M45S) into seconds, or return as-is if already a number. */
function parseDuration(d: any): number | undefined {
  if (d == null) return undefined;
  if (typeof d === 'number') return d;
  if (typeof d === 'string') {
    const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (m) return (parseInt(m[1] ?? '0') * 3600) + (parseInt(m[2] ?? '0') * 60) + parseFloat(m[3] ?? '0');
  }
  return undefined;
}

async function getSavedPosition(videoId: string): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(WATCH_POS_PREFIX + videoId);
    if (raw) {
      const pos = parseFloat(raw);
      return Number.isFinite(pos) && pos > 1 ? pos : 0;
    }
  } catch { /* SecureStore unavailable */ }
  return 0;
}

async function savePosition(videoId: string, time: number) {
  try {
    if (time > 1) {
      await SecureStore.setItemAsync(WATCH_POS_PREFIX + videoId, String(Math.round(time)));
    }
  } catch { /* ignore */ }
}

export default function WatchScreen() {
  const { videoId, l2 } = useLocalSearchParams<{ videoId: string; l2?: string }>();
  const { l2Lang, setL2Lang } = useLanguage();
  const requestedL2 =
    typeof l2 === 'string' && (SUPPORTED_L2S as readonly string[]).includes(l2.trim())
      ? l2.trim()
      : null;
  // Deep links can carry ?l2=... to switch the stored L2 before loading
  // content (SPEC-048 Tier 9). The param wins over the persisted pair.
  const l2Code = requestedL2 ?? l2Lang.code;
  const t = useT();
  const { playNext, playPrevious, hasNext, hasPrevious, ensureQueue } = useVideoPlayer();
  const { playback, updatePlayback } = useSettingsContext();
  const { isLiked, toggleLike, isSignedIn } = useUserLibraryContext();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isWide = screenWidth / screenHeight > 1;

  const playerRef = useRef<YouTubePlayerHandle>(null);
  const [video, setVideo] = useState<YouTubeVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [playerContainerWidth, setPlayerContainerWidth] = useState(0);
  // Visible height of the player column (SPEC-010 wide layout) — the player
  // contain-fits against this so a non-16:9 video renders larger.
  const [playerAvailHeight, setPlayerAvailHeight] = useState(0);
  const [subtitleLines, setSubtitleLines] = useState<SubtitleSyncedLine[]>([]);
  const [subtitleStartTimes, setSubtitleStartTimes] = useState<number[]>([]);
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);
  const [bandTop, setBandTop] = useState<number | null>(null);
  const bandFrameHeightRef = useRef(0);
  const bandHeightRef = useRef(0);
  const bandLayoutTopRef = useRef(0);
  const bandTopRef = useRef<number | null>(null);
  const bandDragStartTopRef = useRef(0);

  const bandPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) =>
      Math.abs(gestureState.dy) > 4 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onMoveShouldSetPanResponderCapture: (_, gestureState) =>
      Math.abs(gestureState.dy) > 4 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onPanResponderGrant: () => {
      const startTop = bandTopRef.current ?? bandLayoutTopRef.current;
      bandDragStartTopRef.current = startTop;
      bandTopRef.current = startTop;
    },
    onPanResponderMove: (_, gestureState) => {
      const maxTop = Math.max(0, bandFrameHeightRef.current - bandHeightRef.current);
      const nextTop = Math.min(maxTop, Math.max(0, bandDragStartTopRef.current + gestureState.dy));
      bandTopRef.current = nextTop;
      setBandTop(nextTop);
    },
    onPanResponderRelease: () => {},
    onPanResponderTerminate: () => {},
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  }), []);

  // Persist the deep-link L2 override so the header and library state agree
  // with the language of the linked video.
  useEffect(() => {
    if (requestedL2 && requestedL2 !== l2Lang.code) {
      setL2Lang(requestedL2);
    }
  }, [requestedL2, l2Lang.code, setL2Lang]);

  // Token cache — use Directus video ID (not YouTube ID)
  const { cache: tokenCache, loaded: tokenCacheLoaded } = useVideoTokenCache(
    video?.id ?? '',
    l2Code,
  );

  // Watch history recording
  useWatchHistoryRecorder(video?.id, currentTime);

  // Seed the queue for direct/deep-linked videos so next/prev and the queue
  // tab stay defined even when the user didn't navigate through a list.
  useEffect(() => {
    if (video) ensureQueue(video);
  }, [video, ensureQueue]);

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // Restore saved position on mount
  useEffect(() => {
    if (!videoId) return;
    getSavedPosition(videoId).then(setStartTime);
  }, [videoId]);

  // Auto-save position every 5 seconds
  useEffect(() => {
    if (!videoId) return;
    const interval = setInterval(() => {
      if (currentTimeRef.current > 1) {
        savePosition(videoId, currentTimeRef.current);
      }
    }, SAVE_POS_INTERVAL);
    return () => clearInterval(interval);
  }, [videoId]);

  // Save position on unmount
  useEffect(() => {
    return () => {
      if (videoId && currentTimeRef.current > 1) {
        savePosition(videoId, currentTimeRef.current);
      }
    };
  }, [videoId]);

  // Fetch video metadata + subtitles
  useEffect(() => {
    if (!videoId) return;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Single endpoint: queries Directus, falls back to YouTube
        const res = await fetch(
          `${PYTHON_API_URL}/videos?youtube_id=${encodeURIComponent(videoId)}&subs_l2=1&l2=${l2Code}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (!res.ok) throw new Error(t('msg.video_unavailable'));

        const data = await res.json();
        const rawVideo = data?.video ?? data;

        if (!rawVideo) throw new Error(t('msg.video_unavailable'));

        // Map to YouTubeVideo shape
        const v: YouTubeVideo = {
          id: rawVideo.id != null ? String(rawVideo.id) : undefined,
          youtube_id: rawVideo.youtube_id ?? videoId,
          title: rawVideo.title,
          views: rawVideo.views,
          likes: rawVideo.likes,
          comments: rawVideo.comments,
          duration: parseDuration(rawVideo.duration),
          date: rawVideo.date,
          difficulty: rawVideo.difficulty,
          locale: rawVideo.locale,
          category: rawVideo.category,
          channel_id: rawVideo.channel_id,
          tv_show: rawVideo.tv_show,
          tags: rawVideo.tags,
          // SPEC-010: native aspect ratio (width/height) — lets the player
          // contain-fit non-16:9 videos instead of forcing a 16:9 box.
          aspect_ratio: rawVideo.aspect_ratio,
        };
        setVideo(v);
        setDuration(v.duration ?? 0);
        // Aspect-ratio trace: log the native aspect ratio returned by the
        // server so the contain-fit can be confirmed end-to-end.
        log('[aspectRatio] mobile fetch', {
          videoId,
          aspect_ratio: typeof v.aspect_ratio === 'number' ? v.aspect_ratio : null,
        });

        // Parse subtitles
        let lines: { line: string; starttime: number }[] = [];

        // If video was in Directus, subs_l2 is a raw CSV string
        if (rawVideo.subs_l2 && typeof rawVideo.subs_l2 === 'string' && rawVideo.subs_l2.length > 100) {
          lines = parseSubtitleCSV(rawVideo.subs_l2);
        }
        // If video was from YouTube fallback, lines are in data.lines
        else if (data.lines && Array.isArray(data.lines)) {
          lines = data.lines.map((l: any) => ({
            line: l.line ?? l.text ?? '',
            starttime: l.starttime ?? l.start ?? 0,
          }));
        }

        // Imported video (not in our DB) or DB video without saved subs: the
        // /videos response has no lines — fetch captions from YouTube through
        // the captions endpoint (same best-locale logic Nuxt uses).
        if (lines.length === 0) {
          try {
            const captionsRes = await fetch(
              `${PYTHON_API_URL}/get_best_l2_subs?v=${encodeURIComponent(videoId)}&l2=${l2Code}`,
              { signal: AbortSignal.timeout(15000) },
            );
            if (captionsRes.ok) {
              const captions: any[] | null = await captionsRes.json();
              if (Array.isArray(captions)) {
                lines = captions.map((c: any) => ({
                  line: c.text ?? '',
                  starttime: c.start ?? 0,
                }));
              }
            }
          } catch {
            // Captions fallback failed — show the video without subtitles.
          }
        }

        if (lines.length > 0) {
          const synced: SubtitleSyncedLine[] = lines.map((l) => ({
            starttime: l.starttime,
            l2Line: l.line,
            l1Line: '',
          }));
          setSubtitleLines(synced);
          setSubtitleStartTimes(synced.map((l) => l.starttime));
        }
      } catch (err: any) {
        setError(localizedError(t, err, 'msg.video_unavailable'));
      } finally {
        setLoading(false);
      }
    })();
  }, [videoId, l2Code]);

  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), []);
  const handleDuration = useCallback((d: number) => setDuration(d), []);
  const handleStateChange = useCallback((state: string) => {
    setPaused(state !== 'playing');
  }, []);

  // ── Auto-pause: pause video when active subtitle line's duration elapses ──
  const autoPausedLineRef = useRef<number>(-1);

  // Reset paused-line tracker when the active line changes
  const activeLineIndex = useActiveLineIndex(subtitleStartTimes, currentTime);

  useEffect(() => {
    autoPausedLineRef.current = -1;
  }, [activeLineIndex]);

  useEffect(() => {
    if (!playback.autoPause || activeLineIndex < 0) return;
    if (autoPausedLineRef.current === activeLineIndex) return; // already paused this line

    const line = subtitleLines[activeLineIndex];
    if (!line) return;

    const lineDuration = subtitleStartTimes[activeLineIndex + 1]
      ? subtitleStartTimes[activeLineIndex + 1]! - line.starttime
      : 5;
    const elapsed = currentTime - line.starttime;

    if (lineDuration > 0 && elapsed >= lineDuration && !paused) {
      autoPausedLineRef.current = activeLineIndex;
      playerRef.current?.pause();
    }
  }, [currentTime, activeLineIndex, subtitleLines, subtitleStartTimes, playback.autoPause, paused]);

  const handlePauseToggle = useCallback(() => {
    if (paused) {
      playerRef.current?.play();
    } else {
      playerRef.current?.pause();
    }
    setPaused(!paused);
  }, [paused]);

  const handleRewind = useCallback(() => {
    playerRef.current?.seekTo(Math.max(0, currentTime - 2));
  }, [currentTime]);

  const handlePreviousLine = useCallback(() => {
    // Always seek to the previous line (the line before the currently active
    // one) — never to the start of the current line. `activeLineIndex` is the
    // currently active line; subtracting one jumps to the prior line. When
    // already on the first line (or before it) there is no previous line, so
    // fall back to a small rewind.
    const prevIndex = activeLineIndex - 1;
    if (prevIndex >= 0 && subtitleStartTimes[prevIndex] !== undefined) {
      playerRef.current?.seekTo(subtitleStartTimes[prevIndex]!);
    } else {
      playerRef.current?.seekTo(Math.max(0, currentTime - 3));
    }
  }, [currentTime, subtitleStartTimes, activeLineIndex]);

  const handleNextLine = useCallback(() => {
    for (let i = 0; i < subtitleStartTimes.length; i++) {
      if (subtitleStartTimes[i]! > currentTime + 0.5) {
        playerRef.current?.seekTo(subtitleStartTimes[i]!);
        return;
      }
    }
    playerRef.current?.seekTo(Math.min(duration, currentTime + 3));
  }, [currentTime, duration, subtitleStartTimes]);

  const handleSeekToLine = useCallback((t: number) => {
    playerRef.current?.seekTo(t);
  }, []);

  const isSubtitles = playback.transcriptMode === 'subtitles';

  const handleTogglePanel = useCallback(() => {
    updatePlayback({ transcriptMode: isSubtitles ? 'transcript' : 'subtitles' });
  }, [updatePlayback, isSubtitles]);

  const handleToggleLike = useCallback(() => {
    if (video) void toggleLike(video);
  }, [toggleLike, video]);

  const liked = !!video && isLiked(l2Code, video);
  const likeDisabled = !isSignedIn || !video?.id;
  const openPlaylistDialog = useCallback(() => setPlaylistDialogOpen(true), []);
  const playlistDisabled = !isSignedIn;

  // ── Loading ──
  if (loading) {
    return (
      <View testID="watch-screen" accessibilityLabel={t('label.watch_screen')} className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  // ── Error ──
  if (error || !video) {
    return (
      <View testID="watch-screen" accessibilityLabel={t('label.watch_screen')} className="flex-1 items-center justify-center bg-background px-8">
        <AlertCircle size={48} color={ICON_DESTRUCTIVE} />
        <Text className="mt-4 text-xl font-bold text-foreground">{t('msg.video_unavailable')}</Text>
        {error ? <Text className="mt-2 text-center text-muted-foreground">{error}</Text> : null}
      </View>
    );
  }

  const v = video;

  const playerElement = (
    <YouTubePlayer
      ref={playerRef}
      youtubeId={v.youtube_id}
      startTime={startTime}
      onTimeUpdate={handleTimeUpdate}
      onDuration={handleDuration}
      onStateChange={handleStateChange}
      // Prevent the iframe from sizing to the full window in landscape —
      // it must fit the measured player column (SPEC-052 watch parity).
      containerWidth={playerContainerWidth || undefined}
      // SPEC-010 wide layout: contain-fit non-16:9 videos to the visible part
      // of the column. Only on widescreen (narrow keeps 16:9).
      aspectRatio={isWide ? v.aspect_ratio : undefined}
      availableHeight={isWide ? (playerAvailHeight || undefined) : undefined}
    />
  );

  // ── Subtitles Mode: Wide (landscape) ──
  if (isSubtitles && isWide) {
    return (
      <View testID="watch-screen" className="flex-1 bg-black">
        <View
          className="relative flex-1"
          onLayout={(e) => {
            setPlayerContainerWidth(e.nativeEvent.layout.width);
            const frameHeight = e.nativeEvent.layout.height;
            setPlayerAvailHeight(frameHeight);
            bandFrameHeightRef.current = frameHeight;
            if (bandTopRef.current !== null && bandHeightRef.current > 0) {
              const maxTop = Math.max(0, frameHeight - bandHeightRef.current);
              const nextTop = Math.min(maxTop, bandTopRef.current);
              bandTopRef.current = nextTop;
              setBandTop(nextTop);
            }
          }}
        >
          {playerElement}
          <View
            {...bandPanResponder.panHandlers}
            className={`absolute z-10 min-h-24 self-center rounded-xl bg-black/70 pb-2 ${bandTop === null ? 'bottom-0' : ''}`}
            style={[
              { alignSelf: 'center', maxWidth: Math.max(0, screenWidth - 64), width: 'auto' },
              bandTop === null ? { bottom: 0 } : { top: bandTop },
            ]}
            onLayout={(e) => {
              bandHeightRef.current = e.nativeEvent.layout.height;
              bandLayoutTopRef.current = e.nativeEvent.layout.y;
            }}
          >
            <SubtitleDisplay
              singleLine
              overlay
              lines={subtitleLines}
              activeLineIndex={activeLineIndex}
              currentTime={currentTime}
              tokenCache={tokenCache}
              tokenCacheLoaded={tokenCacheLoaded}
              onSeekToLine={handleSeekToLine}
            />
            <View className="flex-row justify-center pb-2 pt-1">
              <VideoControlBar
                reduced
                subtitlesBand
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
                hasPreviousLine={activeLineIndex > 0}
                hasNextLine={subtitleStartTimes.length > 0}
                hasPreviousVideo={hasPrevious}
                hasNextVideo={hasNext}
                panelOpen={!isSubtitles}
                liked={liked}
                onToggleLike={handleToggleLike}
                likeDisabled={likeDisabled}
                onSaveToPlaylist={openPlaylistDialog}
                playlistDisabled={playlistDisabled}
              />
            </View>
          </View>
        </View>
        <AddToPlaylistDialog
          open={playlistDialogOpen}
          onOpenChange={setPlaylistDialogOpen}
          video={video}
        />
      </View>
    );
  }

  // ── Subtitles Mode: Narrow (portrait) ──
  if (isSubtitles) {
    return (
      <View testID="watch-screen" className="flex-1 bg-background">
        <View onLayout={(e) => setPlayerContainerWidth(e.nativeEvent.layout.width)}>
          {playerElement}
        </View>
        {/* Web parity: active line + controls in one band below the player */}
        <View className="bg-card border-t border-border">
          <SubtitleDisplay
            singleLine
            lines={subtitleLines}
            activeLineIndex={activeLineIndex}
            currentTime={currentTime}
            tokenCache={tokenCache}
            tokenCacheLoaded={tokenCacheLoaded}
            onSeekToLine={handleSeekToLine}
          />
          <View className="flex-row justify-end px-2 py-1">
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
              hasPreviousLine={subtitleStartTimes.length > 0}
              hasNextLine={subtitleStartTimes.length > 0}
              hasPreviousVideo={hasPrevious}
              hasNextVideo={hasNext}
              panelOpen={!isSubtitles}
              liked={liked}
              onToggleLike={handleToggleLike}
              likeDisabled={likeDisabled}
              onSaveToPlaylist={openPlaylistDialog}
              playlistDisabled={playlistDisabled}
            />
          </View>
        </View>
        <AddToPlaylistDialog
          open={playlistDialogOpen}
          onOpenChange={setPlaylistDialogOpen}
          video={video}
        />
      </View>
    );
  }

  // ── Transcript Mode ──
  const videoInfo = (
    <View>
      <VideoMeta video={v} />
      {v.channel_id ? <View className="mt-4"><YouTubeChannelCard channelId={v.channel_id} /></View> : null}
    </View>
  );

  const transcriptPanel = (
    <TranscriptQueuePanel
      transcript={
        <SubtitleDisplay
          lines={subtitleLines}
          activeLineIndex={activeLineIndex}
          currentTime={currentTime}
          tokenCache={tokenCache}
          tokenCacheLoaded={tokenCacheLoaded}
          onSeekToLine={handleSeekToLine}
        />
      }
      queue={<VideoQueueList currentYoutubeId={v.youtube_id} />}
      info={isWide ? undefined : videoInfo}
    />
  );

  return (
    <View testID="watch-screen" accessibilityLabel={t('label.watch_screen')} className="flex-1 bg-background">
      {/* Wide (landscape): player + info left, transcript/queue right column */}
      <View className={isWide ? 'flex-1 flex-row min-h-0' : 'flex-1 min-h-0'}>
        <View
          className={isWide ? 'min-w-0 flex-1 space-y-4 overflow-y-auto px-4 py-6' : ''}
          onLayout={isWide ? (e) => setPlayerAvailHeight(e.nativeEvent.layout.height) : undefined}
        >
          <View onLayout={(e) => setPlayerContainerWidth(e.nativeEvent.layout.width)}>
            {playerElement}
          </View>

          {/* Reduced control bar — only LP-specific controls per SPEC-010 */}
          <View className={`flex-row justify-end ${isWide ? '' : 'border-b border-border px-2 py-1'}`}>
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
              hasPreviousLine={subtitleStartTimes.length > 0}
              hasNextLine={subtitleStartTimes.length > 0}
              hasPreviousVideo={hasPrevious}
              hasNextVideo={hasNext}
              panelOpen={!isSubtitles}
              liked={liked}
              onToggleLike={handleToggleLike}
              likeDisabled={likeDisabled}
              onSaveToPlaylist={openPlaylistDialog}
              playlistDisabled={playlistDisabled}
            />
          </View>

          {/* Video info moves to the left column on wide screens (web parity) */}
          {isWide && videoInfo}
        </View>

        {/* Tabbed panel: transcript / queue (info tab only on narrow) */}
        <View className={isWide ? 'min-h-0 w-[320px] border-l border-border' : 'min-h-0 flex-1'}>
          {transcriptPanel}
        </View>
      </View>

      {/* Add-to-playlist dialog */}
      <AddToPlaylistDialog
        open={playlistDialogOpen}
        onOpenChange={setPlaylistDialogOpen}
        video={video}
      />
    </View>
  );
}
