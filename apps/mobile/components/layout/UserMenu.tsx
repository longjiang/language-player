import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/hooks/use-t';
import * as Dialog from '@/components/ui/dialog';
import { useAnimatedBoolean } from '@/lib/animations';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Settings, BookOpen, Info, LogOut, LogIn } from 'lucide-react-native';
import { ICON_MUTED, ICON_DESTRUCTIVE } from '@/lib/theme-colors';

export function UserMenu() {
  const { user, logout } = useAuth();
  const t = useT();
  const [open, setOpen] = useAnimatedBoolean();
  const insets = useSafeAreaInsets();

  const initial = user?.email?.charAt(0)?.toUpperCase() ?? '?';
  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
    : null;

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    router.replace('/login' as any);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="h-8 w-8 items-center justify-center rounded-full bg-primary/10">
        <Text className="text-sm font-bold text-primary">{initial}</Text>
      </Dialog.Trigger>

      <Dialog.Portal>
        {/* Overlay for dismiss on outside tap */}
        <Dialog.Overlay closeOnPress />
        {/* Dropdown positioned below header, right-aligned */}
        <View
          className="absolute right-2 min-w-56 rounded-xl border border-border bg-card shadow-lg p-1 z-50"
          style={{ top: insets.top + 52 }}
        >
          {user ? (
            <>
              {/* User info header — tap to go to profile */}
              <Pressable
                className="border-b border-border px-3 py-2.5 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/(tabs)/(me)/profile' as any); }}
              >
                <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                  {displayName}
                </Text>
                <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                  {user.email}
                </Text>
              </Pressable>
              <Pressable
                className="flex-row items-center gap-2.5 rounded-md px-3 py-2.5 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/settings' as any); }}
              >
                <Settings size={16} color={ICON_MUTED} />
                <Text className="text-sm text-foreground">{t('title.settings')}</Text>
              </Pressable>
              <Pressable
                className="flex-row items-center gap-2.5 rounded-md px-3 py-2.5 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/(tabs)/(me)/docs' as any); }}
              >
                <BookOpen size={16} color={ICON_MUTED} />
                <Text className="text-sm text-foreground">{t('title.docs')}</Text>
              </Pressable>
              <Pressable
                className="flex-row items-center gap-2.5 rounded-md px-3 py-2.5 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/(tabs)/(me)/about' as any); }}
              >
                <Info size={16} color={ICON_MUTED} />
                <Text className="text-sm text-foreground">{t('title.about')}</Text>
              </Pressable>
              <Pressable
                className="flex-row items-center gap-2.5 rounded-md px-3 py-2.5 active:bg-destructive/10"
                onPress={handleLogout}
              >
                <LogOut size={16} color={ICON_DESTRUCTIVE} />
                <Text className="text-sm text-destructive">{t('action.log_out')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                className="flex-row items-center gap-2.5 rounded-md px-3 py-2.5 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/login' as any); }}
              >
                <LogIn size={16} color={ICON_MUTED} />
                <Text className="text-sm font-medium text-foreground">{t('action.log_in')}</Text>
              </Pressable>
              <Pressable
                className="flex-row items-center gap-2.5 rounded-md px-3 py-2.5 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/(tabs)/(me)/docs' as any); }}
              >
                <BookOpen size={16} color={ICON_MUTED} />
                <Text className="text-sm text-foreground">{t('title.docs')}</Text>
              </Pressable>
              <Pressable
                className="flex-row items-center gap-2.5 rounded-md px-3 py-2.5 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/(tabs)/(me)/about' as any); }}
              >
                <Info size={16} color={ICON_MUTED} />
                <Text className="text-sm text-foreground">{t('title.about')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
