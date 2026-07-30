import React from 'react';
import { Pressable } from 'react-native';
import { useSpeech } from '@/hooks/use-speech';
import { Volume2 } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

interface SpeakButtonProps {
  text: string;
  l2Code: string;
  size?: number;
}

/**
 * TTS button for pronouncing a word aloud.
 * Matches web's SpeakButton — uses the mobile useSpeech hook (expo-speech).
 */
export function SpeakButton({ text, l2Code, size = 18 }: SpeakButtonProps) {
  const { speak } = useSpeech();

  return (
    <Pressable onPress={() => speak(text, l2Code)} hitSlop={8}>
      <Volume2 size={size} color={ICON_MUTED} />
    </Pressable>
  );
}
