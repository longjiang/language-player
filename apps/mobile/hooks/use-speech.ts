import { useCallback, useState, useEffect, useRef } from 'react';
import * as Speech from 'expo-speech';
import * as SecureStore from 'expo-secure-store';

const SETTINGS_KEY = 'zthSpeechSettings';

interface SpeechSettings {
  voiceURI?: string;
  rate?: number;
}

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [settings, setSettings] = useState<SpeechSettings>({ rate: 0.75 });
  const finishListenerRef = useRef<ReturnType<typeof Speech.isSpeakingAsync> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
        if (raw) setSettings((prev) => ({ ...prev, ...JSON.parse(raw) }));
      } catch {}
    })();
  }, []);

  const saveSettings = useCallback(async (s: SpeechSettings) => {
    await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(s));
    setSettings(s);
  }, []);

  const speak = useCallback((text: string, langCode: string) => {
    Speech.stop();
    Speech.speak(text, {
      language: langCode,
      rate: settings.rate ?? 0.75,
      onStart: () => setIsSpeaking(true),
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
    });
  }, [settings.rate]);

  const stop = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  const setVoice = useCallback((voiceURI: string) => {
    saveSettings({ ...settings, voiceURI });
  }, [settings, saveSettings]);

  const setRate = useCallback((rate: number) => {
    saveSettings({ ...settings, rate });
  }, [settings, saveSettings]);

  return { speak, stop, isSpeaking, settings, setVoice, setRate };
}
