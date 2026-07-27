import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useT } from '@/hooks/use-t';
import { Settings, User, LogOut, Star, CreditCard, Download, Crown, Trash2 } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY, ICON_WARNING, ICON_DESTRUCTIVE } from '@/lib/theme-colors';

export default function MeScreen() {
  const { user, logout } = useAuth();
  const { l1Lang, l2Lang } = useLanguage();
  const { isPro, isLifetime } = useSubscription();
  const router = useRouter();
  const t = useT();

  const menuItems = [
    { icon: Settings, label: t('title.settings'), route: '/(tabs)/(me)/settings' },
    { icon: Star, label: t('title.saved_words'), route: '/(tabs)/(vocab)/saved-words' },
    { icon: Download, label: t('title.offline_dictionaries'), route: '/(tabs)/(me)/offline-dictionaries' },
    { icon: CreditCard, label: t('action.go_pro'), route: null },
    { icon: LogOut, label: t('action.logout'), route: null, action: logout },
  ];

  return (
    <ScrollView className="flex-1 bg-background px-4 py-5">
      {/* User header */}
      <View className="mb-6 items-center">
        <View className="h-16 w-16 rounded-full bg-primary/20 items-center justify-center mb-3">
          <User size={32} color={ICON_MUTED} />
        </View>
        <Text className="text-lg font-bold text-foreground">
          {user
            ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
            : t('label.guest')}
        </Text>
        {user?.email && (
          <Text className="text-sm text-muted-foreground mt-0.5">
            {user.email}
          </Text>
        )}
        <Text className="mt-0.5 text-sm text-muted-foreground">
          {l1Lang.name} → {l2Lang.name}
        </Text>
        {isPro && (
          <View className="mt-2 flex-row items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900 px-3 py-1">
            <Crown size={14} color={ICON_WARNING} />
            <Text className="text-xs font-semibold text-amber-800 dark:text-amber-200">
              {isLifetime ? `${t('subscription.lifetime_cap')} 🎉` : t('label.pro')}
            </Text>
          </View>
        )}
      </View>

      {/* Menu items */}
      <View className="rounded-xl border border-border bg-card">
        {menuItems.map((item, i) => (
          <Pressable
            key={i}
            onPress={() => {
              if (item.action) { item.action(); return; }
              if (item.route) router.push(item.route as any);
            }}
            className={`flex-row items-center gap-3 px-4 py-3 ${
              i < menuItems.length - 1 ? 'border-b border-border' : ''
            }`}
          >
            <item.icon size={20} color={ICON_MUTED} />
            <Text className="flex-1 text-sm text-foreground">{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Delete account */}
      <View className="mt-6 rounded-xl border border-border bg-card">
        <Pressable
          onPress={() => router.push('/delete-account' as any)}
          className="flex-row items-center gap-3 px-4 py-3"
        >
          <Trash2 size={20} color={ICON_DESTRUCTIVE} />
          <Text className="flex-1 text-sm text-destructive">{t('title.delete_account')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
