import React, { useState } from 'react';
import { View, Text, Pressable, Image, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Menu, X } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { HamburgerDrawer } from './HamburgerDrawer';
import { LanguageSwitcher } from './LanguageSwitcher';
import { UserMenu } from './UserMenu';

/** Matches Next.js sm: breakpoint (640px). */
const SM_BREAKPOINT = 640;

export function Header() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const showAppName = screenWidth >= SM_BREAKPOINT;

  return (
    <>
      <View
        className="z-50 border-b border-border bg-background px-4 pb-2"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center gap-3">
          {/* Logo — matches Next.js header.tsx */}
          <Pressable
            onPress={() => router.push('/(tabs)/(media)' as any)}
            className="flex-row items-center gap-2"
          >
            <Image
              source={require('@/assets/logo.png')}
              className="h-7 w-7"
              resizeMode="contain"
            />
            {showAppName && (
              <Text className="text-sm font-bold text-foreground">{t('title.app_name')}</Text>
            )}
          </Pressable>

          {/* Spacer */}
          <View className="flex-1" />

          {/* Search icon */}
          <Pressable
            onPress={() => router.push('/(tabs)/(media)/search' as any)}
            className="rounded-lg p-2 active:bg-muted"
          >
            <Search size={20} color="#94a3b8" />
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
            {drawerOpen ? <X size={22} color="#94a3b8" /> : <Menu size={22} color="#94a3b8" />}
          </Pressable>
        </View>
      </View>

      {/* Hamburger drawer */}
      <HamburgerDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
