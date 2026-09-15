'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsContext } from '@/providers/settings-provider';
import { useLanguage } from '@/providers/language-provider';
import { log, logwarn } from '@/lib/logger';
import { speechLogger } from '@/lib/logger';
import { SPEECH_DEFAULTS, LANG_TO_SPEECH_TAG, pickBestVoice, type VoiceCandidate } from '@langplayer/shared';

/**
 * The Web Speech API exists only in a browser.
 *
 * Every entry point below is guarded by this, because the hook is reachable from
 * server-rendered trees — `TokenizedText` calls `useSpeech()` unconditionally, and
 * the textbook task view renders it on the server. An unguarded
 * `speechSynthesis.getVoices()` during SSR throws
 * `ReferenceError: speechSynthesis is not defined` and turns the whole page into a
 * 500, which is exactly what happened to `/[l1]/[l2]/tasks/[bookId]/[unitId]/[lessonId]/[taskId]`
 * on a hard load.
 */
function speechSynthesisOrNull(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
    ? window.speechSynthesis
    : null;
}

/** Map a Web Speech API voice to the shared platform-agnostic candidate shape. */
function toCandidate(v: SpeechSynthesisVoice): VoiceCandidate & { source: SpeechSynthesisVoice } {
  return {
    identifier: v.voiceURI,
    name: v.name,
    lang: v.lang,
    localService: v.localService,
    isDefault: v.default,
    source: v,
  };
}

/**
 * TTS via the Web Speech API.
 *
 * Speech settings (voiceURI, rate) are read per-L2 from the unified
 * settings_v2 store (`l2[code].speech`) — the same values the Settings →
 * Speech page writes via `updateL2` (ARCH-011). The legacy
 * `zthSpeechSettings` localStorage key is no longer read or written.
 *
 * Voice auto-selection is quality-ranked per platform — see ARCH-031 /
 * `pickBestVoice` in @langplayer/shared. When no voice matches the L2,
 * speak() does nothing (beyond a warning): reading e.g. Japanese text with
 * an English voice produces gibberish.
 */
export function useSpeech() {
  const { getL2, loaded } = useSettingsContext();
  const { l2 } = useLanguage();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Re-render when voices arrive (first pickBestVoice call may see an empty list).
  // Server render: no speech API, so start from "not ready" and let the effect
  // fill it in on the client.
  const [voicesReady, setVoicesReady] = useState(
    () => (speechSynthesisOrNull()?.getVoices().length ?? 0) > 0,
  );
  useEffect(() => {
    const synth = speechSynthesisOrNull();
    if (!synth) return;
    if (synth.getVoices().length > 0) {
      setVoicesReady(true);
      return;
    }
    const onVoicesChanged = () => setVoicesReady(true);
    synth.addEventListener('voiceschanged', onVoicesChanged);
    return () => synth.removeEventListener('voiceschanged', onVoicesChanged);
  }, []);

  const l2Settings = loaded && l2 ? getL2(l2.code) : null;
  const speech = l2Settings?.speech ?? SPEECH_DEFAULTS;
  const voiceURI = speech.voiceURI;
  const rate = speech.rate ?? SPEECH_DEFAULTS.rate;

  /** Speak text using Web Speech API in the given L2 language. */
  const speak = useCallback((text: string, l2Code: string, fallbackRate?: number) => {
    const synth = speechSynthesisOrNull();
    if (!synth) return;
    synth.cancel();
    const allVoices = synth.getVoices();
    const candidates = allVoices.map(toCandidate);
    const best = pickBestVoice(candidates, l2Code, voiceURI ?? undefined);
    if (!best) {
      logwarn('[LP Web] no TTS voice matches L2 "' + l2Code + '" — not speaking (' + allVoices.length + ' voices installed)');
      speechLogger.log('no match for l2=%s — available langs: %o', l2Code, allVoices.map(v => v.lang));
      return;
    }

    const voice = best.source;
    speechLogger.log(
      'l2=%s → "%s" (%s) local=%s | %d candidates, chosen score-ranked (ARCH-031)',
      l2Code, voice.name, voice.lang, voice.localService, candidates.length,
    );

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = rate ?? fallbackRate ?? 1.0;
    utterance.volume = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synth.speak(utterance);
    // voicesReady is only here to re-create `speak` once the voice list
    // arrives, so pickBestVoice can see it.
  }, [voiceURI, rate, voicesReady]);

  /** Play an audio file (e.g., Wiktionary OGG/MP3). */
  const playAudio = useCallback((url: string) => {
    speechSynthesisOrNull()?.cancel();
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
    speechSynthesisOrNull()?.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  /** Get available voices for a language. */
  const getVoicesForLang = useCallback((langCode: string): SpeechSynthesisVoice[] => {
    const prefix = `${langCode}-`;
    return speechSynthesisOrNull()?.getVoices().filter(v => v.lang.startsWith(prefix)) ?? [];
  }, []);

  /** Get all available voices. */
  const getAllVoices = useCallback((): SpeechSynthesisVoice[] => {
    return speechSynthesisOrNull()?.getVoices() ?? [];
  }, []);

  /**
   * Build a Wiktionary Commons audio URL from a filename.
   *
   * Same-origin via `/api/asset-proxy`: Wikimedia's projects have been blocked
   * in mainland China since 2019, so the audio has to be fetched server-side
   * (ADR-0046). The proxy follows the `Special:FilePath` redirect.
   */
  const wiktionaryAudioUrl = useCallback((filename: string): string => {
    const upstream = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
    return `/api/asset-proxy?u=${encodeURIComponent(upstream)}`;
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

// Re-exported for convenience so the voice picker can reuse the shared tag map.
export { LANG_TO_SPEECH_TAG };
