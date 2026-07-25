import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useVideoTokenCache } from '@/hooks/use-video-token-cache';
import { useWatchHistoryRecorder } from '@/hooks/use-watch-history-recorder';
import { YouTubePlayer, type YouTubePlayerHandle } from '@/components/video/YouTubePlayer';
import { VideoControlBar } from '@/components/video/VideoControlBar';
import { SubtitleDisplay } from '@/components/video/SubtitleDisplay';
import { SubtitlesModeBand } from '@/components/video/SubtitlesModeBand';
import { TranscriptQueuePanel } from '@/components/video/TranscriptQueuePanel';
import { VideoQueueList } from '@/components/video/VideoQueueList';
import { VideoMeta } from '@/components/video/VideoMeta';
import { YouTubeChannelCard } from '@/components/video/YouTubeChannelCard';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED, ICON_DESTRUCTIVE } from '@/lib/theme-colors';
import { AlertCircle } from 'lucide-react-native';
import type { YouTubeVideo } from '@langplayer/shared';

const WATCH_POS_PREFIX = 'lp-watch-pos-';
const SAVE_POS_INTERVAL = 5000;

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

interface SyncedLine {
  starttime: number;
  l2Line: string;
  l1Line: string;
}

export default function WatchScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const { l2Lang } = useLanguage();
  const t = useT();
  const { playNext, playPrevious, hasNext, hasPrevious } = useVideoPlayer();
  const { playback, updatePlayback } = useSettingsContext();
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
  const [subtitleLines, setSubtitleLines] = useState<SyncedLine[]>([]);
  const [subtitleStartTimes, setSubtitleStartTimes] = useState<number[]>([]);

  // Token cache — use Directus video ID (not YouTube ID)
  const { cache: tokenCache, loaded: tokenCacheLoaded } = useVideoTokenCache(
    video?.id ?? '',
    l2Lang.code,
  );

  // Watch history recording
  useWatchHistoryRecorder(video?.id, currentTime);

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
        // 1. Fetch YouTube metadata via /check-youtube (title, channelId, thumbnails, etc.)
        const ytRes = await fetch(
          `${PYTHON_API_URL}/check-youtube?youtube_ids=${encodeURIComponent(videoId)}`,
          { signal: AbortSignal.timeout(10000) },
        );
        let ytData: any = null;
        if (ytRes.ok) {
          const ytArr = await ytRes.json();
          ytData = Array.isArray(ytArr) ? ytArr[0] : null;
        }

        const snippet = ytData?.snippet;
        const contentDetails = ytData?.contentDetails;

        // Parse ISO 8601 duration (PT3M34S → 214)
        let durationSecs = 0;
        if (contentDetails?.duration) {
          const match = contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          if (match) {
            durationSecs = (parseInt(match[1] ?? '0', 10) * 3600)
              + (parseInt(match[2] ?? '0', 10) * 60)
              + parseInt(match[3] ?? '0', 10);
          }
        }

        const v: YouTubeVideo = {
          youtube_id: videoId,
          title: snippet?.title ?? snippet?.localized?.title,
          channel_id: snippet?.channelId,
          duration: durationSecs,
          date: snippet?.publishedAt ? new Date(snippet.publishedAt) : undefined,
          // Directus-only fields (difficulty, views, etc.) are not available
          // from /check-youtube — left undefined. They will populate when the
          // video is in Directus and a /videos?youtube_id endpoint is added.
        };
        setVideo(v);
        setDuration(v.duration ?? 0);

        // 2. Fetch subtitles via YouTube transcript API
        let lines: { line: string; starttime: number }[] = [];
        try {
          const subRes = await fetch(
            `${PYTHON_API_URL}/get_best_l2_subs?v=${encodeURIComponent(videoId)}&l2=${l2Lang.code}`,
            { signal: AbortSignal.timeout(10000) },
          );
          if (subRes.ok) {
            const subData = await subRes.json();
            if (Array.isArray(subData)) {
              lines = subData.map((item: any) => ({
                line: item.text ?? '',
                starttime: item.start ?? 0,
              }));
            }
          }
        } catch { /* subs unavailable — continue without */ }

        if (lines.length > 0) {
          const synced: SyncedLine[] = lines.map((l) => ({
            starttime: l.starttime,
            l2Line: l.line,
            l1Line: '',
          }));
          setSubtitleLines(synced);
          setSubtitleStartTimes(synced.map((l) => l.starttime));
        }
      } catch (err: any) {
        setError(err?.message ?? t('msg.video_unavailable'));
      } finally {
        setLoading(false);
      }
    })();
  }, [videoId, l2Lang.code]);

  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), []);
  const handleDuration = useCallback((d: number) => setDuration(d), []);
  const handleStateChange = useCallback((state: string) => {
    setPaused(state !== 'playing');
  }, []);

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

  const handleSwitchToTranscriptMode = useCallback(() => {
    updatePlayback({ transcriptMode: 'transcript' });
  }, [updatePlayback]);

  const isSubtitles = playback.transcriptMode === 'subtitles';

  // ── Loading ──
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  // ── Error ──
  if (error || !video) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
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
      autoplay
      startTime={startTime}
      onTimeUpdate={handleTimeUpdate}
      onDuration={handleDuration}
      onStateChange={handleStateChange}
    />
  );

  // ── Subtitles Mode: Wide (landscape) ──
  if (isSubtitles && isWide) {
    return (
      <View className="flex-1 bg-black">
        <View className="relative flex-1">
          {playerElement}
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
            videoTitle={v.title}
          />
        </View>
      </View>
    );
  }

  // ── Subtitles Mode: Narrow (portrait) ──
  if (isSubtitles) {
    return (
      <View className="flex-1 bg-background">
        <View>{playerElement}</View>
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
          videoTitle={v.title}
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

  return (
    <View className="flex-1 bg-background">
      {/* Player */}
      <View>{playerElement}</View>

      {/* Reduced control bar */}
      <View className="flex-row justify-end border-b border-border px-3 py-1.5">
        <VideoControlBar
          playerRef={playerRef}
          currentTime={currentTime}
          duration={duration}
          paused={paused}
          onPauseToggle={handlePauseToggle}
          onRewind={handleRewind}
          onPreviousLine={handlePreviousLine}
          onNextLine={handleNextLine}
          hasPreviousLine={subtitleStartTimes.length > 0}
          hasNextLine={subtitleStartTimes.length > 0}
        />
      </View>

      {/* Tabbed panel: transcript / queue / info */}
      <View className="flex-1 min-h-0">
        <TranscriptQueuePanel
          transcript={
            <SubtitleDisplay
              youtubeId={v.youtube_id}
              videoTitle={v.title}
              tokenCache={tokenCache}
              tokenCacheLoaded={tokenCacheLoaded}
              currentTime={currentTime}
              onLinesLoaded={setSubtitleStartTimes}
              onSeekToLine={handleSeekToLine}
              initialLines={subtitleLines.length > 0 ? subtitleLines : undefined}
            />
          }
          queue={<VideoQueueList currentYoutubeId={v.youtube_id} />}
          info={videoInfo}
        />
      </View>
    </View>
  );
}
