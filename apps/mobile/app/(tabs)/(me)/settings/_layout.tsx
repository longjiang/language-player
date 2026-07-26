import React, { useState, useEffect, useRef } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { Stack, Slot } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useColorScheme } from 'nativewind';
import { useSettingsContext } from '@/contexts/SettingsContext';

export default function SettingsLayout() {
  const t = useT();
  const { width } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const { settings } = useSettingsContext();
  const isWide = width >= 600;

  const isDark = colorScheme === 'dark';
  const headerStyle = {
    backgroundColor: isDark ? 'hsl(230 30% 8%)' : 'hsl(0 0% 100%)',
  };
  const headerTintColor = isDark ? 'hsl(0 0% 95%)' : 'hsl(222 47% 11%)';

  // G3: Debounced "Settings saved" confirmation (visible on all settings screens)
  const [savedVisible, setSavedVisible] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSavedVisible(true);
      setTimeout(() => setSavedVisible(false), 2000);
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [settings]);

  // On wide screens (iPad split view), don't use Stack navigation.
  // The index.tsx handles split-view layout directly by rendering
  // detail components inline without route changes.
  if (isWide) {
    return (
      <View className="flex-1">
        <Slot />
        {savedVisible && (
          <View className="absolute top-4 right-4 bg-primary/90 px-3 py-1.5 rounded-full z-50">
            <Text className="text-xs font-medium text-primary-foreground">
              ✓ {t('msg.settings_saved')}
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1">
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
      {savedVisible && (
        <View className="absolute top-4 right-4 bg-primary/90 px-3 py-1.5 rounded-full z-50">
          <Text className="text-xs font-medium text-primary-foreground">
            ✓ {t('msg.settings_saved')}
          </Text>
        </View>
      )}
    </View>
  );
}
