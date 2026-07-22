import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Image, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Clock, AlertCircle, Play } from 'lucide-react-native';
import type { YouTubeVideo } from '@langplayer/shared';

interface WatchHistoryItem {
  id: number;
  channel_id?: string;
  l2?: number;
  title?: string;
  youtube_id: string;
  duration?: number;
  date?: string;
  last_position?: number;
}

function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
}

function parseDurationIso(iso: string): number | undefined {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!m) return undefined;
  return (parseInt(m[1] ?? '0') * 3600) + (parseInt(m[2] ?? '0') * 60) + parseFloat(m[3] ?? '0');
}

function formatDuration(seconds: number | string | undefined): string {
  if (seconds == null || seconds === '') return '';
  let num: number;
  if (typeof seconds === 'string') {
    num = parseDurationIso(seconds) ?? parseFloat(seconds);
    if (isNaN(num) || num <= 0) return '';
  } else {
    num = seconds;
    if (num <= 0) return '';
  }
  const mins = Math.floor(num / 60);
  const secs = Math.floor(num % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function WatchHistoryScreen() {
  const { l2Lang } = useLanguage();
  const { user, token } = useAuth();
  const t = useT();

  const [items, setItems] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !l2Lang?.code) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${PYTHON_API_URL}/user-watch-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, l2: l2Lang.code }),
    })
      .then((res) => {
        if (res.status === 404) return [];
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: WatchHistoryItem[]) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const unique = (Array.isArray(data) ? data : [])
          .filter((item) => {
            if (seen.has(item.youtube_id)) return false;
            seen.add(item.youtube_id);
            return true;
          });
        setItems(unique);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? t('msg.failed_to_load_watch_history'));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [user?.id, l2Lang?.code]);

  const handlePlay = (item: WatchHistoryItem) => {
    router.push(`/(tabs)/(media)/watch/${item.youtube_id}` as any);
  };

  // ── Not authenticated ──
  if (!user) {
    return (
      <View className="flex-1 bg-background">
        <Text className="px-4 py-3 text-xl font-bold text-foreground">{t('title.watch_history')}</Text>
        <View className="flex-1 items-center justify-center px-8">
          <AlertCircle size={40} className="mb-3 text-muted-foreground" />
          <Text className="text-center text-muted-foreground">{t('msg.not_authenticated')}</Text>
        </View>
      </View>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <View className="flex-1 bg-background">
        <Text className="px-4 py-3 text-xl font-bold text-foreground">{t('title.watch_history')}</Text>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" className="text-primary" />
        </View>
      </View>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <View className="flex-1 bg-background">
        <Text className="px-4 py-3 text-xl font-bold text-foreground">{t('title.watch_history')}</Text>
        <View className="mx-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          <Text className="text-sm text-destructive">{error}</Text>
        </View>
      </View>
    );
  }

  // ── Empty ──
  if (items.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <Text className="px-4 py-3 text-xl font-bold text-foreground">{t('title.watch_history')}</Text>
        <View className="flex-1 items-center justify-center px-8">
          <Clock size={40} className="mb-3 text-muted-foreground" />
          <Text className="text-center text-muted-foreground">{t('msg.no_watch_history')}</Text>
        </View>
      </View>
    );
  }

  // ── List ──
  return (
    <View className="flex-1 bg-background">
      <Text className="px-4 py-3 text-xl font-bold text-foreground">{t('title.watch_history')}</Text>
      <FlatList
        data={items}
        keyExtractor={(item, idx) => `${item.id}-${idx}`}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        renderItem={({ item }) => {
          const thumb = youtubeThumbnail(item.youtube_id);
          const durationStr = formatDuration(item.duration);
          const dateStr = formatDate(item.date);
          const durNum = typeof item.duration === 'string'
            ? (parseDurationIso(item.duration) ?? parseFloat(item.duration))
            : (item.duration ?? 0);
          const progressPct = item.last_position != null && item.last_position > 0 && durNum > 0
            ? Math.min(Math.round((item.last_position / durNum) * 100), 100)
            : 0;

          return (
            <Pressable
              onPress={() => handlePlay(item)}
              className="mb-1 flex-row items-center gap-3 rounded-lg border border-border px-3 py-2 active:bg-muted"
            >
              {/* Thumbnail */}
              <View className="relative h-14 w-24 overflow-hidden rounded bg-muted">
                <Image source={{ uri: thumb }} className="h-full w-full" />
                {durationStr ? (
                  <View className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1">
                    <Text className="text-[10px] text-white">{durationStr}</Text>
                  </View>
                ) : null}
                {/* Progress bar */}
                {progressPct > 0 && (
                  <View className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30">
                    <View className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
                  </View>
                )}
              </View>

              {/* Info */}
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
                  {item.title ?? t('label.untitled_video')}
                </Text>
                <View className="mt-1 flex-row items-center gap-2">
                  {dateStr ? <Text className="text-xs text-muted-foreground">{dateStr}</Text> : null}
                  {durationStr ? <Text className="text-xs text-muted-foreground">{durationStr}</Text> : null}
                  {progressPct > 0 ? (
                    <Text className="text-xs text-primary">{progressPct}%</Text>
                  ) : null}
                </View>
              </View>

              <Play size={18} className="text-muted-foreground" />
            </Pressable>
          );
        }}
      />
    </View>
  );
}
