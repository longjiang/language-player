import { useEffect, useState } from 'react';
import { View, Text, Image, ActivityIndicator, FlatList } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { router, useLocalSearchParams } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { baseCode } from '@langplayer/utils';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ArrowLeft, Tv, Clock, Eye, AlertCircle } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { YouTubeVideo } from '@langplayer/shared';

interface TvShow {
  id: number;
  title: string;
  youtube_id?: string | null;
  avg_views?: number | null;
  locale?: string | null;
  description?: string | null;
}

interface Episode {
  id: number;
  youtube_id: string;
  title: string;
  views?: number | null;
  duration?: string | null;
  date?: string | null;
  level?: number | null;
  difficulty?: number | null;
  tv_show?: number | null;
}

function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
}

function formatDuration(dur?: string | null): string {
  if (!dur) return '';
  const iso = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (iso) {
    const h = iso[1] ? `${iso[1]}:` : '';
    const m = iso[2] ? iso[2].padStart(2, '0') : '00';
    const s = iso[3] ? iso[3].padStart(2, '0') : '00';
    return `${h}${m}:${s}`;
  }
  const secs = parseInt(dur, 10);
  if (!isNaN(secs)) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }
  return dur;
}

export default function TvShowEpisodesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const { l2Lang } = useLanguage();
  const { playVideo } = useVideoPlayer();
  const showId = Number(id);

  const [show, setShow] = useState<TvShow | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`${PYTHON_API_URL}/tv-shows/${showId}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      fetch(`${PYTHON_API_URL}/tv-shows/${showId}/episodes?sort=title&l2=${baseCode(l2Lang.code)}`).then((r) =>
        r.ok ? r.json() : Promise.reject(r.status),
      ),
    ])
      .then(([showData, episodesData]) => {
        if (!cancelled) {
          setShow(showData);
          setEpisodes(Array.isArray(episodesData) ? episodesData : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('msg.no_episodes'));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [showId, l2Lang.code]);

  const handlePlayEpisode = (ep: Episode, idx: number) => {
    const queue: YouTubeVideo[] = episodes.map((ep) => ({
      youtube_id: ep.youtube_id,
      title: ep.title,
      id: String(ep.id),
      views: ep.views ?? undefined,
      difficulty: ep.difficulty ?? undefined,
    }));
    const video = queue[idx];
    if (video) {
      playVideo(video, queue, 'tvShow', {
        tvShow: show ? { id: show.id, title: show.title } : undefined,
      });
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" className="text-primary" />
      </View>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <View className="flex-1 bg-background">
        <Pressable onPress={() => router.back()} className="px-4 py-5">
          <ArrowLeft size={20} color={ICON_MUTED} />
        </Pressable>
        <View className="flex-1 items-center justify-center px-8">
          <AlertCircle size={40} className="mb-3 text-muted-foreground" />
          <Text className="text-center text-muted-foreground">{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="w-full flex-1 self-center" style={{ maxWidth: 896 }}>
        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          className="flex-row items-center gap-1 px-4 py-5"
        >
          <ArrowLeft size={20} color={ICON_MUTED} />
          <Text className="text-sm text-muted-foreground">{t('action.back')}</Text>
        </Pressable>

        {/* Show header */}
        {show && (
          <View className="mb-4 px-4">
            <View className="flex-row items-center gap-3">
              <Tv size={28} className="text-primary" />
              <View className="flex-1">
                <Text className="text-3xl font-bold text-foreground">{show.title}</Text>
                {show.locale ? (
                  <Text className="text-sm text-muted-foreground uppercase">{show.locale}</Text>
                ) : null}
              </View>
            </View>
            {show.description ? (
              <Text className="mt-3 text-base text-muted-foreground">{show.description}</Text>
            ) : null}
          </View>
        )}

        {/* Episodes */}
        <View className="flex-row items-center justify-between px-4 mb-3">
          <Text className="text-lg font-semibold text-foreground">
            {t('title.episodes')} ({episodes.length})
          </Text>
        </View>

        {episodes.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Tv size={40} className="mb-3 text-muted-foreground" />
            <Text className="text-center text-base text-muted-foreground">{t('msg.no_episodes')}</Text>
          </View>
        ) : (
          <FlatList
            data={episodes}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            renderItem={({ item, index }) => {
              const thumb = youtubeThumbnail(item.youtube_id);
              const durationStr = formatDuration(item.duration);

              return (
                <Pressable
                  onPress={() => handlePlayEpisode(item, index)}
                  className="mb-1 flex-row items-center gap-3 rounded-lg border border-border px-3 py-2 active:bg-muted"
                >
                  {/* Episode number */}
                  <Text className="w-8 text-center text-sm font-medium text-muted-foreground">
                    {index + 1}
                  </Text>

                  {/* Thumbnail */}
                  <View className="h-14 w-24 overflow-hidden rounded bg-muted">
                    <Image source={{ uri: thumb }} className="h-full w-full" />
                  </View>

                  {/* Info */}
                  <View className="flex-1 min-w-0">
                    <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View className="mt-1 flex-row items-center gap-3">
                      {durationStr ? (
                        <View className="flex-row items-center gap-1">
                          <Clock size={12} color={ICON_MUTED} />
                          <Text className="text-xs text-muted-foreground">{durationStr}</Text>
                        </View>
                      ) : null}
                      {item.views != null && item.views > 0 ? (
                        <View className="flex-row items-center gap-1">
                          <Eye size={12} color={ICON_MUTED} />
                          <Text className="text-xs text-muted-foreground">{item.views.toLocaleString()}</Text>
                        </View>
                      ) : null}
                      {item.level != null ? (
                        <View className="rounded bg-muted px-1.5 py-0.5">
                          <Text className="text-xs text-muted-foreground">L{item.level}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}
