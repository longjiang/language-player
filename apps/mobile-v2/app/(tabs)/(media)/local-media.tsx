import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useT } from '@/hooks/use-t';
import { useLocalMedia } from '@/hooks/use-local-media';
import type { SubtitleLine } from '@langplayer/shared';
import { Play, Pause, SkipBack, SkipForward, Upload, FileText, X, FileVideo, FileAudio } from 'lucide-react-native';

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
    if (paused) { player.play(); setPaused(false); }
    else { player.pause(); setPaused(true); }
  }, [paused, player]);

  const handleRewind = useCallback(() => player.seekBy(-2), [player]);

  const handlePrevLine = useCallback(() => {
    if (localMedia.subtitleLines.length === 0) { player.seekBy(-3); return; }
    for (let i = localMedia.subtitleLines.length - 1; i >= 0; i--) {
      if (localMedia.subtitleLines[i]!.starttime < currentTime - 0.5) {
        player.seekBy(localMedia.subtitleLines[i]!.starttime - currentTime);
        return;
      }
    }
    player.seekBy(-3);
  }, [currentTime, localMedia.subtitleLines, player]);

  const handleNextLine = useCallback(() => {
    if (localMedia.subtitleLines.length === 0) { player.seekBy(3); return; }
    for (let i = 0; i < localMedia.subtitleLines.length; i++) {
      if (localMedia.subtitleLines[i]!.starttime > currentTime + 0.5) {
        player.seekBy(localMedia.subtitleLines[i]!.starttime - currentTime);
        return;
      }
    }
    player.seekBy(3);
  }, [currentTime, localMedia.subtitleLines, player]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const hasSubtitles = localMedia.subtitleLines.length > 0;
  const progress = duration > 0 ? currentTime / duration : 0;

  // ── File bar (matches web's CustomMediaUpload compact bar) ──
  const FileBar = () => (
    <View className="flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      {localMedia.isAudio ? (
        <FileAudio size={16} className="text-muted-foreground" />
      ) : (
        <FileVideo size={16} className="text-muted-foreground" />
      )}
      <Text className="flex-1 truncate text-sm font-medium text-foreground" numberOfLines={1}>
        {localMedia.fileName ?? t('label.untitled_video')}
      </Text>
      <Pressable
        onPress={localMedia.loadCaptions}
        className="flex-row items-center gap-1 rounded px-2 py-1 active:bg-muted"
      >
        <FileText size={14} className="text-muted-foreground" />
        <Text className="text-xs text-muted-foreground">
          {hasSubtitles ? `${localMedia.subtitleLines.length} captions` : 'Add captions'}
        </Text>
      </Pressable>
      <Pressable
        onPress={localMedia.clear}
        className="rounded p-1 active:bg-muted"
      >
        <X size={14} className="text-muted-foreground" />
      </Pressable>
    </View>
  );

  // ── Player ──
  const PlayerSection = () => (
    <View>
      <View className="relative w-full bg-black" style={{ height: videoHeight }}>
        <VideoView
          player={player}
          style={{ width: '100%', height: '100%' }}
          nativeControls={false}
        />
        {buffering && (
          <View className="absolute inset-0 items-center justify-center bg-black/50">
            <ActivityIndicator size="large" color="white" />
          </View>
        )}
      </View>

      {/* Progress bar */}
      <Pressable
        className="h-1 bg-muted"
        onPress={(e) => {
          const pct = e.nativeEvent.locationX / screenWidth;
          player.seekBy(pct * duration - currentTime);
        }}
      >
        <View className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
      </Pressable>

      {/* Controls — matching web's VideoControlBar */}
      <View className="flex-row items-center justify-between border-b border-border px-4 py-2">
        <Text className="text-xs text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(duration)}
        </Text>
        <View className="flex-row items-center gap-3">
          <Pressable onPress={handlePrevLine} className="rounded p-1 active:bg-muted">
            <SkipBack size={20} className="text-foreground" />
          </Pressable>
          <Pressable onPress={handlePlayPause} className="rounded-full bg-primary p-2 active:bg-primary/80">
            {paused ? <Play size={20} color="white" /> : <Pause size={20} color="white" />}
          </Pressable>
          <Pressable onPress={handleRewind} className="rounded p-1 active:bg-muted">
            <SkipForward size={20} className="text-foreground" />
          </Pressable>
        </View>
        <View className="w-16" />
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Text className="px-4 py-3 text-lg font-bold text-foreground">{t('title.local_media')}</Text>

      {/* Upload state — matches web's dashed border upload area */}
      {!localMedia.hasMedia && (
        <View className="mx-4 flex-1 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 p-10">
          <Upload size={48} className="mb-4 text-muted-foreground/40" />
          <Text className="mb-2 text-sm text-muted-foreground">{t('msg.drop_media_here')}</Text>
          <Text className="mb-4 text-xs text-muted-foreground/60">{t('msg.supported_media_formats')}</Text>
          <Pressable
            onPress={localMedia.openFile}
            className="flex-row items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 active:bg-muted"
          >
            <Upload size={16} className="text-foreground" />
            <Text className="text-sm text-foreground">{t('action.browse')}</Text>
          </Pressable>
        </View>
      )}

      {/* Media loaded — file bar + player + subtitles */}
      {localMedia.hasMedia && (
        <View className="flex-1">
          <View className="px-4 pb-2">
            <FileBar />
          </View>
          <PlayerSection />

          {/* Subtitles — matching web's subtitle panel */}
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
                    onPress={() => player.seekBy(line.starttime - currentTime)}
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
      )}
    </View>
  );
}
