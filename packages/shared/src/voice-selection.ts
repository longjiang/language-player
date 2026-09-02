/**
 * Cross-platform TTS voice auto-selection — shared by the web app (Web
 * Speech API) and the mobile app (expo-speech).
 *
 * The ranking rules are derived from platform documentation; the full
 * research notes live in docs/arch/031-tts-voice-selection.md.
 *
 * Platform quality signals:
 *  - Apple (macOS/iOS): AVSpeechSynthesisVoiceQuality — default(1) <
 *    enhanced(2) < premium(3) (developer.apple.com). The tier is exposed via
 *    expo-speech's `quality` field AND is encoded in voice identifiers
 *    ("com.apple.voice.premium.ja-JP.Otoya") and names ("Otoya (Enhanced)").
 *    Note: expo-speech mislabels premium voices as "Default" (it only checks
 *    `== .enhanced`), so identifier/name parsing is required for premium.
 *  - Android: android.speech.tts.Voice.getQuality() — 100..500, higher is
 *    better; expo-speech maps `> QUALITY_NORMAL(300)` to "Enhanced".
 *  - Web (browsers): SpeechSynthesisVoice has NO quality field — only
 *    `name`, `lang`, `localService`, `default`, `voiceURI` (MDN). Quality must
 *    be inferred from naming conventions:
 *      - "Microsoft … Online (Natural)" — Edge's ML voices, best on Windows
 *      - "(Premium)" / "(Enhanced)" — Apple voices surfaced in Chrome on macOS
 *      - "Google …" — Chrome's network voices (better than local compact ones)
 *      - macOS novelty/Eloquence voices (Zarvox, Bubbles, Eddy, Flo, …) —
 *        robotic, must be deprioritized
 */

/** Best-guess BCP 47 speech tag per L2 code (moved from web use-speech.ts). */
export const LANG_TO_SPEECH_TAG: Record<string, string> = {
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

/**
 * Normalized shape of a TTS voice from any platform. Adapters map
 * `SpeechSynthesisVoice` (web) and expo-speech `Voice` (mobile) into this.
 */
export interface VoiceCandidate {
  /** Stable id — `voiceURI` on web, `identifier` on expo-speech. */
  identifier: string;
  /** Human-readable name (may embed quality: "Otoya (Enhanced)"). */
  name: string;
  /** BCP 47-ish tag, e.g. "ja-JP", "en-US"; Android Chrome may use "en_us". */
  lang: string;
  /** expo-speech quality field ('Default' | 'Enhanced'); absent on web. */
  quality?: string;
  /** Web Speech `localService` — voice works offline. */
  localService?: boolean;
  /** Web Speech `default` flag (unreliable across browsers; minor weight). */
  isDefault?: boolean;
}

/** Voice-quality tiers. Higher is better; NOVELTY voices are never auto-picked. */
export const VOICE_QUALITY_TIERS = {
  PREMIUM: 3,
  ENHANCED: 2,
  DEFAULT: 1,
  NOVELTY: 0,
} as const;

/** Quality tier if no stronger signal exists (plain compact/local voices). */
const FALLBACK_TIER = VOICE_QUALITY_TIERS.DEFAULT;

/**
 * macOS novelty voice display names (Effects + legacy MacinTalk packs) and
 * the Eloquence pack. These are robotic/novelty voices — terrible for
 * language learning. Localized system names escape this list; the Apple
 * identifier check below covers most of them anyway.
 */
const NOVELTY_NAMES = new Set([
  // Eloquence pack
  'eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley',
  // Effects / legacy MacinTalk pack
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos',
  'deranged', 'wobble', 'good news', 'hysterical', 'jester', 'junior',
  'kathy', 'organ', 'pipe', 'princess', 'superstar', 'ralph', 'trinoids',
  'whisper', 'zarvox', 'fred',
]);

const NOVELTY_IDENTIFIER_RE =
  /com\.apple\.eloquence\.|com\.apple\.speech\.synthesis\.voice\./i;

const PREMIUM_IDENTIFIER_RE = /com\.apple\.voice\.premium\./i;
const ENHANCED_IDENTIFIER_RE = /com\.apple\.voice\.enhanced\./i;

/** Edge's ML voices: "Microsoft Aria Online (Natural) - English (United States)". */
const NATURAL_NAME_RE = /natural/i;
/** Apple naming: "Otoya (Enhanced)", "Yue (Premium)". */
const PREMIUM_NAME_RE = /premium/i;
const ENHANCED_NAME_RE = /enhanced/i;
/** Chrome's network voices: "Google US English", "Google 日本語". */
const GOOGLE_NAME_RE = /^google\b/i;

/** Normalize a platform lang tag: "en_us" → "en-us", casefolded. */
export function normalizeLangTag(lang: string): string {
  return (lang ?? '').trim().replace(/_/g, '-').toLowerCase();
}

/** Primary subtag of a lang tag: "en-US" → "en". */
export function langPrimary(lang: string): string {
  const normalized = normalizeLangTag(lang);
  return normalized.split('-')[0] ?? '';
}

/**
 * Whether a voice's lang matches the L2 language. Matches via the L2 code's
 * primary subtag OR via the mapped speech tag's primary subtag — needed for
 * L2s whose ISO code differs from the speech-tag family (yue/nan → zh-*).
 */
export function voiceMatchesL2(voiceLang: string, l2Code: string): boolean {
  const voicePrimary = langPrimary(voiceLang);
  if (!voicePrimary) return false;
  if (voicePrimary === l2Code.toLowerCase()) return true;
  const mapped = LANG_TO_SPEECH_TAG[l2Code.toLowerCase()];
  if (mapped && langPrimary(mapped) === voicePrimary) return true;
  return false;
}

/**
 * Derive the voice-quality tier from every available signal. Order matters:
 * explicit quality field → Apple identifier → name conventions → fallback.
 */
export function voiceQualityTier(voice: VoiceCandidate): number {
  const quality = (voice.quality ?? '').toLowerCase();
  if (quality === 'premium') return VOICE_QUALITY_TIERS.PREMIUM;
  if (quality === 'enhanced') return VOICE_QUALITY_TIERS.ENHANCED;

  const id = voice.identifier ?? '';
  if (PREMIUM_IDENTIFIER_RE.test(id)) return VOICE_QUALITY_TIERS.PREMIUM;
  if (ENHANCED_IDENTIFIER_RE.test(id)) return VOICE_QUALITY_TIERS.ENHANCED;
  if (NOVELTY_IDENTIFIER_RE.test(id)) return VOICE_QUALITY_TIERS.NOVELTY;

  const name = voice.name ?? '';
  if (NATURAL_NAME_RE.test(name)) return VOICE_QUALITY_TIERS.PREMIUM;
  if (PREMIUM_NAME_RE.test(name)) return VOICE_QUALITY_TIERS.PREMIUM;
  if (ENHANCED_NAME_RE.test(name)) return VOICE_QUALITY_TIERS.ENHANCED;
  if (NOVELTY_NAMES.has(name.toLowerCase())) return VOICE_QUALITY_TIERS.NOVELTY;

  return FALLBACK_TIER;
}

/** Weights for the scoring components below. */
const WEIGHT = {
  QUALITY: 1000,
  /** Exact match with the L2's canonical speech tag (e.g. zh → zh-CN). */
  EXACT_TAG: 100,
  /** Voice works offline (web `localService`, tie-breaker within a tier). */
  LOCAL: 10,
  /** Web Speech `default` flag — unreliable (Safari marks all true); minor. */
  OS_DEFAULT: 5,
} as const;

/**
 * Deterministic score for a voice in the context of an L2. Higher is better.
 * Assumes `voiceMatchesL2(voice.lang, l2Code)` — non-matching voices score
 * lowest and are excluded by `pickBestVoice`.
 */
export function scoreVoice(voice: VoiceCandidate, l2Code: string): number {
  const tier = voiceQualityTier(voice);
  const mapped = LANG_TO_SPEECH_TAG[l2Code.toLowerCase()];
  const exactTag =
    !!mapped && normalizeLangTag(voice.lang) === normalizeLangTag(mapped);
  return (
    tier * WEIGHT.QUALITY +
    (exactTag ? WEIGHT.EXACT_TAG : 0) +
    (voice.localService ? WEIGHT.LOCAL : 0) +
    (voice.isDefault ? WEIGHT.OS_DEFAULT : 0)
  );
}

/** Stable, deterministic ordering for ties: name, then identifier. */
function compareTies(a: VoiceCandidate, b: VoiceCandidate): number {
  const byName = (a.name ?? '').localeCompare(b.name ?? '');
  if (byName !== 0) return byName;
  return (a.identifier ?? '').localeCompare(b.identifier ?? '');
}

/**
 * Rank L2-matching voices, best first. Non-matching voices are excluded.
 * Duplicate identifiers are deduped (iOS lists some preloaded voices twice).
 */
export function rankVoicesForL2<T extends VoiceCandidate>(
  voices: T[],
  l2Code: string,
): T[] {
  const seen = new Set<string>();
  const matched = voices.filter(v => {
    if (seen.has(v.identifier)) return false;
    seen.add(v.identifier);
    return voiceMatchesL2(v.lang, l2Code);
  });
  return matched.sort(
    (a, b) => scoreVoice(b, l2Code) - scoreVoice(a, l2Code) || compareTies(a, b),
  );
}

/**
 * Pick the best voice for an L2. Order of precedence:
 *
 * 1. `preferredIdentifier` (the user's saved choice) — always wins when the
 *    voice still exists, even if it ranks lower (explicit choice).
 * 2. Highest score from `rankVoicesForL2` (quality tier first, then exact
 *    locale tag, then offline availability).
 * 3. `null` when nothing matches — callers should NOT speak with a
 *    wrong-language voice (see ARCH-031).
 */
export function pickBestVoice<T extends VoiceCandidate>(
  voices: T[],
  l2Code: string,
  preferredIdentifier?: string | null,
): T | null {
  if (preferredIdentifier) {
    const preferred = voices.find(v => v.identifier === preferredIdentifier);
    if (preferred) return preferred;
  }
  return rankVoicesForL2(voices, l2Code)[0] ?? null;
}
