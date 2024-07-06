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
    let soundObject: Audio.Sound | null = null;

    const enableSound = async () => {
      if (Platform.OS === 'ios') {
        try {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
          });

          soundObject = new Audio.Sound();
          await soundObject.loadAsync(require('@/assets/soundFile.mp3'));
          
          // Check if the sound was loaded successfully
          const status = await soundObject.getStatusAsync();
          if (status.isLoaded) {
            await soundObject.playAsync();
          } else {
            console.warn('Sound file not loaded properly');
          }
        } catch (error) {
          console.error('Error setting up or playing sound:', error);
          // Attempt to release the audio resources
          if (soundObject) {
            try {
              await soundObject.unloadAsync();
            } catch (unloadError) {
              console.error('Error unloading sound:', unloadError);
            }
          }
        }
      }
    };

    enableSound();

    // Cleanup function
    return () => {
      if (soundObject) {
        soundObject.unloadAsync().catch(error => {
          console.error('Error unloading sound in cleanup:', error);
        });
      }
    };
  }, []);
};