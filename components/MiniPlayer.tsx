// @/app/components/MiniPlayer.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { VideoWithTranscript } from '@/components/VideoWithTranscript';

export const MiniPlayer = () => {
  const { closePlayer, maximizePlayer, videoPlayerState } = useVideoPlayer();
  // Only render the component if youtubeId is truthy and isMini is true
  if (!videoPlayerState.youtubeId || !videoPlayerState.isMini) {
    return null; // Or any other fallback UI
  }
  return (
    <SafeAreaView style={{position: 'absolute', top: 0, backgroundColor: 'white', width: '100%'}}>
      <View style={styles.container}>
        <VideoWithTranscript youtubeId={videoPlayerState.youtubeId} key={`video-player-${videoPlayerState.youtubeId}`} />
        
        {/* Display JSON form of videoPlayerState for debugging */}
        <Text style={styles.debugText}>{JSON.stringify(videoPlayerState, null, 2)}</Text>
        
        <TouchableOpacity
          style={styles.button}
          onPress={maximizePlayer}
        >
          <Text style={styles.buttonText}>Maximize Player</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={closePlayer}
        >
          <Text style={styles.buttonText}>Close Player</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 26,
  },
  text: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  debugText: {
    marginTop: 10,
    marginBottom: 10,
    color: 'gray', // Makes the debug text less prominent
  },
  button: {
    marginTop: 10,
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
  },
  buttonText: {
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
});