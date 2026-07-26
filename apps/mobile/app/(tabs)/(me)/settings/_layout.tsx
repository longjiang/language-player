import React from 'react';
import { Stack, Slot } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useWindowDimensions } from 'react-native';

const HEADER_STYLE = {
  backgroundColor: 'hsl(240 10% 3.9%)', // bg-background in dark
};

const HEADER_TINT = 'hsl(0 0% 98%)'; // text-foreground in dark (near-white)

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
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: HEADER_STYLE,
        headerTintColor: HEADER_TINT,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="display"
        options={{ headerShown: true, title: t('title.display') }}
      />
      <Stack.Screen
        name="playback"
        options={{ headerShown: true, title: t('title.playback') }}
      />
      <Stack.Screen
        name="speech"
        options={{ headerShown: true, title: t('title.speech') }}
      />
      <Stack.Screen
        name="review"
        options={{ headerShown: true, title: t('title.review') }}
      />
    </Stack>
  );
}
