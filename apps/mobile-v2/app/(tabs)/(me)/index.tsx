import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { Settings, User, LogOut, Star, CreditCard } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

export default function MeScreen() {
  const { user, logout } = useAuth();
  const { l1Lang, l2Lang } = useLanguage();
  const router = useRouter();
  const t = useT();

  const menuItems = [
    { icon: Settings, label: t('title.settings'), route: '/(tabs)/(me)/settings' },
    { icon: Star, label: t('title.saved_words'), route: '/(tabs)/(vocab)/saved-words' },
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
          {user?.email ?? t('label.guest')}
        </Text>
        <Text className="mt-0.5 text-sm text-muted-foreground">
          {l1Lang.name} → {l2Lang.name}
        </Text>
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
    </ScrollView>
  );
}
