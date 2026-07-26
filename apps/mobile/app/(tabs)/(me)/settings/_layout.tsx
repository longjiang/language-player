import React from 'react';
import { Stack, Slot } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useWindowDimensions } from 'react-native';
import { useColorScheme } from 'nativewind';

export default function SettingsLayout() {
  const t = useT();
  const { width } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isWide = width >= 600;

  const isDark = colorScheme === 'dark';
  const headerStyle = {
    backgroundColor: isDark ? 'hsl(230 30% 8%)' : 'hsl(0 0% 100%)',
  };
  const headerTintColor = isDark ? 'hsl(0 0% 95%)' : 'hsl(222 47% 11%)';

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
        headerStyle,
        headerTintColor,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: t('title.settings') }} />
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
