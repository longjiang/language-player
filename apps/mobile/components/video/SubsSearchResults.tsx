import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, Image, Pressable, Modal, FlatList, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useVideos } from '@langplayer/api-client';
import { parseSubsL2, findMatchLine } from '@langplayer/utils';
import type { SubsSearchVideo, SubtitleLine } from '@langplayer/shared';
import { YouTubePlayer, type YouTubePlayerHandle } from './YouTubePlayer';
import { SubtitleDisplay } from './SubtitleDisplay';
import { ICON_MUTED } from '@/lib/theme-colors';
import { List, X, Play, Pause, SkipBack, SkipForward, ChevronUp, ChevronDown } from 'lucide-react-native';

function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
}

interface SubsSearchResultsProps {
  term: string;
  exactMatch?: boolean;
  onExactToggle?: (exact: boolean) => void;
  formCount?: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SubsSearchResults({ term, exactMatch = false, onExactToggle, formCount = 0 }: SubsSearchResultsProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const router = useRouter();
  const videosApi = useVideos();
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const { width: screenWidth } = useWindowDimensions();
  const videoHeight = (screenWidth / 16) * 9;

  const [videos, setVideos] = useState<SubsSearchVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [paused, setPaused] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const currentVideo = videos[currentIndex] ?? null;
  const matchLine = currentVideo?.subs_l2[currentVideo.matchLineIndex] ?? null;

  // Split comma-separated terms for highlighting
  const highlightTerms = useMemo(
    () => term.split(',').map((t) => t.trim()).filter(Boolean),
    [term],
  );

  // Pre-parsed subtitle lines for SubtitleDisplay
  const subtitleInitialLines = useMemo(
    () =>
      currentVideo?.subs_l2.map((l) => ({
        starttime: l.starttime,
        l2Line: l.line,
      })) ?? [],
    [currentVideo?.id, currentVideo?.subs_l2],
  );

  // ── Fetch ──
  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    videosApi.searchSubs({ terms: term, l2: l2Lang.code, limit: 100, context: 3 })
      .then((data) => {
        if (cancelled) return;
        const searchForms = term.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        const parsed: SubsSearchVideo[] = data
          .map((v: any) => {
            const lines = parseSubsL2(v.subs_l2 ?? '');
            return {
              id: v.id,
              title: v.title ?? t('label.untitled_video'),
              youtube_id: v.youtube_id,
              subs_l2: lines,
              views: v.views,
              duration: v.duration,
              date: v.date,
              matchLineIndex: findMatchLine(lines, term),
            };
          })
          .filter((v) =>
            v.subs_l2.some((l) =>
              searchForms.some((f) => l.line.toLowerCase().includes(f)),
            ),
          );
        setVideos(parsed);
        setCurrentIndex(0);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? t('error.subs_search_failed'));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [term, l2Lang.code]);

  // ── Seek to match on video change ──
  useEffect(() => {
    if (currentVideo && matchLine) {
      const timer = setTimeout(() => {
        playerRef.current?.seekTo(matchLine.starttime);
        playerRef.current?.play();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, currentVideo?.youtube_id]);

  // ── Player callbacks ──
  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), []);
  const handleStateChange = useCallback((state: string) => {
    setPaused(state === 'paused' || state === 'ended');
  }, []);

  const handlePlayPause = () => {
    if (paused) { playerRef.current?.play(); setPaused(false); }
    else { playerRef.current?.pause(); setPaused(true); }
  };

  const goToPrev = () => { if (currentIndex > 0) setCurrentIndex((i) => i - 1); };
  const goToNext = () => { if (currentIndex < videos.length - 1) setCurrentIndex((i) => i + 1); };

  const goToPrevLine = () => {
    if (!currentVideo) return;
    const subs = currentVideo.subs_l2;
    for (let i = subs.length - 1; i >= 0; i--) {
      if (subs[i]!.starttime < currentTime - 0.3) {
        playerRef.current?.seekTo(subs[i]!.starttime);
        return;
      }
    }
  };

  const goToNextLine = () => {
    if (!currentVideo) return;
    const subs = currentVideo.subs_l2;
    for (let i = 0; i < subs.length; i++) {
      if (subs[i]!.starttime > currentTime + 0.3) {
        playerRef.current?.seekTo(subs[i]!.starttime);
        return;
      }
    }
  };

  const selectFromList = (idx: number) => {
    setCurrentIndex(idx);
    setListOpen(false);
  };

  // ── Loading ──
  if (loading) {
    return (
      <View className="my-4 items-center justify-center py-8">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <View className="my-4 px-4">
        <Text className="text-sm text-muted-foreground">{error}</Text>
      </View>
    );
  }

  // ── Empty ──
  if (videos.length === 0) {
    return (
      <View className="my-4 px-4">
        <Text className="text-sm text-muted-foreground">{t('msg.no_results')}</Text>
      </View>
    );
  }

  // ── Render ──
  return (
    <View className="my-4">
      {/* Header */}
      <View className="mb-2 flex-row items-center justify-between px-4">
        <Text className="text-xs text-muted-foreground">
          {t('msg.video_n_of_total', { n: currentIndex + 1, total: videos.length })}
        </Text>
        <View className="flex-row items-center gap-2">
          {formCount > 1 && (
            <Pressable
              onPress={() => onExactToggle?.(!exactMatch)}
              className={`rounded-full px-2.5 py-0.5 ${exactMatch ? 'bg-primary/10' : 'bg-muted'}`}
            >
              <Text className={`text-xs font-medium ${exactMatch ? 'text-primary' : 'text-muted-foreground'}`}>
                {exactMatch ? term : `${formCount} forms`}
              </Text>
            </Pressable>
          )}
          <Pressable onPress={() => setListOpen(true)} className="rounded-full bg-muted p-2">
            <List size={16} color={ICON_MUTED} />
          </Pressable>
        </View>
      </View>

      {/* Player */}
      <View style={{ width: screenWidth, height: videoHeight }} className="bg-black">
        <YouTubePlayer
          ref={playerRef}
          youtubeId={currentVideo!.youtube_id}
          onTimeUpdate={handleTimeUpdate}
          onStateChange={handleStateChange}
        />
      </View>

      {/* Subtitle */}
      <View className="h-32">
        <SubtitleDisplay
          currentTime={currentTime}
          initialLines={subtitleInitialLines}
          highlightTerms={highlightTerms}
        />
      </View>

      {/* Controls */}
      <View className="flex-row items-center justify-center gap-2 px-4 py-2">
        <Pressable onPress={goToPrevLine} className="rounded-full bg-muted p-2">
          <ChevronUp size={18} color={ICON_MUTED} />
        </Pressable>
        <Pressable onPress={goToPrev} className="rounded-full bg-muted p-2">
          <SkipBack size={18} color={ICON_MUTED} />
        </Pressable>
        <Pressable onPress={handlePlayPause} className="rounded-full bg-primary p-3">
          {paused ? <Play size={20} color="#fff" /> : <Pause size={20} color="#fff" />}
        </Pressable>
        <Pressable onPress={goToNext} className="rounded-full bg-muted p-2">
          <SkipForward size={18} color={ICON_MUTED} />
        </Pressable>
        <Pressable onPress={goToNextLine} className="rounded-full bg-muted p-2">
          <ChevronDown size={18} color={ICON_MUTED} />
        </Pressable>
      </View>

      {/* Watch full video link */}
      {currentVideo && (
        <Pressable
          onPress={() => router.push(`/(tabs)/(media)/watch/${currentVideo.youtube_id}`)}
          className="mx-4 mt-1 rounded-lg border border-border px-4 py-2 active:bg-muted"
        >
          <Text className="text-center text-sm text-primary">{t('action.watch')}</Text>
        </Pressable>
      )}

      {/* ── Video List Modal ── */}
      <Modal visible={listOpen} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-background">
          {/* Modal header */}
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <Text className="text-base font-semibold text-foreground">
              {videos.length} videos
            </Text>
            <Pressable onPress={() => setListOpen(false)} className="rounded-full bg-muted p-2">
              <X size={18} color={ICON_MUTED} />
            </Pressable>
          </View>

          {/* Video list */}
          <FlatList
            data={videos}
            keyExtractor={(v) => String(v.id)}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item, index }) => {
              const ml = item.subs_l2[item.matchLineIndex];
              const isActive = index === currentIndex;
              return (
                <Pressable
                  onPress={() => selectFromList(index)}
                  className={`mb-2 flex-row gap-3 rounded-lg p-2 ${isActive ? 'bg-primary/5' : ''}`}
                >
                  {/* Thumbnail */}
                  <View className="h-12 w-20 overflow-hidden rounded bg-muted">
                    <Image
                      source={{ uri: youtubeThumbnail(item.youtube_id) }}
                      className="h-full w-full"
                      resizeMode="cover"
                    />
                    {ml && (
                      <View className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1">
                        <Text className="text-[10px] text-white">{formatTime(ml.starttime)}</Text>
                      </View>
                    )}
                  </View>

                  {/* Info */}
                  <View className="flex-1">
                    <Text className="text-xs font-medium text-foreground" numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.matchLineIndex > 0 && (
                      <Text className="text-[11px] text-muted-foreground/50" numberOfLines={1}>
                        {item.subs_l2[item.matchLineIndex - 1]?.line}
                      </Text>
                    )}
                    {ml && (
                      <Text className="text-xs text-foreground" numberOfLines={2}>
                        {ml.line}
                      </Text>
                    )}
                    {item.matchLineIndex < item.subs_l2.length - 1 && (
                      <Text className="text-[11px] text-muted-foreground/50" numberOfLines={1}>
                        {item.subs_l2[item.matchLineIndex + 1]?.line}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}
