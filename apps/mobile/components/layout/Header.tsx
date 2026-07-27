import React, { useState } from 'react';
import { View, Text, Pressable, Image, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Menu, X } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { e2e } from '@/lib/e2e';
import { HamburgerDrawer } from './HamburgerDrawer';
import { LanguageSwitcher } from './LanguageSwitcher';
import { UserMenu } from './UserMenu';
import { SM_BREAKPOINT } from '@/lib/constants';

export function Header() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  const showAppName = screenWidth >= SM_BREAKPOINT;

  return (
    <>
      <View
        className="z-50 border-b border-border bg-background px-4 pb-2"
        style={{ paddingTop: insets.top + 8 }}
        onLayout={(e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <View className="flex-row items-center gap-1.5">
          {/* Logo — matches Next.js header.tsx */}
          <Pressable
            onPress={() => router.push('/(tabs)/(media)' as any)}
            className="flex-row items-center gap-2"
            {...e2e('header-logo')}
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
            className="rounded-lg p-1 active:bg-muted"
            {...e2e('header-search-button')}
          >
            <Search size={20} color={ICON_MUTED} />
          </Pressable>

          {/* Language switcher */}
          <LanguageSwitcher />

          {/* User menu */}
          <UserMenu />

          {/* Hamburger */}
          <Pressable
            onPress={() => setDrawerOpen(!drawerOpen)}
            className="rounded-lg p-1.5 active:bg-muted"
            {...e2e('header-hamburger-button')}
          >
            {drawerOpen ? <X size={22} color={ICON_MUTED} /> : <Menu size={22} color={ICON_MUTED} />}
          </Pressable>
        </View>
      </View>

      {/* Hamburger drawer — positioned below the header (matches web's top-14 behavior) */}
      <HamburgerDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} headerHeight={headerHeight} />
    </>
  );
}
