// ──────────────────────────────────────────────
// Domain Types — shared across web, mobile, and API
// ──────────────────────────────────────────────

// ── Level Scale ──────────────────────────────

/** Known proficiency scale identifiers. */
export type ScaleId = 'hsk_2010' | 'hsk_2025' | 'cefr' | 'jlpt' | 'topik' | 'ielts';

// ── Video & Media ─────────────────────────────

export interface YouTubeVideo {
  difficulty?: number;
  starttime?: number;
  date?: Date;
  youtube_id: string;
  id?: string;
  title?: string;
  subs_l1?: SubtitleLine[];
  subs_l2?: SubtitleLine[];
  views?: number;
  comments?: number;
  likes?: number;
  duration?: number; // seconds
  locale?: string;
  tv_show?: string;
  category?: string;
  tags?: string;
  talk?: string;
  type?: string;
  made_for_kids?: boolean;
  channel_id?: string;
}

export interface SubtitleLine {
  line: string;
  starttime: number;
}

export interface SyncedLine {
  starttime: number;
  l1Line: string;
  l2Line: string;
}

export interface TVShow {
  id: string;
  title: string;
  locale: string;
  season?: number;
  episode?: number;
}

// ── Dictionary & Tokens ───────────────────────

export interface Lemma {
  lemma: string;
  part_of_speech?: string;
  pronunciation?: string;
}

/** Unified token from POST /lemmatize

 *  Non-word tokens use `lemmas: []` to mark them as non-interactive:
 *    — Spaces: `{"text": " ", "lemmas": []}` (recovered by _recover_spaces from original text)
 *    — Newlines / carriage returns: `{"text": "\n", "lemmas": []}` or with lemmas from the raw
 *      lemmatizer depending on whether _recover_spaces or the normalizer produced them
 *    — Punctuation: `{"text": ".", "lemmas": []}` (some lemmatizers may attach POS, but empty is canonical)
 *
 *  Word tokens have `lemmas.length > 0` and are clickable in TokenSpan.
 *
 *  Note: /lemmatize-video-normalized (video token cache) does NOT include spaces — the raw
 *  lemmatizers strip them and normalize_by_lang() has no access to the original text.
 *  The frontend falls back to per-line /lemmatize when the cache misses.
 */
export interface LemmatizedToken {
  /** Surface form as it appears in the text */
  text: string;
  /** Possible base/dictionary forms. Empty array = non-word token (space, punctuation, line break). */
  lemmas: Lemma[];
  /**
   * Phonetic guide, populated by these lemmatizers only:
   *   ja — katakana reading from MeCab (e.g. アサゴハン)
   *   zh / yue — tone-marked pinyin/jyutping from Jieba (e.g. nǐ hǎo)
   *   ar — Buckwalter transliteration from Qalsadi (e.g. a:lssilaa:mu)
   *   fa — Latin transliteration via PersianG2p (e.g. salām, xubi)
   *
   * Absent (null/undefined) for all other languages:
   *   ko, ru, tr, my, and all spaCy/Simplemma languages (en, fr, de, es, fi, sw, etc.)
   */
  pronunciation?: string;
}

export interface LemmatizeResponse {
  tokens: LemmatizedToken[];
}

export interface Token {
  text: string;
  pos?: string;
  stem?: string;
  lemmas?: Lemma[];
  pronunciation?: string;
}

export interface TokenizerModule {
  normalizeTokens: (tokens: Token[], text: string) => Token[];
}

export interface Tokenizer {
  name: string;
  module: TokenizerModule;
  endPoint: string;
  languages: string[];
}

/** Matches the Python backend's dictionary/lookup response format. */
export interface DictionaryLookupResponse {
  query: {
    text: string;
    l2: string;
    l1: string;
  };
  results: DictionaryEntry[];
  message?: string;
}

/** A proficiency level on a given grading scale.
 *  e.g. `{ scale: 'hsk_2010', value: 3 }`, `{ scale: 'cefr', value: 'B1' }`.
 *
 *  @typeParam Scale — narrow this to a literal union for known scales (e.g. `'hsk_2010' | 'cefr'`),
 *                     or leave as the default `string` for open-ended data. */
export interface ProficiencyLevel<Scale extends string = string> {
  scale: Scale;
  value: number | string;
}

/** Study material coverage for a dictionary entry (ADR 0006). */
export interface StudyMaterialCoverage {
  material: string;
  author?: string;
  year?: number;
  targetLevel?: ProficiencyLevel | null;
  location?: {
    book?: string | number;
    lesson?: string | number;
    dialog?: string | number;
  };
  example?: string;
  exampleTranslation?: string;
}

/** A single entry from the dictionary lookup, matching the ADR 0006 schema. */
export interface DictionaryEntry {
  /** Discriminant — 'dictionary' for curated entries, 'llm' for AI-generated. */
  kind: 'dictionary';

  /** The dictionary that owns this entry. Replaces the flat 'source' string. */
  dictionary: {
    id: string;      // 'edict', 'cedict', 'cc-canto', 'kengdic', 'klingonska', 'wiktionary'
    name: string;    // 'EDICT', 'HSK CEDICT', etc.
    version: string; // '2019', '2026', etc.
  };

  // ── Core (always present) ──
  id: string;
  head: string;
  definitions: string[];
  pronunciation: string;
  match_type: 'exact' | 'lemma' | 'fuzzy' | 'llm' | null;

  // ── Optional metadata ──
  part_of_speech?: string | null;
  /** Proficiency level(s) assigned to this entry. A word may have multiple levels
   *  across different scales (e.g., both hsk_2010:3 and hsk_2025:2 for Chinese).
   *  null or empty means unclassified. */
  levels?: ProficiencyLevel<ScaleId>[] | null;
  frequency?: number | null;
  /** 1–7 integer derived from Zipf frequency thresholds. 1 = most common, 7 = rarest. */
  frequencyLevel?: number | null;

  // ── Study material coverage ──
  /** Study materials (textbooks, courses) that cover this entry.
   *  Each entry records where the word appears in the material. */
  studyMaterials?: StudyMaterialCoverage[] | null;

  // ── Language-specific scripts ──
  alternate?: string | null;
  han_script?: {
    traditional?: string;
    simplified?: string;
    kanji?: string | null;
    hanja?: string | null;
    hangul?: string;
    han?: string;
    hantu?: string;
  } | null;
  phonetic_detail?: {
    pinyin?: string;
    pinyin_numeric?: string;
    kana?: string;
    romaji?: string;
    jyutping?: string;
    romanization?: string;
    ipa?: string;
    pitch_accent?: number[];
    stressed?: string;
  } | null;

  // ── Source info ──
  /** @deprecated Use dictionary.id instead. Kept for backward compatibility. */
  source: 'hsk-cedict' | 'cc-canto' | 'edict' | 'kengdic' | 'klingonska' | 'wiktionary' | 'llm';

  /** Measure words, counters, or grammatical gender classifiers.
   *  Parsed from CC-CEDICT CL: tags, EDICT counters, Wiktionary gender, etc. */
  classifier?: Classifier[] | null;
}

// ── Classifier Types (ADR 0006) ─────────────────────────────────

/** A morphological classifier — measure word, counter, gender, noun class. */
export type Classifier = MeasureWord | GrammaticalGender | NounClass;

export interface MeasureWord {
  kind: 'measure_word';
  traditional: string;
  simplified: string;
  reading: string;
  senseIndex?: number;
}

export interface GrammaticalGender {
  kind: 'gender';
  value: string;
  senseIndex?: number;
}

export interface NounClass {
  kind: 'noun_class';
  value: string;
  senseIndex?: number;
}

/** An LLM-generated dictionary entry (ADR 0006). Non-canonical; context-dependent. */
export interface LlmGeneratedEntry {
  kind: 'llm';

  /** The model that generated this entry. */
  model: string;

  /** The sentence provided as context in the LLM prompt. */
  contextSentence?: string;

  // ── LexicalEntry fields ──
  head: string;
  definitions: string[];
  pronunciation: string;
  levels?: ProficiencyLevel[] | null;
  part_of_speech?: string | null;

  // ── Frequency (looked up from tables, not LLM-generated) ──
  frequency?: number | null;
  frequencyLevel?: number | null;
}

// ── User & Auth ───────────────────────────────

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  nativeLanguage: string;
  learningLanguages: UserLanguage[];
  subscription?: Subscription;
  preferences: UserPreferences;
}

export interface UserLanguage {
  code: string;
  level: number;
  wordsKnown?: number;
  hoursWatched?: number;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  autoplaySubtitles: boolean;
  subtitleLanguage1: string;
  subtitleLanguage2: string;
  playbackSpeed: number;
}

export interface Subscription {
  plan: 'free' | 'pro' | 'lifetime';
  expiresAt?: Date;
  autoRenew: boolean;
}

// ── Language & Level ──────────────────────────

export interface LevelInfo {
  hsk: string;
  cefr: string;
  jlpt: string;
  topik: string;
  ielts: string;
  category: 'beginner' | 'intermediate' | 'advanced' | 'mastery';
  name: string;
  hoursMultiplier: number;
  [key: string]: string | number;
}

// ── API ───────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ── Player ────────────────────────────────────

export const PLAYER_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  VIDEO_CUED: 5,
} as const;

export type PlayerState = (typeof PLAYER_STATES)[keyof typeof PLAYER_STATES];

// ── Saved Words ───────────────────────────────

/** Context describing where a word was saved from. Mirrors Classic's context shape. */
export interface SavedWordContext {
  /** The word form that was tapped/clicked */
  form: string;
  /** Full subtitle line or surrounding sentence text */
  text: string;
  /** Video timestamp in seconds (if saved from a video) */
  starttime?: number;
  /** YouTube video ID (if saved from a video) */
  youtube_id?: string;
  /** Video title for attribution in saved-words list */
  videoTitle?: string;
  /** Book/chapter title for attribution (future: reader) */
  textTitle?: string;
  /** L1 translation of the line (future use) */
  translation?: string;
}

/** A single saved word record. Stored in localStorage and synced to Directus. */
export interface SavedWord {
  /** Dictionary entry ID (e.g., "cedict-0", "llm-zh-abc123") */
  id: string;
  /** All forms of the word (for now, just [head] — no inflected forms yet) */
  forms: string[];
  /** Unix-ms timestamp when the word was saved */
  date: number;
  /** Where and how the word was saved */
  context: SavedWordContext;
}

/** Top-level storage shape. Keyed by L2 ISO 639-1 code. */
export type SavedWords = Record<string, SavedWord[]>;

/** Directus user_data record shape (partial — only the fields we sync). */
export interface UserDataRecord {
  id: string | number;
  saved_words: string;  // JSON.stringify(SavedWords)
  progress?: string;    // JSON (reserved for Phase 6)
  srs_progress?: string;  // JSON.stringify(SrsProgressStore)
}

/** SM-2 spaced repetition fields for a single card. */
export interface SrsFields {
  /** Ease factor. Starts at 2.5, adjusts ±0.15 per review. Min 1.3. */
  ease: number;
  /** Days until next review. 0 = new card. */
  interval: number;
  /** Number of consecutive correct recalls. */
  repetitions: number;
  /** Unix-ms timestamp when card is next due for review. */
  nextReview: number;
  /** Unix-ms timestamp of the last review. */
  lastReview: number;
  /** Unix-ms timestamp when the card was first created. Used to limit new cards/day. */
  createdAt?: number;
}

/**
 * Top-level SRS progress store shape.
 * Stored in localStorage under 'zthSrsProgress' and synced to Directus srs_progress column.
 *
 * Cards are keyed by l2Code → wordId → SrsFields.
 * Settings are embedded so they sync across devices with the cards.
 */
export interface SrsProgressStore {
  settings: {
    /** Max new cards introduced per day. Default 20. */
    dailyNewLimit: number;
  };
  /** Cards keyed by ISO 639-1 l2 code, then by dictionary entry ID. */
  cards: Record<string, Record<string, SrsFields>>;
}

// ── Inflection ───────────────────────────────

/** A single inflected/conjugated form of a word. Matches the Python backend's
 *  inflect_*.py output shape and Classic's inflector output. */
export interface InflectedForm {
  /** Grouping category (e.g., "head", "conjugation", "declensions", "verb"). */
  table: string;
  /** Human-readable label for this form (e.g., "polite affirmative", "past tense"). */
  field: string;
  /** The actual inflected/conjugated word form. */
  form: string;
}

// ── Notes / User Texts ───────────────────────

/**
 * A user-created note (formerly "saved text" in Classic).
 * Stored in Directus `text` table.
 * Fields: id, status, owner, created_on, text, translation, l2, title
 */
export interface Note {
  id: number;
  title: string;
  text: string;
  translation?: string | null;
  /** Directus internal language ID (obtained via lang_id_by_code). */
  l2: number;
  owner: number;
  /** ISO-formatted date string (Directus `created_on`). */
  created_on?: string;
}

/** Lightweight summary for the notes sidebar list. */
export interface NoteListItem {
  id: number;
  title: string;
  created_on?: string;
}

// ── Settings V2 ──────────────────────────────

/*
 * Top-level store shape.
 *
 * localStorage key:  `lp_settings`
 * Cloud field:       `user_data.settings_v2` (JSON text blob)
 *
 * `v` enables schema migrations; `ts` enables last-write-wins conflict resolution.
 */

export interface SettingsV2 {
  v: 2;
  ts: string; // ISO 8601

  /** Reading experience — applies to all languages. */
  tokenizedText: TokenizedTextSettings;

  /** General display. */
  display: DisplaySettings;

  /** Video player & transcript. */
  playback: PlaybackSettings;

  /** SRS / spaced repetition. */
  review: ReviewSettings;

  /** Per-L2 settings, keyed by ISO 639-1 code. Missing keys → L2_DEFAULTS. */
  l2: Record<string, L2Settings>;
}

// ── Global ─────────────────────────────────────

export interface TokenizedTextSettings {
  /** Whether tapping a word opens the popup dictionary. (Inverse of Classic's disableAnnotation.) */
  enabled: boolean;

  /** Text size: 0 (smallest) to 7 (largest). */
  zoom: number;

  /** Font for L2 text. */
  typeFace: 'default' | 'serif' | 'sans-serif';

  /** `normal` = show all words; `quiz` = blank out saved words for self-testing. */
  mode: 'normal' | 'quiz';

  /** Show first definition inline for saved/bookmarked words. */
  quickGloss: boolean;
}

export interface DisplaySettings {
  /** `light` | `dark` | `system` — follows OS preference when `system`. */
  theme: 'light' | 'dark' | 'system';
  /** Show L1 translation lines alongside L2 text. */
  translation: boolean;
}

export interface PlaybackSettings {
  /** Playback speed multiplier: 0.5 | 0.75 | 1.0. */
  speed: number;
  /** Pause video after each subtitle line finishes. */
  autoPause: boolean;
  /** Highlight current word in subtitle as it's spoken (karaoke effect). */
  karaokeMode: boolean;
  /** Smooth-scroll the transcript to the active line. */
  smoothScroll: boolean;
  /** Collapse the video player to a mini player when scrolling the transcript. */
  collapsedVideo: boolean;
  /** `subtitles` = full scrollable transcript; `transcript` = one line at a time. */
  transcriptMode: 'subtitles' | 'transcript';
}

export interface ReviewSettings {
  /** Max new SRS cards introduced per day across all languages. */
  dailyNewLimit: number;
}

// ── Per-L2 ─────────────────────────────────────

export interface L2Settings {
  /** What renders on each individual word token. */
  tokenSpan: TokenSpanSettings;

  /** Script variant. zh: traditional/simplified. ko: hanja. vi: hán tự. */
  display: L2DisplaySettings;

  /** TTS voice & rate for this language. Maps to Settings → Pronunciation tab. */
  speech: SpeechSettings;

  /** Content filters for this language. */
  content: ContentSettings;
}

export interface TokenSpanSettings {
  phonetics: {
    /**
     * `ruby`  — annotation above characters (pinyin on hanzi, furigana on kanji)
     * `word`  — show ONLY phonetics, hide the original script
     * `false` — hidden entirely
     */
    show: 'ruby' | 'word' | false;
    /**
     * `always`    — on every word
     * `hardWords` — only on words above the user's proficiency level
     */
    conditions: 'always' | 'hardWords'; // If phonetics.show is 'word', then 'always' is manditory.
  };
  definition: {
    /** Show first dictionary definition inline on ALL word blocks. */
    show: boolean;
  };
}

export interface L2DisplaySettings {
  /** zh only: `true` = traditional (繁體), `false` = simplified (简体). Ignored for other languages. */
  traditional: boolean;
  /** ko: show hanja alongside hangul. vi: show hán tự alongside quốc ngữ. Ignored otherwise. */
  byeonggi: boolean;
}

export interface SpeechSettings {
  /** Preferred TTS voice URI. `null` = auto-detect. */
  voiceURI: string | null;
  /** Speech rate: 0.5 (slowest) to 2.0 (fastest). */
  rate: number;
}

export interface ContentSettings {
  /** Only show videos from this TV show slug. `null` = all shows. */
  tvShowFilter: string | null;
  /** Only show videos in this category. `null` = all categories. */
  categoryFilter: string | null;
}

// ── Defaults ───────────────────────────────────

export const TOKENIZED_TEXT_DEFAULTS: TokenizedTextSettings = {
  enabled: true,
  zoom: 0,
  typeFace: 'default',
  mode: 'normal',
  quickGloss: true,
};

export const DISPLAY_DEFAULTS: DisplaySettings = {
  theme: 'dark',
  translation: true,
};

export const PLAYBACK_DEFAULTS: PlaybackSettings = {
  speed: 1.0,
  autoPause: false,
  karaokeMode: true,
  smoothScroll: false,
  collapsedVideo: false,
  transcriptMode: 'subtitles',
};

export const REVIEW_DEFAULTS: ReviewSettings = {
  dailyNewLimit: 20,
};

export const TOKEN_SPAN_DEFAULTS: TokenSpanSettings = {
  phonetics: { show: 'ruby', conditions: 'always' },
  definition: { show: false },
};

export const L2_DISPLAY_DEFAULTS: L2DisplaySettings = {
  traditional: false,
  byeonggi: true,
};

export const SPEECH_DEFAULTS: SpeechSettings = {
  voiceURI: null,
  rate: 1.0,
};

export const CONTENT_DEFAULTS: ContentSettings = {
  tvShowFilter: null,
  categoryFilter: null,
};

export const L2_DEFAULTS: L2Settings = {
  tokenSpan: { ...TOKEN_SPAN_DEFAULTS },
  display: { ...L2_DISPLAY_DEFAULTS },
  speech: { ...SPEECH_DEFAULTS },
  content: { ...CONTENT_DEFAULTS },
};

/** Factory: create a fresh settings object with all defaults. */
export function createSettingsV2(l2Code?: string): SettingsV2 {
  const l2: Record<string, L2Settings> = {};
  if (l2Code) {
    l2[l2Code] = {
      tokenSpan: {
        phonetics: { ...TOKEN_SPAN_DEFAULTS.phonetics },
        definition: { ...TOKEN_SPAN_DEFAULTS.definition },
      },
      display: { ...L2_DISPLAY_DEFAULTS },
      speech: { ...SPEECH_DEFAULTS },
      content: { ...CONTENT_DEFAULTS },
    };
  }
  return {
    v: 2,
    ts: new Date().toISOString(),
    tokenizedText: { ...TOKENIZED_TEXT_DEFAULTS },
    display: { ...DISPLAY_DEFAULTS },
    playback: { ...PLAYBACK_DEFAULTS },
    review: { ...REVIEW_DEFAULTS },
    l2,
  };
}
