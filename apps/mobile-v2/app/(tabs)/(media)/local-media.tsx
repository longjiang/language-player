import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useT } from '@/hooks/use-t';
import { useLocalMedia } from '@/hooks/use-local-media';
import type { SubtitleLine } from '@langplayer/shared';
import { Play, Pause, SkipBack, SkipForward, Upload, FileText, Trash2 } from 'lucide-react-native';

export default function LocalMediaScreen() {
  const t = useT();
  const localMedia = useLocalMedia();
  const { width: screenWidth } = useWindowDimensions();
  const videoHeight = (screenWidth / 16) * 9;

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);

  const player = useVideoPlayer(
    localMedia.mediaUri ? { uri: localMedia.mediaUri } : null,
    (p) => {
      if (localMedia.savedPosition > 0) {
        p.seekBy(localMedia.savedPosition);
      }
      p.play();
    },
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Time polling
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentTime(player.currentTime);
      setDuration(player.duration);
    }, 500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [player]);

  // Auto-save position every 5 seconds
  useEffect(() => {
    if (!localMedia.hasMedia) return;
    const interval = setInterval(() => {
      if (player.currentTime > 0) {
        localMedia.savePosition(player.currentTime);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [localMedia.hasMedia, localMedia.savePosition, player]);

  // Listen to player events
  useEffect(() => {
    const onPlaying = player.addListener('playingChange', (p) => {
      setPaused(!p.isPlaying);
    });
    const onStatus = player.addListener('statusChange', (p) => {
      setBuffering(p.status === 'loading');
    });
    return () => {
      onPlaying.remove();
      onStatus.remove();
    };
  }, [player]);

  const handlePlayPause = useCallback(() => {
    if (paused) {
      player.play();
      setPaused(false);
    } else {
      player.pause();
      setPaused(true);
    }
  }, [paused, player]);

  const handleRewind = useCallback(() => {
    player.seekBy(-2, 0);
  }, [player]);

  const handlePrevLine = useCallback(() => {
    if (localMedia.subtitleLines.length === 0) {
      player.seekBy(-3, 0);
      return;
    }
    for (let i = localMedia.subtitleLines.length - 1; i >= 0; i--) {
      if (localMedia.subtitleLines[i]!.starttime < currentTime - 0.5) {
        player.seekBy(localMedia.subtitleLines[i]!.starttime - currentTime, 0);
        return;
      }
    }
    player.seekBy(-3, 0);
  }, [currentTime, localMedia.subtitleLines, player]);

  const handleNextLine = useCallback(() => {
    if (localMedia.subtitleLines.length === 0) {
      player.seekBy(3, 0);
      return;
    }
    for (let i = 0; i < localMedia.subtitleLines.length; i++) {
      if (localMedia.subtitleLines[i]!.starttime > currentTime + 0.5) {
        player.seekBy(localMedia.subtitleLines[i]!.starttime - currentTime, 0);
        return;
      }
    }
    player.seekBy(3, 0);
  }, [currentTime, localMedia.subtitleLines, player]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── No media loaded ──
  if (!localMedia.hasMedia || !localMedia.mediaUri) {
    return (
      <View className="flex-1 bg-background">
        <Text className="px-4 py-3 text-lg font-bold text-foreground">{t('title.local_media')}</Text>
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-muted-foreground">
            {t('msg.no_videos_found')}
          </Text>
          <Pressable
            onPress={localMedia.openFile}
            className="flex-row items-center gap-2 rounded-lg bg-primary px-5 py-3 active:bg-primary/80"
          >
            <Upload size={18} color="#fff" />
            <Text className="font-medium text-primary-foreground">Open File</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Media loaded ──
  const hasSubtitles = localMedia.subtitleLines.length > 0;
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <View className="flex-1 bg-background">
      <Text className="px-4 py-3 text-lg font-bold text-foreground">{t('title.local_media')}</Text>

      {/* Player */}
      <View className="relative w-full bg-black" style={{ height: videoHeight }}>
        <VideoView
          player={player}
          style={{ width: '100%', height: '100%' }}
          nativeControls={false}
        />
        {buffering && (
          <View className="absolute inset-0 items-center justify-center bg-black/50">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        {localMedia.fileName && (
          <View className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1">
            <Text className="text-xs text-white" numberOfLines={1}>{localMedia.fileName}</Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <Pressable
        className="h-1 bg-muted"
        onPress={(e) => {
          const x = e.nativeEvent.locationX;
          const pct = x / screenWidth;
          const seekTo = pct * duration;
          player.seekBy(seekTo - currentTime, 0);
        }}
      >
        <View className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
      </Pressable>

      {/* Controls */}
      <View className="flex-row items-center justify-between border-b border-border px-4 py-2">
        <Text className="text-xs text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(duration)}
        </Text>
        <View className="flex-row items-center gap-3">
          <Pressable onPress={handlePrevLine} className="rounded p-1 active:bg-muted">
            <SkipBack size={20} className="text-foreground" />
          </Pressable>
          <Pressable onPress={handlePlayPause} className="rounded-full bg-primary p-2 active:bg-primary/80">
            {paused ? (
              <Play size={20} color="#fff" />
            ) : (
              <Pause size={20} color="#fff" />
            )}
          </Pressable>
          <Pressable onPress={handleRewind} className="rounded p-1 active:bg-muted">
            <SkipForward size={20} className="text-foreground" />
          </Pressable>
        </View>
        <View className="w-16" />
      </View>

      {/* File actions */}
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-2">
        <Pressable
          onPress={localMedia.loadCaptions}
          className="flex-row items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 active:bg-muted"
        >
          <FileText size={14} className="text-foreground" />
          <Text className="text-xs text-foreground">
            {hasSubtitles ? `${localMedia.subtitleLines.length} subs` : 'Load Captions'}
          </Text>
        </Pressable>
        <Pressable
          onPress={localMedia.openFile}
          className="flex-row items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 active:bg-muted"
        >
          <Upload size={14} className="text-foreground" />
          <Text className="text-xs text-foreground">Change File</Text>
        </Pressable>
        <View className="flex-1" />
        <Pressable
          onPress={localMedia.clear}
          className="rounded-lg p-1.5 active:bg-destructive/10"
        >
          <Trash2 size={16} className="text-muted-foreground" />
        </Pressable>
      </View>

      {/* Subtitles */}
      {hasSubtitles && (
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingVertical: 12 }}>
          {localMedia.subtitleLines.map((line, i) => {
            const isActive = currentTime >= line.starttime &&
              (i + 1 < localMedia.subtitleLines.length
                ? currentTime < localMedia.subtitleLines[i + 1]!.starttime
                : true);
            return (
              <Pressable
                key={i}
                onPress={() => player.seekBy(line.starttime - currentTime, 0)}
                className={`mb-2 rounded-lg px-3 py-2 ${isActive ? 'bg-primary/10 border border-primary/30' : ''}`}
              >
                <Text className={`text-sm ${isActive ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                  {line.line}
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">{formatTime(line.starttime)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
