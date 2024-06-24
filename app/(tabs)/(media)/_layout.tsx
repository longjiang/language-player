// app/(tabs)/(media)/_layout.tsx
import { Stack } from 'expo-router';

export default function MediaLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="search" options={{ headerShown: false }} />
      <Stack.Screen name="tv-shows" options={{ headerShown: false }} />
      <Stack.Screen name="watch-history" options={{ headerShown: false }} />
    </Stack>
  );
}
