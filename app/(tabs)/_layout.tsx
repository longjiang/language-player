import { Tabs } from 'expo-router';
import React from 'react';
import { DictionaryProvider } from '@/contexts/DictionaryContext';

import { TabBarIcon } from '@/components/navigation/TabBarIcon';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Typography } from '@/constants/Typography';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const activeColor = Colors[colorScheme ?? 'light'].primaryLink;
  const tabBackgroundColor = Colors[colorScheme ?? 'light'].secondaryBackground;

  return (
    <DictionaryProvider>
      <Tabs
        
        screenOptions={{
          tabBarActiveTintColor: activeColor,
          tabBarStyle: { backgroundColor: tabBackgroundColor, paddingTop: 12, height:100},
            tabBarLabelStyle: {
            fontSize: Typography.fontSize.xsmall,
            fontWeight: "bold",
          },
          headerShown: false,
        }}>
        <Tabs.Screen
          name="(media)"
          options={{
            title: 'Media',
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name={focused ? 'movie' : 'movie-outline'} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="(dictionary)"
          options={{
            title: 'Dictionary',
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name={focused ? 'book' : 'book-outline'} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="(me)"
          options={{
            title: 'Me',
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name={focused ? 'account' : 'account-outline'} color={color} />
            ),
          }}
        />
      </Tabs>
    </DictionaryProvider>
  );
}
