import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, Image, TextInput } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { LiveTVPlayer } from '@/components/video/LiveTVPlayer';
import { Search, Wifi, WifiHigh, WifiLow, Tv, SlidersHorizontal } from 'lucide-react-native';
import type { LiveTVChannel } from '@langplayer/shared';

type SortKey = 'latency' | 'name' | 'random';

export default function LiveTvScreen() {
  const { l2Lang } = useLanguage();
  const t = useT();
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
    <View className="flex-1 bg-background">
      <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.live_tv')}</Text>
      {/* Player section */}
      {selectedChannel && (
        <LiveTVPlayer
          channel={selectedChannel}
          onError={(msg) => setPlayerError(msg)}
        />
      )}

      {playerError && (
        <View className="mx-4 mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          <Text className="text-xs text-destructive">{playerError}</Text>
        </View>
      )}

      {/* Search & filter bar */}
      <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
        <View className="flex-1 flex-row items-center rounded-lg border border-border bg-card px-2.5">
          <Search size={14} className="text-muted-foreground" />
          <TextInput
            className="flex-1 px-2 py-1.5 text-sm text-foreground"
            placeholder={t('action.search')}
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <Pressable
          onPress={() => setShowFilters(!showFilters)}
          className={`rounded-lg p-2 ${showFilters ? 'bg-primary' : 'bg-card border border-border'}`}
        >
          <SlidersHorizontal size={16} className={showFilters ? 'text-primary-foreground' : 'text-foreground'} />
        </Pressable>
      </View>

      {/* Filter pills */}
      {showFilters && (
        <View className="border-b border-border px-3 py-2">
          {/* Sort */}
          <View className="mb-2 flex-row items-center gap-2">
            <Text className="text-xs text-muted-foreground">Sort:</Text>
            {(['latency', 'name', 'random'] as SortKey[]).map((key) => (
              <Pressable
                key={key}
                onPress={() => setSortBy(key)}
                className={`rounded-full px-2.5 py-0.5 ${sortBy === key ? 'bg-primary' : 'bg-muted'}`}
              >
                <Text className={`text-xs ${sortBy === key ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                  {key === 'latency' ? 'Speed' : key === 'name' ? 'A-Z' : 'Random'}
                </Text>
              </Pressable>
            ))}
          </View>
          {/* Categories */}
          <View className="mb-2 flex-row flex-wrap gap-1">
            <Pressable
              onPress={() => setCategory(null)}
              className={`rounded-full px-2.5 py-0.5 ${!category ? 'bg-primary' : 'bg-muted'}`}
            >
              <Text className={`text-xs ${!category ? 'text-primary-foreground' : 'text-muted-foreground'}`}>All</Text>
            </Pressable>
            {categories.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setCategory(cat)}
                className={`rounded-full px-2.5 py-0.5 ${category === cat ? 'bg-primary' : 'bg-muted'}`}
              >
                <Text className={`text-xs ${category === cat ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{cat}</Text>
              </Pressable>
            ))}
          </View>
          {/* Countries */}
          {countries.length > 1 && (
            <View className="flex-row flex-wrap gap-1">
              <Pressable
                onPress={() => setCountry(null)}
                className={`rounded-full px-2.5 py-0.5 ${!country ? 'bg-primary' : 'bg-muted'}`}
              >
                <Text className={`text-xs ${!country ? 'text-primary-foreground' : 'text-muted-foreground'}`}>All Countries</Text>
              </Pressable>
              {countries.slice(0, 15).map((co) => (
                <Pressable
                  key={co}
                  onPress={() => setCountry(co)}
                  className={`rounded-full px-2.5 py-0.5 ${country === co ? 'bg-primary' : 'bg-muted'}`}
                >
                  <Text className={`text-xs ${country === co ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{co}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Channel count */}
      <View className="flex-row items-center justify-between px-4 py-2">
        <Text className="text-xs text-muted-foreground">
          {filtered.length} channels
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
                <Tv size={18} className="text-muted-foreground" />
              )}
            </View>
            {/* Info */}
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                {item.name}
              </Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-xs text-muted-foreground">{item.category}</Text>
                {item.countries ? <Text className="text-xs text-muted-foreground">· {item.countries}</Text> : null}
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
                <Text className="text-xs text-muted-foreground">Offline</Text>
              )}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
