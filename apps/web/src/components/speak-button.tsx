'use client';

import React from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { useSpeech } from '@/hooks/use-speech';

interface SpeakButtonProps {
  /** Text to speak */
  text: string;
  /** Target language ISO code (e.g., "ja", "zh", "ko") */
  l2Code: string;
  /** Wiktionary audio filename (e.g., "Ja-よちよち.ogg") */
  audioFilename?: string | null;
  /** Visual size */
  size?: 'sm' | 'default' | 'lg';
  /** Additional class */
  className?: string;
}

/** Speak button that plays TTS or Wiktionary audio. Mirrors Classic's Speak.vue. */
export function SpeakButton({
  text,
  l2Code,
  audioFilename,
  size = 'default',
  className = '',
}: SpeakButtonProps) {
  const { speak, playAudio, isSpeaking, wiktionaryAudioUrl } = useSpeech();

  const sizeClass = {
    sm: 'h-3.5 w-3.5',
    default: 'h-4 w-4',
    lg: 'h-5 w-5',
  }[size];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioFilename) {
      playAudio(wiktionaryAudioUrl(audioFilename));
    } else {
      speak(text, l2Code);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`p-0.5 rounded transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 ${className}`}
      title={audioFilename ? 'Play pronunciation' : 'Speak'}
      aria-label="Speak"
    >
      {isSpeaking ? (
        <Loader2 className={`${sizeClass} animate-spin`} />
      ) : (
        <Volume2 className={sizeClass} />
      )}
    </button>
  );
}
