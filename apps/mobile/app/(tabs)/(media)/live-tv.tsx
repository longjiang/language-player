import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, Image, TextInput, ScrollView, Modal, Platform, ActionSheetIOS } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { PLACEHOLDER_COLOR, ICON_MUTED, ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { PYTHON_API_URL } from '@/lib/api-url';
import { LiveTVPlayer } from '@/components/video/LiveTVPlayer';
import { Search, Wifi, WifiHigh, WifiLow, Tv, SlidersHorizontal, ChevronDown } from 'lucide-react-native';
import type { LiveTVChannel } from '@langplayer/shared';
import { PageContainer } from '@/components/layout/PageContainer';
import { OfflineFeatureNotice } from '@/components/OfflineFeatureNotice';

type SortKey = 'latency' | 'name' | 'random';

/** Resolve country code to localized name using Intl.DisplayNames. */
function countryName(code: string, locale: string): string {
  try {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    return names.of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

/** Dropdown picker — native ActionSheet on iOS, safe-area-aware modal on Android. */
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
      const cancelIndex = options.length;
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...labels, 'Cancel'],
          cancelButtonIndex: cancelIndex,
        },
        (index) => {
          if (index !== cancelIndex) onChange(options[index]);
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

      {open && Platform.OS !== 'ios' && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable className="flex-1 bg-black/30" onPress={() => setOpen(false)}>
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

export default function LiveTvScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const { width, isLg, isXl } = useResponsive();
  const [channels, setChannels] = useState<LiveTVChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<LiveTVChannel | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('latency');
  const [showFilters, setShowFilters] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${PYTHON_API_URL}/live-tv/channels?l2=${l2Lang.code}&sort=${sortBy}&limit=200`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.channels || [];
        setChannels(list);
        setError(null);
        // Auto-select first alive channel
        if (!selectedChannel) {
          const firstAlive = list.find((c: LiveTVChannel) => c.alive === 1);
          if (firstAlive) setSelectedChannel(firstAlive);
          else if (list.length > 0) setSelectedChannel(list[0]);
        }
      })
      .catch(() => setError('msg.no_videos_found'))
      .finally(() => setLoading(false));
  }, [l2Lang.code, sortBy]);

  // Derived data
  const categories = useMemo(
    () => [...new Set(channels.map((c) => c.category).filter(Boolean))].sort(),
    [channels]
  );
  const countries = useMemo(() => {
    const set = new Set<string>();
    channels.forEach((c) => c.countries?.split(',').forEach((co) => set.add(co.trim())));
    return [...set].filter(Boolean).sort();
  }, [channels]);

  const filtered = useMemo(() => {
    let list = channels;
    if (category) list = list.filter((c) => c.category === category);
    if (country) list = list.filter((c) => c.countries?.includes(country));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [channels, category, country, search]);

  // Signal strength helper
  const getSignalIcon = (ch: LiveTVChannel) => {
    if (!ch.alive) return <WifiLow size={14} className="text-muted-foreground" />;
    const ms = ch.latency_ms ?? 9999;
    if (ms < 300) return <WifiHigh size={14} className="text-green-500" />;
    if (ms < 1000) return <Wifi size={14} className="text-yellow-500" />;
    return <WifiLow size={14} className="text-orange-500" />;
  };

  const getLatencyText = (ch: LiveTVChannel) => {
    if (!ch.alive) return '';
    const ms = ch.latency_ms ?? 0;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const contentWidth = Math.min(width, 1280);
  const asideWidth = isXl ? 384 : 320;
  // The row carries px-4 (32pt total); the lg row also has a 24pt gap before the aside.
  const playerWidth = isLg ? contentWidth - 32 - asideWidth - 24 : contentWidth - 32;

  const channelListPanel = (
    <>
      {/* Search & filter bar */}
      <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
        <View className="flex-1 flex-row items-center rounded-lg border border-border bg-card px-2.5">
          <Search size={14} color={ICON_MUTED} />
          <TextInput
            className="flex-1 px-2 py-1.5 text-sm text-foreground"
            placeholder={t('action.search')}
            placeholderTextColor={PLACEHOLDER_COLOR}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <Pressable
          onPress={() => setShowFilters(!showFilters)}
          className={`rounded-lg p-2 ${showFilters ? 'bg-primary' : 'bg-card border border-border'}`}
        >
          <SlidersHorizontal size={16} color={showFilters ? ICON_ON_PRIMARY : ICON_MUTED} />
        </Pressable>
      </View>

      {/* Filter dropdowns — Countries + Categories side by side */}
      {showFilters && (
        <View className="flex-row gap-2 border-b border-border px-4 py-3">
          <View className="flex-1">
            <DropdownPicker
              value={country ?? '__all__'}
              options={['__all__' as any, ...countries]}
              getLabel={(co) =>
                co === '__all__'
                  ? t('title.all_countries')
                  : countryName(co, l1Lang?.code ?? 'en')
              }
              onChange={(co) => setCountry(co === '__all__' ? null : co)}
            />
          </View>
          <View className="flex-1">
            <DropdownPicker
              value={category ?? '__all__'}
              options={['__all__' as any, ...categories]}
              getLabel={(cat) =>
                cat === '__all__' ? t('title.all_categories') : cat
              }
              onChange={(cat) => setCategory(cat === '__all__' ? null : cat)}
            />
          </View>
        </View>
      )}

      {/* Channel count */}
      <View className="flex-row items-center justify-between px-4 py-2">
        <Text className="text-xs text-muted-foreground">
          {filtered.length} {t('msg.channels')}
        </Text>
      </View>

      {/* Channel list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => { setSelectedChannel(item); setPlayerError(null); }}
            className={`flex-row items-center gap-3 border-b border-border px-4 py-2.5 ${selectedChannel?.id === item.id ? 'bg-primary/10' : ''}`}
          >
            {/* Logo */}
            <View className="h-10 w-14 items-center justify-center overflow-hidden rounded bg-muted">
              {item.logo ? (
                <Image source={{ uri: item.logo }} className="h-full w-full" resizeMode="contain" />
              ) : (
                <Tv size={18} color={ICON_MUTED} />
              )}
            </View>
            {/* Info */}
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                {item.name}
              </Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-xs text-muted-foreground">{item.category}</Text>
                {item.countries ? (
                  <Text className="text-xs text-muted-foreground">
                    · {item.countries.split(',').map((c) => countryName(c.trim(), l1Lang?.code ?? 'en')).join(', ')}
                  </Text>
                ) : null}
              </View>
            </View>
            {/* Signal */}
            <View className="items-end">
              <View className="flex-row items-center gap-1">
                {getSignalIcon(item)}
                {getLatencyText(item) ? (
                  <Text className="text-xs text-muted-foreground">{getLatencyText(item)}</Text>
                ) : null}
              </View>
              {!item.alive && (
                <Text className="text-xs text-muted-foreground">{t('label.offline')}</Text>
              )}
            </View>
          </Pressable>
        )}
      />
    </>
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" className="text-primary" />
      </View>
    );
  }

  if (error && channels.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">{t(error as any)}</Text>
      </View>
    );
  }

  return (
    <PageContainer maxWidth="7xl">
      <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.live_tv')}</Text>
      <OfflineFeatureNotice />
      <View className={isLg ? 'flex-row gap-6 px-4' : 'px-4'}>
        {/* Player section */}
        <View className={isLg ? 'min-w-0 flex-1' : ''}>
          {selectedChannel && (
            <LiveTVPlayer
              channel={selectedChannel}
              onError={(msg) => setPlayerError(msg)}
              containerWidth={playerWidth}
            />
          )}

          {playerError && (
            <View className="mx-4 mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              <Text className="text-xs text-destructive">{playerError}</Text>
            </View>
          )}
        </View>

        {isLg ? (
          <View className="min-h-0 shrink-0" style={{ width: asideWidth }}>
            {channelListPanel}
          </View>
        ) : (
          channelListPanel
        )}
      </View>
    </PageContainer>
  );
}
