import { Stack } from 'expo-router';

export default function MediaLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="music" />
      <Stack.Screen name="live-tv" />
      <Stack.Screen name="tv-shows" />
      <Stack.Screen name="watch-history" />
      <Stack.Screen name="local-media" />
      <Stack.Screen name="search" />
      <Stack.Screen name="watch/[videoId]" />
      <Stack.Screen name="channel/[channelId]" />
    </Stack>
  );
}
