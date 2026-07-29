import { Stack } from 'expo-router';

export default function MeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName="tokenizer-test">
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="about" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="tokenizer-test" />
      <Stack.Screen name="docs" />
      <Stack.Screen name="go-pro" />
      <Stack.Screen name="offline-dictionaries" />
    </Stack>
  );
}
