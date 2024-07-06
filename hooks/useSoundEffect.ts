// @/hooks/useSoundEffect.ts
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';

/**
 * Custom hook to handle sound effects in the app.
 * Currently, it only plays a sound on iOS devices.
 */
export const useSoundEffect = () => {
  useEffect(() => {
    const soundObject = new Audio.Sound();

    const enableSound = async () => {
      if (Platform.OS === 'ios') {
        try {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
          });
          await soundObject.loadAsync(require('@/assets/soundFile.mp3'));
          await soundObject.playAsync();
        } catch (error) {
          console.error('Error playing sound:', error);
        }
      }
    };

    enableSound();

    // Cleanup function
    return () => {
      soundObject.unloadAsync();
    };
  }, []);
};