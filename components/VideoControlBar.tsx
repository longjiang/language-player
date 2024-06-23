// @/components/VideoControlBar.tsx
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedButton } from './ThemedButton'; // Assuming you have this component
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicon from 'react-native-vector-icons/Ionicons';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Swatches } from '@/constants/Swatches';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";

export const VideoControlBar = () => {
  const primaryBrandColor = useThemeColor({}, 'primaryBrand')
  const { updatePlayVideo, playVideo } = useVideoWithTranscriptContext()

  return (
    <View style={styles.container}>
      <View style={styles.progressBarContainer}>
        <View />
          <LinearGradient
            colors={[Swatches.primary[700], Swatches.primary[400]]} // Colors for the gradient
            start={{x: 0, y: 0}} // Starting point of the gradient
            end={{x: 1, y: 0}} // Ending point of the gradient
            style={styles.progressBar}
          />
      </View>
      <View style={styles.controls}>
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="information" />}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="skip-previous" />}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="arrow-left" />}
        />
        <TouchableOpacity>
          <Ionicon name={playVideo ? "pause" : "play"} size={51} style={{ color: primaryBrandColor }} onPress={() => updatePlayVideo(!playVideo) } />
        </TouchableOpacity>
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="arrow-right" />}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="skip-next" />}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="fullscreen" />}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  progressBarContainer: {
    width: '100%',
    height: 10,
    backgroundColor: Swatches.neutral[500], // Light grey background for the progress bar container
    borderRadius: 5,
  },
  progressBar: {
    height: '100%',
    width: '50%', // Example progress: 50%
    borderRadius: 5,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    marginTop: 10,
  },
});