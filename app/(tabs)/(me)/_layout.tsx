// app/(tabs)/(media)/_layout.tsx
import { Stack } from 'expo-router';

export default function MeLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
    </Stack>
  );
}
