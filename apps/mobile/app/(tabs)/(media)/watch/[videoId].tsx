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
import { parseSubtitleCSV } from '@langplayer/utils';
import { AlertCircle } from 'lucide-react-native';
import type { YouTubeVideo } from '@langplayer/shared';

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
        // Single endpoint: queries Directus, falls back to YouTube
        const res = await fetch(
          `${PYTHON_API_URL}/videos?youtube_id=${encodeURIComponent(videoId)}&subs_l2=1&l2=${l2Lang.code}`,
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

  const handleTogglePanel = useCallback(() => {
    updatePlayback({ transcriptMode: isSubtitles ? 'transcript' : 'subtitles' });
  }, [updatePlayback, isSubtitles]);

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

      {/* Reduced control bar — only LP-specific controls per SPEC-010 */}
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
