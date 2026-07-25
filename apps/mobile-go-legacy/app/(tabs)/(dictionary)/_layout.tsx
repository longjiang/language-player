// app/(tabs)/(media)/_layout.tsx
import { Stack } from 'expo-router';

export default function DictionaryLayout() {
  return (
    <Stack>
      <Stack.Screen name="dictionary/index" options={{ headerShown: false }} />
      <Stack.Screen name="dictionary/word/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
