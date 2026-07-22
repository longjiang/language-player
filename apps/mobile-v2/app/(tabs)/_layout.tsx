import { Tabs } from 'expo-router';
import { useT } from '@/hooks/use-t';

export default function TabLayout() {
  const t = useT();

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="(media)"
        options={{
          title: t('nav.media'),
          tabBarLabel: t('nav.media'),
        }}
      />
      <Tabs.Screen
        name="(dictionary)"
        options={{
          title: t('title.dictionary'),
          tabBarLabel: t('title.dictionary'),
        }}
      />
      <Tabs.Screen
        name="(me)"
        options={{
          title: t('tab.me'),
          tabBarLabel: t('tab.me'),
        }}
      />
    </Tabs>
  );
}
