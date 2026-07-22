import { Stack } from 'expo-router';

export default function MeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="saved-words" />
      <Stack.Screen name="watch-history" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
