import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { log, logwarn, speechLogger } from '@/lib/logger';
import {
  SPEECH_DEFAULTS,
  LANG_TO_SPEECH_TAG,
  normalizeLangTag,
  pickBestVoice,
  voiceMatchesL2,
  type VoiceCandidate,
} from '@langplayer/shared';

/**
 * TTS via expo-speech.
 *
 * Speech settings (voiceURI, rate) are read per-L2 from the unified
 * settings_v2 store (`l2[code].speech`) — the same values the Settings →
 * Speech page writes via `updateL2` (ARCH-011, SPEC-015). The legacy
 * `zthSpeechSettings` SecureStore key is no longer read or written.
 *
 * Voice auto-selection is quality-ranked per platform — see ARCH-031 /
 * `pickBestVoice` in @langplayer/shared. When no installed voice matches the
 * L2, speak() does nothing beyond a warning: the OS default voice would read
 * e.g. Japanese text with English phonetics.
 */
export function useSpeech() {
  const { getL2, loaded } = useSettingsContext();
  const { l2Lang } = useLanguage();
  const [isSpeaking, setIsSpeaking] = useState(false);

  const l2Settings = loaded ? getL2(l2Lang.code) : null;
  const speech = l2Settings?.speech ?? SPEECH_DEFAULTS;
  const voiceURI = speech.voiceURI;
  const rate = speech.rate ?? SPEECH_DEFAULTS.rate;

  // Cache the installed-voice list per session. expo-speech enumerates voices
  // on BOTH iOS and Android (the Android module maps native quality >
  // QUALITY_NORMAL to "Enhanced"); on web it throws, which we tolerate.
  const voicesRef = useRef<VoiceCandidate[]>([]);
  useEffect(() => {
    let cancelled = false;
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        if (cancelled) return;
        voicesRef.current = voices.map((v) => ({
          identifier: v.identifier,
          name: v.name,
          lang: v.language,
          quality: v.quality,
        }));
        speechLogger.log('enumerated %d voices', voicesRef.current.length);
      })
      .catch((err) => {
        logwarn('voice enumeration unavailable on this platform:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Speak text in the given language, using the saved voice + rate. */
  const speak = useCallback((text: string, langCode: string, fallbackRate?: number) => {
    Speech.stop();
    const options: Speech.SpeechOptions = {
      // Prefer the L2's canonical BCP 47 tag as the base locale (e.g. yue →
      // zh-HK); a picked voice below overrides it on both platforms.
      language: LANG_TO_SPEECH_TAG[langCode.toLowerCase()] ?? normalizeLangTag(langCode),
      rate: rate || fallbackRate || 1.0,
      onStart: () => setIsSpeaking(true),
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    };

    const candidates = voicesRef.current;
    if (candidates.length === 0) {
      // Enumeration hasn't completed (or failed) — let the OS pick by language.
      speechLogger.log('voice list unavailable — OS default for l2=%s', langCode);
      Speech.speak(text, options);
      return;
    }

    const best = pickBestVoice(candidates, langCode, voiceURI);
    if (!best) {
      logwarn('[LP Mobile] no installed voice matches L2 "' + langCode + '" — not speaking (' + candidates.length + ' voices installed)');
      speechLogger.log(
        'no match for l2=%s — installed langs: %o',
        langCode,
        [...new Set(candidates.map((v) => normalizeLangTag(v.lang)))].slice(0, 30),
      );
      return;
    }

    options.voice = best.identifier;
    speechLogger.log(
      'l2=%s → "%s" (%s) quality=%s | %d candidates, chosen score-ranked (ARCH-031)',
      langCode, best.name, best.lang, best.quality ?? 'n/a', candidates.length,
    );

    Speech.speak(text, options);
  }, [voiceURI, rate]);

  const stop = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  return { speak, stop, isSpeaking, settings: { voiceURI, rate } };
}
