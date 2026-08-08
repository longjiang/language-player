import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, Pressable, Image, ActivityIndicator, TextInput, ScrollView, Modal, Platform, ActionSheetIOS } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { baseCode } from '@langplayer/utils';
import { PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { localizedError } from '@/lib/errors';
import { PYTHON_API_URL } from '@/lib/api-url';
import { useResponsive } from '@/hooks/use-responsive';
import { gridColumnCount } from '@/lib/constants';
import { Tv, AlertCircle, ChevronDown } from 'lucide-react-native';
import { PageContainer } from '@/components/layout/PageContainer';

interface ShowWithMeta {
  id: string; title: string; locale: string;
  season?: number; episode?: number;
  year?: number; avg_views?: number;
  poster?: string; youtube_id?: string | null;
}

type SortKey = 'views' | 'title' | 'year';

const SORT_OPTIONS: { key: SortKey; labelKey: string }[] = [
  { key: 'views', labelKey: 'sort.most_viewed' },
  { key: 'title', labelKey: 'sort.title' },
  { key: 'year', labelKey: 'sort.year' },
];

/** Dropdown picker — uses native ActionSheet on iOS, safe-area-aware modal on Android. */
function DropdownPicker<T extends string>({
  value,
  options,
  getLabel,
  onChange,
}: {
  value: T;
  options: T[];
  getLabel: (opt: T) => string;
  onChange: (opt: T) => void;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const handlePress = () => {
    if (Platform.OS === 'ios') {
      const labels = options.map(getLabel);
      const cancelIndex = options.length; // "Cancel" is last
      const valueIndex = options.indexOf(value);

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...labels, 'Cancel'],
          cancelButtonIndex: cancelIndex,
          destructiveButtonIndex: valueIndex >= 0 ? valueIndex : undefined,
        },
        (index) => {
          if (index !== cancelIndex) {
            onChange(options[index]);
          }
        },
      );
    } else {
      setOpen(true);
    }
  };

  return (
    <View>
      <Pressable
        onPress={handlePress}
        className="flex-row items-center gap-1 rounded-lg border border-border bg-card px-3 py-2"
      >
        <Text className="text-sm text-foreground flex-1" numberOfLines={1}>
          {getLabel(value)}
        </Text>
        <ChevronDown size={14} color={ICON_MUTED} />
      </Pressable>

      {/* Android fallback: modal with safe-area-aware top padding */}
      {open && Platform.OS !== 'ios' && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable className="flex-1 bg-black/30" onPress={() => setOpen(false)}>
            {/* Invisible spacer to push content below the status bar */}
            <View style={{ height: insets.top + 8 }} />
            <View className="mx-4 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
              <ScrollView className="max-h-64">
                {options.map((opt) => (
                  <Pressable
                    key={opt}
                    onPress={() => { onChange(opt); setOpen(false); }}
                    className={`px-4 py-3 border-b border-border active:bg-muted ${
                      opt === value ? 'bg-primary/10' : ''
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        opt === value ? 'text-primary font-medium' : 'text-foreground'
                      }`}
                    >
                      {getLabel(opt)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

export default function TvShowsScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const { width, isMd } = useResponsive();
  const [shows, setShows] = useState<ShowWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [localeFilter, setLocaleFilter] = useState('all');
  const numColumns = gridColumnCount(width);
  const [gridWidth, setGridWidth] = useState(0);
  // Exact card width keeps incomplete last rows at normal size (no flex:1 stretch).
  const cardWidth =
    numColumns > 1 && gridWidth > 0
      ? Math.floor((gridWidth - 32 - 12 * (numColumns - 1)) / numColumns)
      : undefined;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${PYTHON_API_URL}/tv-shows?l2=${baseCode(l2Lang.code)}&limit=200`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setShows(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(localizedError(t, err, 'msg.no_shows_found'));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [l2Lang.code]);

  // Unique locales for filter
  const locales = useMemo(() => {
    const set = new Set<string>();
    shows.forEach((s) => { if (s.locale) set.add(s.locale); });
    return ['all', ...Array.from(set).sort()];
  }, [shows]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = [...shows];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.title.toLowerCase().includes(q));
    }

    if (localeFilter !== 'all') {
      result = result.filter((s) => s.locale === localeFilter);
    }

    result.sort((a, b) => {
      switch (sortKey) {
        case 'title': return (a.title ?? '').localeCompare(b.title ?? '');
        case 'year': return (b.year ?? 0) - (a.year ?? 0);
        case 'views':
        default: return (b.avg_views ?? 0) - (a.avg_views ?? 0);
      }
    });

    return result;
  }, [shows, search, sortKey, localeFilter]);

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
      <PageContainer maxWidth="7xl">
        <View className="px-4 py-8 flex-1">
        <Text className="text-2xl font-bold text-foreground mb-4">{t('title.tv_shows')}</Text>
        <View className="flex-row items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          <AlertCircle size={16} className="text-destructive" />
          <Text className="text-sm text-destructive">{error}</Text>
        </View>
        </View>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="7xl">
      {/* Header */}
      <View className="px-4 pt-5 pb-2">
        <Text className="text-2xl font-bold text-foreground">{t('title.tv_shows')}</Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          {t('msg.tv_shows_desc', { l2: t('lang.' + l2Lang.code) })}
        </Text>
      </View>

      {/* Toolbar: search + sort + locale filter */}
      <View
        className={
          isMd
            ? 'flex-row items-center gap-2 border-b border-border px-4 py-2'
            : 'gap-2 border-b border-border px-4 py-2'
        }
      >
        {/* Search */}
        <TextInput
          className={`rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground ${
            isMd ? 'flex-1' : ''
          }`}
          placeholder={t('action.search') + '...'}
          placeholderTextColor={PLACEHOLDER_COLOR}
          value={search}
          onChangeText={setSearch}
        />

        {/* Sort + Locale filter — dropdowns side by side */}
        <View className="flex-row gap-2">
          <View className={isMd ? 'min-w-[140px]' : 'flex-1'}>
            <DropdownPicker
              value={sortKey}
              options={SORT_OPTIONS.map((o) => o.key)}
              getLabel={(key) => t(SORT_OPTIONS.find((o) => o.key === key)!.labelKey)}
              onChange={setSortKey}
            />
          </View>

          {locales.length > 2 && (
            <View className={isMd ? 'min-w-[140px]' : 'flex-1'}>
              <DropdownPicker
                value={localeFilter}
                options={locales}
                getLabel={(loc) => (loc === 'all' ? t('title.filter_by_locale') : loc.toUpperCase())}
                onChange={setLocaleFilter}
              />
            </View>
          )}
        </View>
      </View>

      {/* Empty */}
      {filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Tv size={48} color={ICON_MUTED} />
          <Text className="mt-4 text-center text-muted-foreground">{t('msg.no_shows_found')}</Text>
        </View>
      ) : (
        /* Grid — responsive columns (1/2/3/4 at web breakpoints) */
        <View className="flex-1" onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            key={`tv-shows-${numColumns}`}
            numColumns={numColumns}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            columnWrapperStyle={numColumns > 1 ? { gap: 12 } : undefined}
            renderItem={({ item }) => {
              const coverUrl =
                item.poster ??
                (item.youtube_id
                  ? `https://img.youtube.com/vi/${item.youtube_id}/hqdefault.jpg`
                  : null);

              return (
                <Pressable
                  onPress={() => router.push(`/(tabs)/(media)/tv-shows/${item.id}` as any)}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                  style={numColumns > 1 ? { width: cardWidth } : undefined}
                >
                {/* Poster */}
                <View className="relative aspect-video bg-muted">
                  {coverUrl ? (
                    <Image source={{ uri: coverUrl }} className="h-full w-full" />
                  ) : (
                    <View className="flex-1 items-center justify-center">
                      <Tv size={32} color={ICON_MUTED} />
                    </View>
                  )}
                  {/* Views badge */}
                  {item.avg_views != null && item.avg_views > 0 && (
                    <View className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5">
                      <Text className="text-xs text-white">
                        {item.avg_views.toLocaleString()}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Info */}
                <View className="p-3">
                  <Text className="text-sm font-semibold text-foreground" numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View className="mt-1 flex-row items-center gap-2">
                    {item.year ? (
                      <Text className="text-xs text-muted-foreground">{item.year}</Text>
                    ) : null}
                    {item.locale ? (
                      <Text className="text-xs text-muted-foreground uppercase">{item.locale}</Text>
                    ) : null}
                  </View>
                </View>
                </Pressable>
              );
            }}
          />
        </View>
      )}
    </PageContainer>
  );
}
