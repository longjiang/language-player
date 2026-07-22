import React from 'react';
import { View, Text } from 'react-native';
import { useT } from '@/hooks/use-t';

export default function LocalMediaScreen() {
  const t = useT();
  return (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <Text className="text-xl font-bold text-foreground">{t('title.local_media')}</Text>
      <Text className="mt-2 text-muted-foreground">{t('msg.all_done_for_now')}</Text>
    </View>
  );
}
