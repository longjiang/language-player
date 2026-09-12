import { Stack } from 'expo-router';

export default function VocabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="saved-words" />
      <Stack.Screen name="review" />
      <Stack.Screen name="word/[entryId]" />
      {/* Study → Tasks (SPEC-095). */}
      <Stack.Screen name="tasks/index" />
      <Stack.Screen name="tasks/[bookId]/index" />
      <Stack.Screen name="tasks/[bookId]/[unitId]/[lessonId]/[taskId]" />
    </Stack>
  );
}
