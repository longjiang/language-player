import React, { useState } from 'react';
import { View, Text, Image, LayoutChangeEvent } from 'react-native';
import { Button } from '@/components/ui/button';
import { Pressable } from '@/components/ui/pressable';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Menu, X } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { e2e } from '@/lib/e2e';
import { HamburgerDrawer } from './HamburgerDrawer';
import { LanguageSwitcher } from './LanguageSwitcher';
import { UserMenu } from './UserMenu';
import { NavBar } from './NavBar';
import { SyncStatusIcon } from '@/components/sync/SyncStatusIcon';

export function Header() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { isMd, isSm } = useResponsive();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

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
            {isSm && <Text className="text-sm font-bold text-foreground">{t('title.app_name')}</Text>}
          </Pressable>

          {/* Desktop/tablet navigation — mirrors web md+ dropdowns */}
          {isMd && <NavBar />}

          {/* Spacer */}
          <View className="flex-1" />

          {/* Sync status — immediately left of Search (SPEC-053 Phase 2) */}
          <SyncStatusIcon />

          {/* Search icon */}
          <Button
            onPress={() => router.push('/(tabs)/(media)/search' as any)}
            variant="ghost"
            size="icon"
            {...e2e('header-search-button')}
          >
            <Search size={20} color={ICON_MUTED} />
          </Button>

          {/* Language switcher */}
          <LanguageSwitcher />

          {/* User menu */}
          <UserMenu />

          {/* Hamburger — phones only; md+ uses NavBar */}
          {!isMd && (
            <Button
              onPress={() => setDrawerOpen(!drawerOpen)}
              variant="ghost"
              size="icon"
              {...e2e('header-hamburger-button')}
            >
              {drawerOpen ? <X size={22} color={ICON_MUTED} /> : <Menu size={22} color={ICON_MUTED} />}
            </Button>
          )}
        </View>
      </View>

      {/* Hamburger drawer — positioned below the header (matches web's top-14 behavior) */}
      {!isMd && (
        <HamburgerDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} headerHeight={headerHeight} />
      )}
    </>
  );
}
