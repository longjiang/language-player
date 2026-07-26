import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/hooks/use-t';
import * as Dialog from '@/components/ui/dialog';
import { useAnimatedBoolean } from '@/lib/animations';

export function UserMenu() {
  const { user, logout } = useAuth();
  const t = useT();
  const [open, setOpen] = useAnimatedBoolean();

  const initial = user?.email?.charAt(0)?.toUpperCase() ?? '?';

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
        <Dialog.Overlay closeOnPress />
        <Dialog.Content className="w-64 p-1">
          {user ? (
            <>
              {/* User info header */}
              <View className="border-b border-border px-3 py-2">
                <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                  {user.email}
                </Text>
              </View>
              <Pressable
                className="rounded-md px-3 py-2 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/settings' as any); }}
              >
                <Text className="text-sm text-foreground">{t('title.settings')}</Text>
              </Pressable>
              <Pressable
                className="rounded-md px-3 py-2 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/(tabs)/(me)/docs' as any); }}
              >
                <Text className="text-sm text-foreground">{t('title.docs')}</Text>
              </Pressable>
              <Pressable
                className="rounded-md px-3 py-2 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/(tabs)/(me)/about' as any); }}
              >
                <Text className="text-sm text-foreground">{t('title.about')}</Text>
              </Pressable>
              <Pressable
                className="rounded-md px-3 py-2 active:bg-destructive/10"
                onPress={handleLogout}
              >
                <Text className="text-sm text-destructive">{t('action.log_out')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                className="rounded-md px-3 py-2 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/login' as any); }}
              >
                <Text className="text-sm font-medium text-foreground">{t('action.log_in')}</Text>
              </Pressable>
              <Pressable
                className="rounded-md px-3 py-2 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/(tabs)/(me)/docs' as any); }}
              >
                <Text className="text-sm text-foreground">{t('title.docs')}</Text>
              </Pressable>
              <Pressable
                className="rounded-md px-3 py-2 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/(tabs)/(me)/about' as any); }}
              >
                <Text className="text-sm text-foreground">{t('title.about')}</Text>
              </Pressable>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
