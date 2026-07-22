import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/hooks/use-t';
import { HamburgerDrawer } from './HamburgerDrawer';
import { LanguageSwitcher } from './LanguageSwitcher';
import { UserMenu } from './UserMenu';

export function Header() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <View
        className="z-50 border-b border-border bg-background px-4 pb-2"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center gap-3">
          {/* Logo + app name — tapping goes to explore (home) */}
          <Pressable
            onPress={() => router.push('/(tabs)/(media)' as any)}
            className="flex-row items-center gap-1.5"
          >
            <View className="h-6 w-6 items-center justify-center rounded bg-primary">
              <Text className="text-xs font-bold text-primary-foreground">LP</Text>
            </View>
            <Text className="text-sm font-bold text-foreground">{t('title.app_name')}</Text>
          </Pressable>

          {/* Spacer */}
          <View className="flex-1" />

          {/* Search icon */}
          <Pressable
            onPress={() => router.push('/(tabs)/(media)/search' as any)}
            className="rounded-lg p-2 active:bg-muted"
          >
            <Text className="text-base text-muted-foreground">🔍</Text>
          </Pressable>

          {/* Language switcher */}
          <LanguageSwitcher />

          {/* User menu */}
          <UserMenu />

          {/* Hamburger */}
          <Pressable
            onPress={() => setDrawerOpen(!drawerOpen)}
            className="rounded-lg p-1.5 active:bg-muted"
          >
            <Text className="text-lg text-muted-foreground">{drawerOpen ? '✕' : '☰'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Hamburger drawer */}
      <HamburgerDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
