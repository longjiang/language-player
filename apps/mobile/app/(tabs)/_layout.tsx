import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBarIcon } from '@/components/navigation/TabBarIcon';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Typography } from '@/constants/Typography';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const activeColor = Colors[colorScheme ?? 'light'].primaryLink;
  const tabBackgroundColor = Colors[colorScheme ?? 'light'].secondaryBackground;
  const t = useT();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor,
        tabBarStyle: {
          backgroundColor: tabBackgroundColor,
          paddingTop: insets.bottom ? insets.bottom - 14 : 10,
          height: 70 + insets.bottom, // Add the safe area inset to the height
          paddingBottom: insets.bottom ? insets.bottom : 10,
        },
        tabBarIconStyle: {
          marginBottom: 2,
        },
        tabBarLabelStyle: {
          fontSize: Typography.fontSize.xsmall,
          fontWeight: 'bold',
          marginTop: 2,
        },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="(media)"
        options={{
          title: t('nav.media'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'movie' : 'movie-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(dictionary)"
        options={{
          title: t('title.dictionary'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'book' : 'book-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(me)"
        options={{
          title: t('tab.me'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'account' : 'account-outline'} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
