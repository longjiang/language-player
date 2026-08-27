/**
 * Extension playback + speech settings.
 *
 * These live in chrome.storage.local under their own keys (the extension has
 * no backend sync — see docs/arch/011-settings-architecture.md). Display
 * settings keep their existing storage contract (extensionDisplaySettings +
 * the legacy flat keys the transcript reads: showPhonetics / showTranslation /
 * textScale); this module owns only the Playback and Speech settings that the
 * SettingsModal writes and the transcript/dictionary apply.
 */

import { logerr } from './i18n';

export interface PlaybackSettings {
  /** Smooth-scroll the transcript to the active cue when it changes. */
  smoothScroll: boolean;
}

export interface SpeechSettings {
  /** The SpeechSynthesis voiceURI to use for pronunciation; '' = default. */
  voiceURI: string;
  /** Speech rate (0.1–10, typical 0.5–1.5); web default is 0.75. */
  rate: number;
}

export const DEFAULT_PLAYBACK: PlaybackSettings = {
  smoothScroll: true,
};

export const DEFAULT_SPEECH: SpeechSettings = {
  voiceURI: '',
  rate: 0.75,
};

/** Storage keys (kept in one place so readers/writers cannot drift). */
export const PLAYBACK_SETTINGS_KEY = 'extensionPlaybackSettings';
export const SPEECH_SETTINGS_KEY = 'extensionSpeechSettings';

export async function loadPlaybackSettings(): Promise<PlaybackSettings> {
  try {
    const stored = await chrome.storage.local.get(PLAYBACK_SETTINGS_KEY);
    return { ...DEFAULT_PLAYBACK, ...(stored[PLAYBACK_SETTINGS_KEY] || {}) };
  } catch (err) {
    logerr('[LP Extension] loadPlaybackSettings failed — using defaults:', err);
    return { ...DEFAULT_PLAYBACK };
  }
}

export function savePlaybackSettings(settings: PlaybackSettings): void {
  chrome.storage.local.set({ [PLAYBACK_SETTINGS_KEY]: settings }).catch(() => {});
}

export async function loadSpeechSettings(): Promise<SpeechSettings> {
  try {
    const stored = await chrome.storage.local.get(SPEECH_SETTINGS_KEY);
    return { ...DEFAULT_SPEECH, ...(stored[SPEECH_SETTINGS_KEY] || {}) };
  } catch (err) {
    logerr('[LP Extension] loadSpeechSettings failed — using defaults:', err);
    return { ...DEFAULT_SPEECH };
  }
}

export function saveSpeechSettings(settings: SpeechSettings): void {
  chrome.storage.local.set({ [SPEECH_SETTINGS_KEY]: settings }).catch(() => {});
}

/**
 * Apply the stored speech settings to an utterance before it is spoken.
 * Falls back to the L2 language code when the chosen voice is no longer
 * available (e.g. the OS voice list changed), and always honours `rate`.
 */
export function applySpeechToUtterance(
  utterance: SpeechSynthesisUtterance,
  l2Code: string,
  speech: SpeechSettings,
): void {
  const voices = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [];
  const voice = voices.find((v) => v.voiceURI === speech.voiceURI);
  if (voice) {
    utterance.voice = voice;
  } else if (l2Code) {
    utterance.lang = l2Code;
  }
  if (speech.rate > 0) {
    utterance.rate = speech.rate;
  }
}
