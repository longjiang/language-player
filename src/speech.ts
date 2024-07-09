// @/src/speech.ts

import * as Speech from 'expo-speech';

export const speakText = async (text: string, language: string) => {
  try {
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) {
      Speech.stop();
    }
    Speech.speak(text, {
      language,
      onError: (error) => {
        console.error('Speech error occurred:', error);
        alert('An error occurred while trying to speak the text.');
      },
    });
  } catch (error) {
    console.error('Error checking speech status:', error);
    alert('An error occurred while trying to speak the text.');
  }
};
