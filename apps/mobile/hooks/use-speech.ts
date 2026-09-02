import { useCallback, useState } from 'react';
import * as Speech from 'expo-speech';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { log } from '@/lib/logger';
import { SPEECH_DEFAULTS } from '@langplayer/shared';

/**
 * TTS via expo-speech.
 *
 * Speech settings (voiceURI, rate) are read per-L2 from the unified
 * settings_v2 store (`l2[code].speech`) — the same values the Settings →
 * Speech page writes via `updateL2` (ARCH-011, SPEC-015). The legacy
 * `zthSpeechSettings` SecureStore key is no longer read or written.
 */
export function useSpeech() {
  const { getL2, loaded } = useSettingsContext();
  const { l2Lang } = useLanguage();
  const [isSpeaking, setIsSpeaking] = useState(false);

  const l2Settings = loaded ? getL2(l2Lang.code) : null;
  const speech = l2Settings?.speech ?? SPEECH_DEFAULTS;
  const voiceURI = speech.voiceURI;
  const rate = speech.rate ?? SPEECH_DEFAULTS.rate;

  /** Speak text in the given language, using the saved voice + rate. */
  const speak = useCallback((text: string, langCode: string, fallbackRate?: number) => {
    Speech.stop();
    const options: Speech.SpeechOptions = {
      language: langCode,
      rate: rate || fallbackRate || 1.0,
      onStart: () => setIsSpeaking(true),
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    };
    if (voiceURI) {
      options.voice = voiceURI;
      log('using saved voice:', voiceURI, 'rate:', options.rate);
    }
    Speech.speak(text, options);
  }, [voiceURI, rate]);

  const stop = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  return { speak, stop, isSpeaking, settings: { voiceURI, rate } };
}
