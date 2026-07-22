import { Stack } from 'expo-router';

export default function VocabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="saved-words" />
      <Stack.Screen name="review" />
      <Stack.Screen name="word/[entryId]" />
    </Stack>
  );
}
