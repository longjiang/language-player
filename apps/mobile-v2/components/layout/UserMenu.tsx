import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/hooks/use-t';

export function UserMenu() {
  const { user, logout } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);

  const initial = user?.email?.charAt(0)?.toUpperCase() ?? '?';

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    router.replace('/login' as any);
  };

  return (
    <View className="relative">
      <Pressable
        onPress={() => setOpen(!open)}
        className="h-8 w-8 items-center justify-center rounded-full bg-primary/10"
      >
        <Text className="text-sm font-bold text-primary">{initial}</Text>
      </Pressable>

      {open && (
        <>
          <Pressable className="absolute inset-0 z-40" onPress={() => setOpen(false)} />
          <View className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-border bg-card p-1 shadow-lg">
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
                  onPress={() => { setOpen(false); /* TODO: WebView link */ }}
                >
                  <Text className="text-sm text-foreground">{t('title.docs')}</Text>
                </Pressable>
                <Pressable
                  className="rounded-md px-3 py-2 active:bg-muted"
                  onPress={() => { setOpen(false); /* TODO: WebView link */ }}
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
              <Pressable
                className="rounded-md px-3 py-2 active:bg-muted"
                onPress={() => { setOpen(false); router.push('/login' as any); }}
              >
                <Text className="text-sm font-medium text-foreground">{t('action.log_in')}</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}
