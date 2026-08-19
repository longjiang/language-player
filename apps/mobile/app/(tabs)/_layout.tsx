import { Stack } from 'expo-router';
import { Header } from '@/components/layout/Header';
import { ReaderChromeProvider } from '@/contexts/ReaderChromeContext';

export default function TabLayout() {
  return (
    <ReaderChromeProvider>
      <Header />
      <Stack
        screenOptions={{ headerShown: false }}
        initialRouteName="(media)"
      >
        <Stack.Screen name="(media)" />
        <Stack.Screen name="(reading)" />
        <Stack.Screen name="(vocab)" />
        <Stack.Screen name="(me)" />
      </Stack>
    </ReaderChromeProvider>
  );
}
