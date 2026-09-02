'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsContext } from '@/providers/settings-provider';
import { useLanguage } from '@/providers/language-provider';
import { logwarn } from '@/lib/logger';
import { SPEECH_DEFAULTS } from '@langplayer/shared';

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
function pickBestVoice(langCode: string, preferredURI?: string | null): SpeechSynthesisVoice | null {
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

/**
 * TTS via the Web Speech API.
 *
 * Speech settings (voiceURI, rate) are read per-L2 from the unified
 * settings_v2 store (`l2[code].speech`) — the same values the Settings →
 * Speech page writes via `updateL2` (ARCH-011). The legacy
 * `zthSpeechSettings` localStorage key is no longer read or written.
 */
export function useSpeech() {
  const { getL2, loaded } = useSettingsContext();
  const { l2 } = useLanguage();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Re-render when voices arrive (first pickBestVoice call may see an empty list).
  const [voicesReady, setVoicesReady] = useState(speechSynthesis.getVoices().length > 0);
  useEffect(() => {
    if (speechSynthesis.getVoices().length > 0) {
      setVoicesReady(true);
      return;
    }
    const onVoicesChanged = () => setVoicesReady(true);
    speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    return () => speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
  }, []);

  const l2Settings = loaded && l2 ? getL2(l2.code) : null;
  const speech = l2Settings?.speech ?? SPEECH_DEFAULTS;
  const voiceURI = speech.voiceURI;
  const rate = speech.rate ?? SPEECH_DEFAULTS.rate;

  /** Speak text using Web Speech API in the given L2 language. */
  const speak = useCallback((text: string, l2Code: string, fallbackRate?: number) => {
    speechSynthesis.cancel();
    const voice = pickBestVoice(l2Code, voiceURI);
    if (!voice) {
      logwarn('no TTS voice available for', l2Code);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = rate ?? fallbackRate ?? 1.0;
    utterance.volume = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechSynthesis.speak(utterance);
    // voicesReady is only here to re-create `speak` once the voice list
    // arrives, so pickBestVoice can see it.
  }, [voiceURI, rate, voicesReady]);

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
    voiceURI,
    rate,
    wiktionaryAudioUrl,
  };
}
