// app/(tabs)/(media)/_layout.tsx
import { Stack } from 'expo-router';

export default function MeLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="saved-words" options={{ headerShown: false }} />
      <Stack.Screen name="watch-history" options={{ headerShown: false }} />
      <Stack.Screen name="test/tokenizer" options={{ headerShown: false }} />
      <Stack.Screen name="test/playlist" options={{ headerShown: false }} />
    </Stack>
  );
}
