import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useT } from '@/hooks/use-t';

export default function WatchHistoryScreen() {
  const { l2Lang } = useLanguage();
  const t = useT();

  return (
    <View className="flex-1 bg-background">
      <Text className="px-4 py-3 text-lg font-bold text-foreground">{t('title.watch_history')}</Text>
      <View className="flex-1 items-center justify-center">
        <Text className="text-muted-foreground">{t('msg.all_done_for_now')}</Text>
      </View>
    </View>
  );
}
