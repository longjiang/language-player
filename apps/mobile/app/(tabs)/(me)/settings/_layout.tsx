import React from 'react';
import { Stack, Slot } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useWindowDimensions } from 'react-native';

export default function SettingsLayout() {
  const t = useT();
  const { width } = useWindowDimensions();
  const isWide = width >= 600;

  // On wide screens (iPad split view), don't use Stack navigation.
  // The index.tsx handles split-view layout directly by rendering
  // detail components inline without route changes.
  if (isWide) {
    return <Slot />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: t('title.settings') }} />
      <Stack.Screen name="display" options={{ title: t('title.display') }} />
      <Stack.Screen name="playback" options={{ title: t('title.playback') }} />
      <Stack.Screen name="speech" options={{ title: t('title.speech') }} />
      <Stack.Screen name="review" options={{ title: t('title.review') }} />
    </Stack>
  );
}
