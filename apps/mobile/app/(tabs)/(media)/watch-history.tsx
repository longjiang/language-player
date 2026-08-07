import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, SectionList, Pressable, Image, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { baseCode } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { Clock, AlertCircle, Play, Trash2 } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { YouTubeVideo } from '@langplayer/shared';
import { PageContainer } from '@/components/layout/PageContainer';

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

interface HistorySection {
  title: string;
  data: WatchHistoryItem[];
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

function formatDate(dateStr: string | undefined, locale: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Get just the date portion (yyyy-mm-dd) for grouping. */
function dateKey(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().slice(0, 10);
}

/** Format a date key for section header display. */
function formatSectionDate(dateKey: string, locale: string, todayLabel: string): string {
  if (!dateKey) return todayLabel;
  const today = new Date().toISOString().slice(0, 10);
  if (dateKey === today) return todayLabel;
  const d = new Date(dateKey + 'T00:00:00');
  return d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function WatchHistoryScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { user } = useAuth();
  const t = useT();

  const [items, setItems] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  // ── Fetch ──
  useEffect(() => {
    if (!user?.id || !l2Lang?.code) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    authenticatedFetch(`${PYTHON_API_URL}/watch-history?l2=${encodeURIComponent(baseCode(l2Lang.code))}`)
      .then((res) => {
        if (res.status === 404) return [];
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { history?: WatchHistoryItem[] }) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const unique = (data?.history ?? [])
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

  // ── Date grouping ──
  const sections = useMemo((): HistorySection[] => {
    // Sort descending by date
    const sorted = [...items].sort((a, b) => {
      const da = a.date ?? '';
      const db = b.date ?? '';
      return db.localeCompare(da);
    });

    // Group by date key (yyyy-mm-dd)
    const groups = new Map<string, WatchHistoryItem[]>();
    for (const item of sorted) {
      const key = dateKey(item.date) || '__unknown__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    const todayLabel = t('label.today');
    const locale = l1Lang?.code ?? 'en';
    const result: HistorySection[] = [];
    // Sort group keys descending
    const groupKeys = [...groups.keys()].sort((a, b) => {
      if (a === '__unknown__') return 1;
      if (b === '__unknown__') return -1;
      return b.localeCompare(a);
    });

    for (const key of groupKeys) {
      const title = key === '__unknown__' ? '' : formatSectionDate(key, locale, todayLabel);
      result.push({ title, data: groups.get(key)! });
    }

    return result;
  }, [items, l1Lang?.code]);

  // ── Clear all ──
  const handleClearAll = useCallback(() => {
    Alert.alert(
      t('action.clear_all'),
      undefined,
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: t('action.clear_all'),
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              // Delete items one by one via Flask proxy
              for (const item of items) {
                await authenticatedFetch(`${PYTHON_API_URL}/watch-history/${item.id}`, {
                  method: 'DELETE',
                });
              }
              setItems([]);
            } catch {
              Alert.alert(t('error.something_went_wrong'));
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  }, [items]);

  const handlePlay = (item: WatchHistoryItem) => {
    router.push(`/(tabs)/(media)/watch/${item.youtube_id}` as any);
  };

  // ── Not authenticated ──
  if (!user) {
    return (
      <PageContainer maxWidth="4xl">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.watch_history')}</Text>
        <View className="flex-1 items-center justify-center px-8">
          <AlertCircle size={40} className="mb-3 text-muted-foreground" />
          <Text className="text-center text-muted-foreground">{t('msg.not_authenticated')}</Text>
        </View>
      </PageContainer>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <PageContainer maxWidth="4xl">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.watch_history')}</Text>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" className="text-primary" />
        </View>
      </PageContainer>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <PageContainer maxWidth="4xl">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.watch_history')}</Text>
        <View className="mx-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          <Text className="text-sm text-destructive">{error}</Text>
        </View>
      </PageContainer>
    );
  }

  // ── Empty or list ──
  return (
    <PageContainer maxWidth="4xl">
      {/* Header row */}
      <View className="flex-row items-center justify-between px-4 py-5">
        <Text className="text-xl font-bold text-foreground">{t('title.watch_history')}</Text>
        {items.length > 0 && (
          <Pressable
            onPress={handleClearAll}
            disabled={clearing}
            className="flex-row items-center gap-1 rounded-lg px-3 py-2 active:bg-muted"
          >
            {clearing ? (
              <ActivityIndicator size="small" className="text-destructive" />
            ) : (
              <Trash2 size={16} color={ICON_MUTED} />
            )}
            <Text className="text-sm text-muted-foreground">{t('action.clear_all')}</Text>
          </Pressable>
        )}
      </View>

      {items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Clock size={40} className="mb-3 text-muted-foreground" />
          <Text className="text-center text-muted-foreground">{t('msg.no_watch_history')}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => {
            if (!section.title) return null;
            return (
              <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2 px-1">
                {section.title}
              </Text>
            );
          }}
          renderItem={({ item }) => {
            const thumb = youtubeThumbnail(item.youtube_id);
            const durationStr = formatDuration(item.duration);
            const dateStr = formatDate(item.date, l1Lang?.code ?? 'en');
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
      )}
    </PageContainer>
  );
}
