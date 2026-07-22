import { Stack } from 'expo-router';

export default function ReadingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="reader" />
      <Stack.Screen name="web-reader" />
      <Stack.Screen name="epub" />
    </Stack>
  );
}
