// @/app/components/MiniPlayer.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { VideoWithTranscript } from '@/components/VideoWithTranscript';
import video from "@/data/video.json";
import { useThemeColor } from '@/hooks/useThemeColor';

export const MiniPlayer = () => {
  const secondaryBackgroundColor = useThemeColor({}, "secondaryBackground");

  const { closePlayer, maximizePlayer, videoPlayerState } = useVideoPlayer();
  // Only render the component if youtubeId is truthy and isMini is true
  if (!videoPlayerState.youtubeId || !videoPlayerState.isMini) {
    return null; // Or any other fallback UI
  }
  return (
    <SafeAreaView style={{position: 'absolute', bottom: 0, backgroundColor: secondaryBackgroundColor, width: '100%'}}>
      <View style={styles.container}>
        <VideoWithTranscript video={video} key={`video-player-${video.youtube_id}`} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {

  },
  text: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});