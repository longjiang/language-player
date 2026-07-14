// ──────────────────────────────────────────────
// Domain Types — shared across web, mobile, and API
// ──────────────────────────────────────────────

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

/** Unified token from POST /lemmatize */
export interface LemmatizedToken {
  /** Surface form as it appears in the text */
  text: string;
  /** Possible base/dictionary forms. Empty array = punctuation/spaces. */
  lemmas: Lemma[];
  /** Phonetic guide (rare — only Arabic tokenizer provides this today) */
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

/** A single entry from the dictionary lookup, matching the backend WordEntry schema. */
export interface DictionaryEntry {
  // ── Core (always present) ──
  id: string;
  head: string;
  definitions: string[];
  pronunciation: string;
  match_type: 'exact' | 'lemma' | 'fuzzy' | 'llm' | null;

  // ── Optional metadata ──
  part_of_speech?: string | null;
  level?: {
    scale: 'hsk_2010' | 'hsk_2026' | 'cefr' | 'jlpt';
    value: number | string;
  } | null;
  frequency?: number | null;
  /** 1–7 integer derived from Zipf frequency thresholds. 1 = most common, 7 = rarest. */
  frequencyLevel?: number | null;

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
  source: 'hsk-cedict' | 'cc-canto' | 'edict' | 'kengdic' | 'klingonska' | 'wiktionary' | 'llm';
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
