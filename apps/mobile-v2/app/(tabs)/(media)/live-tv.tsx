import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';

interface LiveChannel {
  id: number; name: string; logo: string; url: string;
  category: string; countries: string;
}

export default function LiveTvScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${PYTHON_API_URL}/live-tv/channels?l2=${l2Lang.code}&sort=latency&limit=200`)
      .then((r) => r.json())
      .then((data) => setChannels(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [l2Lang.code]);

  const categories = [...new Set(channels.map((c) => c.category).filter(Boolean))];
  const filtered = category ? channels.filter((c) => c.category === category) : channels;

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator size="large" className="text-primary" /></View>;
  }

  return (
    <View className="flex-1 bg-background">
      <Text className="px-4 py-3 text-lg font-bold text-foreground">{t('title.live_tv')}</Text>
      <View className="flex-row flex-wrap gap-1 px-4 pb-2">
        <Pressable onPress={() => setCategory(null)} className={`rounded-full px-2.5 py-1 ${!category ? 'bg-primary' : 'bg-muted'}`}>
          <Text className={`text-xs ${!category ? 'text-primary-foreground' : 'text-muted-foreground'}`}>All</Text>
        </Pressable>
        {categories.map((cat) => (
          <Pressable key={cat} onPress={() => setCategory(cat)} className={`rounded-full px-2.5 py-1 ${category === cat ? 'bg-primary' : 'bg-muted'}`}>
            <Text className={`text-xs ${category === cat ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{cat}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <Pressable className="flex-row items-center gap-3 border-b border-border px-4 py-3">
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">{item.name}</Text>
              <Text className="text-xs text-muted-foreground">{item.category} · {item.countries}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
