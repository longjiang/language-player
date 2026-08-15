import { Stack } from 'expo-router';

export default function MeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName="index">
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="tokenizer-test" />
      <Stack.Screen name="docs" />
      <Stack.Screen name="go-pro" />
      <Stack.Screen name="offline-dictionaries" />
      <Stack.Screen name="liked-videos" />
      <Stack.Screen name="playlists/index" />
      <Stack.Screen name="playlists/[playlistId]" />
    </Stack>
  );
}
