'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const SETTINGS_KEY = 'zthSpeechSettings';

interface SpeechSettings {
  voiceURI?: string;
  rate?: number;
}

/**
 * Best-effort language code → BCP 47 / speechSynthesis lang tag.
 * Web Speech API uses BCP 47 tags like "ja-JP", "zh-CN", "ko-KR", etc.
 */
const LANG_TO_SPEECH_TAG: Record<string, string> = {
  af: 'af-ZA', ar: 'ar-SA', bg: 'bg-BG', ca: 'ca-ES', cs: 'cs-CZ',
  da: 'da-DK', de: 'de-DE', el: 'el-GR', en: 'en-US', es: 'es-MX',
  fi: 'fi-FI', fr: 'fr-FR', he: 'he-IL', hi: 'hi-IN', hr: 'hr-HR',
  hu: 'hu-HU', id: 'id-ID', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR',
  ms: 'ms-MY', nb: 'nb-NO', nl: 'nl-NL', pl: 'pl-PL',
  pt: 'pt-BR', ro: 'ro-RO', ru: 'ru-RU', sk: 'sk-SK',
  sv: 'sv-SE', sw: 'sw-KE', th: 'th-TH', tr: 'tr-TR',
  uk: 'uk-UA', vi: 'vi-VN', yue: 'zh-HK', nan: 'zh-TW',
  zh: 'zh-CN',
};

/** Heuristic: pick the best voice for a given language code. */
function pickBestVoice(langCode: string, preferredURI?: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // 1. User's preferred voice
  if (preferredURI) {
    const preferred = voices.find(v => v.voiceURI === preferredURI);
    if (preferred) return preferred;
  }

  // 2. Native voice matching the BCP 47 tag
  const bcpTag = LANG_TO_SPEECH_TAG[langCode];
  if (bcpTag) {
    const native = voices.find(v => v.lang === bcpTag && v.localService);
    if (native) return native;
  }

  // 3. Any voice matching the language prefix (e.g., "zh" matches "zh-CN", "zh-TW")
  const prefix = `${langCode}-`;
  const langMatch = voices.find(v => v.lang.startsWith(prefix) && v.localService);
  if (langMatch) return langMatch;

  // 4. Any voice matching the language prefix (even non-local)
  const anyMatch = voices.find(v => v.lang.startsWith(prefix));
  if (anyMatch) return anyMatch;

  // 5. Default voice
  return voices[0] ?? null;
}

function loadSettings(): SpeechSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveSettings(settings: SpeechSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Initialize with defaults only — no localStorage read during render.
  // Loading from localStorage in a useState initializer causes hydration
  // mismatches (server has no localStorage → default 0.75, client has stored 0.95).
  const [settings, setSettingsState] = useState<SpeechSettings>({});

  // Load persisted settings on mount (client-side only)
  useEffect(() => {
    setSettingsState(loadSettings());
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Ensure voices are loaded
  useEffect(() => {
    if (speechSynthesis.getVoices().length === 0) {
      speechSynthesis.addEventListener('voiceschanged', () => {
        // Force re-render so pickBestVoice gets updated list
        setSettingsState(s => ({ ...s }));
      }, { once: true });
    }
  }, []);

  /** Speak text using Web Speech API in the given L2 language. */
  const speak = useCallback((text: string, l2Code: string, rate = 0.75) => {
    speechSynthesis.cancel();
    const voice = pickBestVoice(l2Code, settings.voiceURI);
    if (!voice) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.rate = settings.rate ?? rate;
    utterance.volume = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechSynthesis.speak(utterance);
  }, [settings]);

  /** Play an audio file (e.g., Wiktionary OGG/MP3). */
  const playAudio = useCallback((url: string) => {
    speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onplay = () => setIsSpeaking(true);
    audio.onended = () => setIsSpeaking(false);
    audio.onerror = () => setIsSpeaking(false);
    audio.play();
  }, []);

  /** Stop any ongoing speech/audio. */
  const stop = useCallback(() => {
    speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  /** Get available voices for a language. */
  const getVoicesForLang = useCallback((langCode: string): SpeechSynthesisVoice[] => {
    const prefix = `${langCode}-`;
    return speechSynthesis.getVoices().filter(v => v.lang.startsWith(prefix));
  }, []);

  /** Get all available voices. */
  const getAllVoices = useCallback((): SpeechSynthesisVoice[] => {
    return speechSynthesis.getVoices();
  }, []);

  /** Set preferred voice and persist. */
  const setVoiceURI = useCallback((uri: string | undefined) => {
    setSettingsState(prev => {
      const next = { ...prev, voiceURI: uri };
      saveSettings(next);
      return next;
    });
  }, []);

  /** Set speech rate and persist. */
  const setRate = useCallback((rate: number) => {
    setSettingsState(prev => {
      const next = { ...prev, rate };
      saveSettings(next);
      return next;
    });
  }, []);

  /** Build a Wiktionary Commons audio URL from a filename. */
  const wiktionaryAudioUrl = useCallback((filename: string): string => {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
  }, []);

  return {
    speak,
    playAudio,
    stop,
    isSpeaking,
    getVoicesForLang,
    getAllVoices,
    voiceURI: settings.voiceURI,
    setVoiceURI,
    rate: settings.rate ?? 0.75,
    setRate,
    wiktionaryAudioUrl,
  };
}
