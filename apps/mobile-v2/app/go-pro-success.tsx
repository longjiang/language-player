import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { CheckCircle } from 'lucide-react-native';
import { ICON_PRIMARY } from '@/lib/theme-colors';

export default function GoProSuccessScreen() {
  const t = useT();

  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <CheckCircle size={64} color={ICON_PRIMARY} />
      <Text className="mt-4 text-2xl font-bold text-foreground">{t('action.go_pro')}</Text>
      <Text className="mt-2 text-center text-muted-foreground">
        Your subscription has been activated successfully. Enjoy Pro features!
      </Text>
      <Pressable
        onPress={() => router.replace('/(tabs)/(media)')}
        className="mt-6 rounded-lg bg-primary px-6 py-3"
      >
        <Text className="text-sm font-bold text-primary-foreground">{t('title.explore')}</Text>
      </Pressable>
    </View>
  );
}
