import { Stack } from 'expo-router';
import { Header } from '@/components/layout/Header';

export default function TabLayout() {
  return (
    <>
      <Header />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(media)" />
        <Stack.Screen name="(reading)" />
        <Stack.Screen name="(vocab)" />
      </Stack>
    </>
  );
}
