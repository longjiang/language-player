import React, { useState, useCallback } from 'react';
import { Text, Platform } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { Pressable } from '@/components/ui/pressable';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSyncStatus } from '@/contexts/SyncStatusContext';
import { useT } from '@/hooks/use-t';
import { confirmLogoutIfOffline } from '@/lib/logout-guard';
import { ICON_PRIMARY } from '@/lib/theme-colors';
import { e2e } from '@/lib/e2e';
import { AboutDialog } from '@/components/about/AboutDialog';

export function UserMenu() {
  const { user, logout } = useAuth();
  const { status } = useSyncStatus();
  const t = useT();
  const [aboutOpen, setAboutOpen] = useState(false);

  const initial = user?.email?.charAt(0)?.toUpperCase() ?? '?';
  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
    : null;

  const handleLogout = useCallback(() => {
    confirmLogoutIfOffline(t, status.effectiveOffline, () => {
      void logout().then(() => router.replace('/login' as any));
    });
  }, [t, status.effectiveOffline, logout]);

  const handleAction = useCallback(
    (event: string) => {
      switch (event) {
        case 'profile':
          router.push('/(tabs)/(me)/profile' as any);
          break;
        case 'settings':
          router.push('/settings' as any);
          break;
        case 'history':
          router.push('/(tabs)/(media)/watch-history' as any);
          break;
        case 'playlists':
          router.push('/(tabs)/(me)/playlists' as any);
          break;
        case 'liked':
          router.push('/(tabs)/(me)/liked-videos' as any);
          break;
        case 'channels':
          router.push('/(tabs)/(media)/my-channels' as any);
          break;
        case 'saved-words':
          router.push('/(tabs)/(vocab)/saved-words' as any);
          break;
        case 'docs':
          router.push('/(tabs)/(me)/docs' as any);
          break;
        case 'about':
          setAboutOpen(true);
          break;
        case 'login':
          router.push('/login' as any);
          break;
        case 'logout':
          handleLogout();
          break;
      }
    },
    [handleLogout],
  );

  // Native UIMenu/PopupMenu. `imageColor` must be set or New-Arch iOS 26 tints
  // SF Symbols transparent (react-native-menu#1034/#1200).
  const sf = (name: string) => (Platform.OS === 'ios' ? name : undefined);
  const item = (
    id: string,
    title: string,
    symbol: string,
    destructive = false,
  ) => ({
    id,
    title,
    image: sf(symbol),
    imageColor: ICON_PRIMARY,
    ...(destructive ? { attributes: { destructive: true } } : {}),
  });

  const loggedInItems = [
    item('profile', displayName ?? t('title.profile'), 'person.crop.circle'),
    item('settings', t('title.settings'), 'gearshape'),
    item('history', t('title.watch_history'), 'clock'),
    item('playlists', t('title.playlists'), 'list.bullet'),
    item('liked', t('title.liked_videos'), 'heart'),
    item('channels', t('title.my_channels'), 'tv'),
    item('saved-words', t('title.saved_words'), 'bookmark'),
    item('docs', t('title.docs'), 'book'),
    item('about', t('title.about'), 'info.circle'),
    item('logout', t('action.log_out'), 'arrow.right.square', true),
  ];
  const loggedOutItems = [
    item('login', t('action.log_in'), 'person.crop.circle.badge.check'),
    item('docs', t('title.docs'), 'book'),
    item('history', t('title.watch_history'), 'clock'),
    item('playlists', t('title.playlists'), 'list.bullet'),
    item('liked', t('title.liked_videos'), 'heart'),
    item('channels', t('title.my_channels'), 'tv'),
    item('saved-words', t('title.saved_words'), 'bookmark'),
    item('about', t('title.about'), 'info.circle'),
  ];

  return (
    <>
      <MenuView
        onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event)}
        actions={user ? loggedInItems : loggedOutItems}
      >
        <Pressable
          className="h-8 w-8 items-center justify-center rounded-full bg-primary/10"
          accessibilityRole="button"
          {...e2e('header-user-menu')}
        >
          <Text className="text-sm font-bold text-primary">{initial}</Text>
        </Pressable>
      </MenuView>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
}
