import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, FlatList, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { localizedError } from '@/lib/errors';
import { e2e } from '@/lib/e2e';
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
  const [subtitleLines, setSubtitleLines] = useState<SubtitleSyncedLine[]>([]);
  const [subtitleStartTimes, setSubtitleStartTimes] = useState<number[]>([]);
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);

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
        };
        setVideo(v);
        setDuration(v.duration ?? 0);

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
    />
  );

  // ── Subtitles Mode: Wide (landscape) ──
  if (isSubtitles && isWide) {
    return (
      <View testID="watch-screen" className="flex-1 bg-black">
        <View
          className="relative flex-1"
          onLayout={(e) => setPlayerContainerWidth(e.nativeEvent.layout.width)}
        >
          {playerElement}
          <View className="absolute bottom-0 left-0 right-0 z-10 min-h-24 rounded-t-xl bg-black/70">
            <View className="flex-row justify-center border-b border-white/10 py-1">
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
        {/* Web parity: controls + active line in one band below the player */}
        <View className="bg-card border-t border-border">
          <View className="flex-row justify-end border-b border-border px-2 py-1">
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
          <SubtitleDisplay
            singleLine
            lines={subtitleLines}
            activeLineIndex={activeLineIndex}
            currentTime={currentTime}
            tokenCache={tokenCache}
            tokenCacheLoaded={tokenCacheLoaded}
            onSeekToLine={handleSeekToLine}
          />
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
        <View className={isWide ? 'min-w-0 flex-1 space-y-4 overflow-y-auto px-4 py-6' : ''}>
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
