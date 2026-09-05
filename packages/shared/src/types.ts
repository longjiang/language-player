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
  /** @deprecated Pre-translated L1 subtitles are no longer stored in Directus
   *  and are never populated by live translation (/translate_array writes to
   *  local component state, not this field). Always empty at runtime.
   *  Kept for backward compatibility with cached API responses. */
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
  /** Native aspect ratio (width ÷ height) of the video content — e.g. 16/9 ≈
   *  1.778, 4/3 ≈ 1.333. Populated from YouTube's player.embedWidth/Height.
   *  When present the player can contain-fit to the column instead of forcing
   *  a 16:9 box, so odd aspect ratios (e.g. 4:3 TV shows) render larger
   *  without letterboxing (SPEC-010 wide layout). */
  aspect_ratio?: number;
}

/** A video the user has liked, as returned by GET /likes. */
export interface LikedVideo {
  /** Legacy/per-shard video id — this is also the id used by the API. */
  id: string | number;
  /** Row id of the like itself. */
  likeId?: string | number;
  video_id?: string | number;
  videoId?: string | number;
  /** Directus/internal language id (legacy) or language code. */
  l2?: string | number;
  l2Code?: string;
  youtube_id: string;
  title?: string;
  tags?: string;
  created_on?: string | null;
  createdOn?: string | null;
}

/** A video stored inside a user playlist's JSONB `videos` array. */
export interface PlaylistVideo {
  id?: string | number;
  youtube_id: string;
  title?: string;
  duration?: number | string;
}

/** A user playlist returned by the Flask /playlists endpoints. */
export interface Playlist {
  id: string | number;
  title: string;
  l2?: string | number;
  videos: PlaylistVideo[];
  createdOn?: string | null;
}

export interface SubtitleLine {
  line: string;
  starttime: number;
  /** Duration in seconds from the subtitle data. Available when parsed from Directus CSV. */
  duration?: number;
}

/** A subtitle line with its L1 translation, used in the Video tab and SubtitlesModeBand. */
export interface SubtitleSyncedLine {
  starttime: number;
  /** Duration in seconds from the subtitle data. */
  duration?: number;
  l2Line: string;
  l1Line: string;
}

/** A video result from the /subs-search endpoint. */
export interface SubsSearchVideo {
  id: number;
  title: string;
  youtube_id: string;
  subs_l2: SubtitleLine[];
  views?: number;
  duration?: number;
  date?: string;
  /** YouTube category id (10 = Music, 24 = Entertainment). Null when unset. */
  category?: number | null;
  /** Directus tv_show row id when the video belongs to a TV show. Null otherwise. */
  tv_show?: number | null;
  /** Index of the best-matching subtitle line for the search terms. Set by client after parsing. */
  matchLineIndex: number;
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

export interface LiveTVChannel {
  id: number;
  name: string;
  logo: string;
  url: string;
  category: string;
  countries: string;
  alive: number | null;
  latency_ms: number | null;
  last_checked: string | null;
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
   *
   *   Language-specific lemmatizers (high-quality, language-aware):
   *     ja — katakana reading from MeCab (e.g. アサゴハン)
   *     zh / yue — tone-marked pinyin/jyutping from Jieba (e.g. nǐ hǎo)
   *     ar — Buckwalter transliteration from Qalsadi (e.g. a:lssilaa:mu)
   *     fa — Latin transliteration via PersianG2p (e.g. salām, xubi)
   *
   *   romanize.py (script-level transliteration, all non-Latin scripts):
   *     ko — Revised Romanization (e.g. annyeonghaseyo)
   *     ru, bg, uk — Cyrillic→Latin (e.g. privet)
   *     el — Greek→Latin (e.g. kaliméra)
   *     hy — Armenian→Latin   ka — Georgian→Latin
   *     th — Paiboon+ learner romanization via thaiphon (e.g. sà-wàt-dii),
   *          syllable-separated with tone diacritics
   *
   * Absent (null/undefined) for languages where phonetics are suppressed
   * by isPhoneticsEligible() (packages/utils/src/language.ts):
   *   — All Latin-script languages (en, fr, de, es, vi, tr, sw, etc.)
   *     Reason: the native script is already readable to the learner.
   *   — Burmese (my)
   *     Reason: complex script with no reliable romanizer yet.
   *
   * IPA display on individual words was explored but deemed infeasible:
   *   — Dictionary phonetic_detail.ipa coverage is sparse and inconsistent
   *     across sources (CEDICT, EDICT, Wiktionary).
   *   — IPA is visually dense and distracting when shown on every word
   *     (unlike pinyin/furigana which use familiar Latin characters).
   *   — For the small subset of words with IPA data, showing it would
   *     create an inconsistent experience where some words have it and
   *     others don't, confusing learners.
   */
  pronunciation?: string;
  /**
   * Debugging aid: identifies which lemmatization pipeline stage
   * produced this token. Maps to the lemmatizeText() fallback chain
   * (SPEC-018). Only non-null when processed by the mobile tokenizer
   * (apps/mobile/lib/tokenizer.ts).
   *
   * Values:
   *   'server'        — POST /lemmatize-normalized (best accuracy)
   *   'ja-kuromoji'   — kuromoji + IPADIC (Japanese)
   *   'ko-kuromoji'   — kuromoji-ko + mecab-ko-dic (Korean)
   *   'dict-seg'      — dict-based max-matching (CJK/SEA)
   *   'lemma-table'   — downloaded lemma table SQLite
   *   'snowball'      — snowball-stemmers pure JS stemmer
   *   'arabic-stem'   — arabic-stem pure JS stemmer
   *   'surface'       — regex word-split + surface-as-lemma (last resort)
   */
  source?: TokenSource;
}

/** Identifies which lemmatization pipeline stage produced a token.
 *  See SPEC-018 Phase 1-3 for the full fallback chain. */
export type TokenSource =
  | 'server'
  | 'ja-kuromoji'
  | 'ko-kuromoji'
  | 'dict-seg'
  | 'lemma-table'
  | 'snowball'
  | 'arabic-stem'
  | 'surface';

export interface LemmatizeResponse {
  tokens: LemmatizedToken[];
}

/** Client-side token cache for video subtitles.
 *  Populated from GET /lemmatize-video-normalized and used to skip
 *  per-line /lemmatize-normalized API calls during playback. */
export interface TokenCache {
  get(text: string): LemmatizedToken[] | undefined;
  has(text: string): boolean;
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

/** Matches the Python backend's dictionary/autocomplete response format. */
export interface DictionaryAutocompleteResponse {
  results: DictionaryEntry[];
}

/** Response from GET /dictionary/download — two-tier bulk export. */
export interface DictionaryDownloadResponse {
  entries: DictionaryEntry[];
  /** Total entries available for the language (all entries, not just freq). */
  total: number;
  /** Number of entries with Zipf frequency data (Tier 1). */
  freq_count: number;
  /** Number of entries actually returned (min of total and limit). */
  downloaded: number;
  /** Whether total > downloaded (i.e., entries were trimmed to the cap). */
  capped: boolean;
  /** MD5 hash of the entries array — changes when the dictionary DB is rebuilt. */
  version: string;
}

/** Per-language metadata stored client-side in SQLite after a successful download. */
export interface DictMeta {
  l2: string;
  downloaded_at: string;
  entry_count: number;
  size_bytes: number;
  version: string;
}

/** Common base for all lexical lookup results — both curated dictionary entries
 *  and AI-generated ones. (ADR 0006) */
export interface LexicalEntry {
  /** Canonical/dictionary form of the word or phrase. */
  head: string;
  /** One or more definitions in the user's L1 (or English fallback). */
  definitions: string[];
  /** Phonetic guide in Latin script or IPA. */
  pronunciation: string;
  /** Proficiency level(s) if known. null or empty = unclassified. */
  levels?: ProficiencyLevel[] | null;
  /** Part of speech. Language-specific values. */
  part_of_speech?: string | null;
}

/** A proficiency level on a given grading scale.
 *
 *  `scale`  — the grading framework (e.g. `'hsk_2010'`, `'cefr'`, `'jlpt'`)
 *  `value`  — the scale-specific level (e.g. `3`, `'B1'`, `'N4'`)
 *  `numeric` — normalized 1–7 difficulty across all scales.
 *              1 = total beginner (HSK 1, CEFR A1, JLPT N5).
 *              7 = advanced/native (HSK 6–7, CEFR C2, JLPT N1).
 *              This is the common denominator for cross-scale comparisons
 *              and drives the "Hard Words Only" phonetics filter.
 *
 *  @typeParam Scale — narrow this to a literal union for known scales (e.g. `'hsk_2010' | 'cefr'`),
 *                     or leave as the default `string` for open-ended data. */
export interface ProficiencyLevel<Scale extends string = string> {
  scale: Scale;
  value: number | string;
  /** Normalized 1–7 difficulty. 1 = beginner, 7 = advanced/native. */
  numeric: number;
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
export interface DictionaryEntry extends LexicalEntry {
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
  /** How this entry was matched to the query. NOTE: 'llm' is not valid here — LLM entries use LlmGeneratedEntry. */
  match_type: 'exact' | 'lemma' | 'fuzzy' | 'definition' | null;

  // ── Optional metadata (levels, part_of_speech inherited from LexicalEntry) ──
  /** Narrowed scale union for curated dictionary entries. */
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
export interface LlmGeneratedEntry extends LexicalEntry {
  kind: 'llm';

  /** The model that generated this entry. */
  model: string;

  /** The sentence provided as context in the LLM prompt. */
  contextSentence?: string;

  // ── Frequency (looked up from tables, not LLM-generated) ──
  frequency?: number | null;
  frequencyLevel?: number | null;
}

// ── Lexical Item (ADR 0006) ───────────────────

/** Identity source for a LexicalItem — determines how display data is resolved. */
export type LexicalItemSource =
  | { kind: 'dictionary'; dictionaryId: string; entryId: string }
  | { kind: 'text'; text: string; llm: boolean };

/** Core user-data type. Represents a distinct vocabulary item (word, phrase, or
 *  expression) a user has encountered and optionally saved. Identity is derived
 *  from source, not a traditional DB ID. (ADR 0006) */
export interface LexicalItem {
  source: LexicalItemSource;
  /** ISO 639-1 code of the language this item belongs to. */
  l2: string;
  /** Cached dictionary entry (when source.kind === 'dictionary'). */
  canonicalEntry?: DictionaryEntry;
  /** Cached LLM-generated entry (when source.kind === 'text' && source.llm). */
  llmEntry?: LlmGeneratedEntry;
  /** Multi-language translations (when source.kind === 'text' && !source.llm). */
  translations?: Record<string, string[]>;
  /** Individual occurrences of this item in context. */
  instances?: Instance[];
}

/** A single occurrence of a LexicalItem in text. Captures surface form + context. */
export interface Instance {
  form: {
    /** The surface form as it appeared (may be inflected). */
    text: string;
    pronunciation?: string;
  };
  /** The surrounding sentence and where it came from. */
  context?: InstanceContext;
}

/** Describes where and how the user encountered a lexical item. */
export interface InstanceContext {
  sentence: {
    original: string;
    translation?: string;
  };
  origin?:
    | { kind: 'phrasebook'; phrasebookId: number }
    | { kind: 'note'; noteId: string; noteTitle: string }
    | { kind: 'video'; youtubeId: string; title: string; startTime: number };
}

/** A user's saved/bookmarked LexicalItem with save timestamp.
 *  This is the rich in-app model — not the DB serialization shape. */
export interface SavedLexicalItem {
  savedAt: number;
  item: LexicalItem;
}

// ── Phrasebook ────────────────────────────────

/** A curated collection of lexical items (ADR 0006).
 *  The special id 'saved' is used for the synthetic phrasebook built
 *  from a user's SavedLexicalItems. */
export interface Phrasebook {
  id: number | 'saved';
  title: string;
  description?: string;
  items: LexicalItem[];
  meta: {
    tvShow?: string;
    exactMatch?: boolean;
  };
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

/** @deprecated Use SubscriptionRecord + SubscriptionState instead. */
export interface Subscription {
  plan: 'free' | 'pro' | 'lifetime';
  expiresAt?: Date;
  autoRenew: boolean;
}

/** Raw subscription record from the Directus `subscriptions` collection.
 *  Matches the JSON returned by GET /user-subscription. */
export interface SubscriptionRecord {
  id: number;
  owner: number;
  type: 'monthly' | 'annual' | 'lifetime' | 'trial';
  expires_on: string | null; // ISO date string, null for lifetime
  payment_processor: 'stripe' | 'paypal' | 'app-store' | null;
  payment_customer_id: string | null;
  payment_id: string | null;
  payment_date: string | null;
  payment_email: string | null;
  status: string;
  notes: string | null;
}

/** Computed subscription state resolved by hooks/contexts from SubscriptionRecord. */
export interface SubscriptionState {
  sub: SubscriptionRecord | null;
  loaded: boolean;
  isPro: boolean; // lifetime = true, or expires_on > now
  planType: 'monthly' | 'annual' | 'lifetime' | 'trial' | null;
  isLifetime: boolean;
  isExpired: boolean;
  willAutoRenew: boolean;
  daysUntilExpiry: number | null;
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

/** A single occurrence of a saved lexical item — one surface form in one context.
 *  Replaces the flat `context` field with a per-occurrence model so the same
 *  word saved from multiple videos/phrases accumulates instances. */
export interface SavedLexicalItemInstance {
  /** Unix-ms timestamp when this specific instance was saved. */
  timestamp: number;
  /** Which surface form appeared in this context (may differ from the head form). */
  form: string;
  /** Where and how this occurrence was encountered. */
  context: SavedWordContext;
}

/** A single row in the `saved_words` JSON blob synced to Directus
 *  `user_data.saved_words`. This is the minimal serialization shape —
 *  only the fields needed for sync and offline storage. The rich
 *  app model is `LexicalItem` (wrapped by `SavedLexicalItem`).
 *
 *  Multi-instance support (ADR 0006 §Lexical Item):
 *  - `instances[]` is the source of truth for occurrences (each with its own form + context).
 *  - `context` is kept for backward compatibility — written as `instances[0].context`
 *    so old clients can still read it. New code should use `normalizeInstances()`. */
export interface SavedLexicalItemRecord {
  /** Dictionary entry ID (e.g., "cedict-0", "llm-zh-abc123") */
  id: string;
  /** All forms of the word — head form + all inflected/conjugated forms.
   *  Populated at save time via the /inflect-* Python endpoints.
   *  Global across instances — used for word-highlighting lookup. */
  forms: string[];
  /** Unix-ms timestamp of the FIRST save. */
  date: number;
  /** @deprecated Single context — legacy. Use `instances` instead.
   *  Still written for backward compatibility (= instances[0].context).
   *  Optional because legacy Classic data may not include it. */
  context?: SavedWordContext;
  /** Multiple occurrences, each with its own surface form and context.
   *  When present, this is the source of truth. When absent, `context`
   *  is normalized into a single-element array by `normalizeInstances()`. */
  instances?: SavedLexicalItemInstance[];
}

/** Top-level `saved_words` storage shape, keyed by L2 ISO 639-1 code.
 *  This is what gets serialized to localStorage and the Directus column. */
export type SavedLexicalItemStore = Record<string, SavedLexicalItemRecord[]>;

/** Per-L2 learning progress entry. Mirrors Classic's zthProgress shape. */
export interface L2Progress {
  /** Proficiency level (1–7 numeric). Stored as number but some legacy data uses strings (e.g. `"4"`). */
  level?: number | string;
  /** Total time studying this language, in milliseconds. */
  time?: number;
  /** Hours studied (rare — mostly from very old Classic data). */
  hours?: number;
  /** Weekly study hours goal/target set by the user. */
  weeklyHours?: number;
}

/** Per-L2 learning progress store, keyed by ISO 639-1 code.
 *  Some legacy entries may be `null` instead of an object. */
export type ProgressStore = Record<string, L2Progress | null>;

/** Directus user_data record shape (partial — only the fields we sync). */
export interface UserDataRecord {
  id: string | number;
  saved_words: string;  // JSON.stringify(SavedLexicalItemStore)
  progress?: string;    // JSON.stringify(ProgressStore)
  srs_progress?: string;  // JSON.stringify(SrsProgressStore)
}

/**
 * FSRS card fields persisted by web/mobile (SPEC-066).
 *
 * This is the full serialized ts-fsrs `Card` (dates as Unix ms) plus app
 * bookkeeping. The deprecated SM-2 fields (`ease`, `interval`,
 * `repetitions`, `nextReview`) are written on every card for the legacy-client
 * compatibility window (Phase 0 decision) and ignored by new code.
 */
export interface SrsFields {
  /** Store schema version for this card; legacy cards are normalized to 2. */
  v: 2;
  /** ts-fsrs `State` enum value (0 New, 1 Learning, 2 Review, 3 Relearning). */
  state: number;
  /** Unix-ms timestamp when the card is next due. */
  due: number;
  /** FSRS stability (days). */
  stability: number;
  /** FSRS difficulty. */
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  /** Lifetime review count. */
  reps: number;
  /** Times a review card failed and entered relearning. */
  lapses: number;
  /** Unix-ms timestamp of the last ts-fsrs review (null for new cards). */
  last_review: number | null;
  /** Unix-ms timestamp of the last rating — app LWW merge key. */
  lastReview: number;
  /** Unix-ms timestamp of card creation (new-deck budgeting). */
  createdAt: number;
  /** Deprecated SM-2 fields, written for old clients only. */
  ease: number;
  interval: number;
  repetitions: number;
  nextReview: number;
  /** Client-generated id of the last interactive rating (backend cap log). */
  ratingId?: string;
  /** Rating key of the last interactive rating. */
  rating?: 'again' | 'hard' | 'good' | 'easy';
  /** Rating id being voided by this write (undo restore). */
  voidRatingId?: string;
}

/**
 * Top-level SRS progress store shape.
 * Stored in localStorage/SecureStore under 'zthSrsProgress' and synced to
 * Directus srs_progress column.
 *
 * Cards are keyed by l2Code → wordId → SrsFields. `v: 2` marks a migrated
 * FSRS store; legacy stores are migrated on read.
 */
export interface SrsProgressStore {
  v?: 2;
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

  /** Subtitle/corpus search (global). */
  search: SearchSettings;

  /** Per-L2 settings, keyed by ISO 639-1 code. Missing keys → L2_DEFAULTS. */
  l2: Record<string, L2Settings>;

  /** Last-used L1/L2 pair, synced across devices (SPEC-086/ARCH-019 language
   *  restoration). Written on every language change; read after login to land
   *  the learner back on the pair they last used instead of a fresh
   *  /language-select. Absent → the user has never used Language Player. */
  languagePair?: LastLanguagePair;
}

/** The learner's last-used L1/L2 pair, reconstructed with its timestamp so a
 *  later write on another device wins (LWW). */
export interface LastLanguagePair {
  l1: string;
  l2: string;
  updatedAt: string;
}

// ── Global ─────────────────────────────────────

export interface TokenizedTextSettings {
  /** Whether tapping a word opens the popup dictionary. (Inverse of Classic's disableAnnotation.) */
  enabled: boolean;

  /** Text size: 0 (smallest) to 7 (largest). */
  zoom: number;

  /** Font for L2 text. */
  typeFace: 'default' | 'serif' | 'sans-serif';

  /** Line-height multiplier for L2 text (1–2). Default 1.625 (relaxed). */
  leading: number;

  /** `normal` = show all words; `quiz` = blank out saved words for self-testing. */
  mode: 'normal' | 'quiz';

  /** Show first definition inline for saved/bookmarked words. */
  quickGloss: boolean;

  /** Translation text size as a ratio of the L2 tokenized text size (0.5–1).
   *  Applied wherever a side-by-side/subtitle translation is shown. */
  translationSize: number;
}

export interface DisplaySettings {
  /** `light` | `dark` | `system` — follows OS preference when `system`. */
  theme: 'light' | 'dark' | 'system';
  /** Show L1 translation lines alongside L2 text. */
  translation: boolean;
  /** Fraction (0–1) of the side-by-side row width given to the L2 tokenized
   *  text column, the remainder going to the translation column. 0.6 matches
   *  the legacy 3:2 `flex-[3]`/`flex-[2]` split. Used by the readers' resizable
   *  text|translation splitter. */
  translationSplit: number;
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
  /** Collapse the video player to a mini player when scrolling the transcript.
   *  NOT ACTIVELY USED — the web player delegates to YouTube's embedded controls,
   *  so collapsing the video player is not currently implemented. */
  collapsedVideo: boolean;
  /** `subtitles` = one line at a time, synced to video; `transcript` = full scrollable transcript. */
  transcriptMode: 'subtitles' | 'transcript';
}

export interface ReviewSettings {
  /**
   * Max new SRS cards introduced per day.
   *
   * The SETTING is global — one number shared across all languages (set to 50
   * means 50 for every L2). But it's ENFORCED per language: each L2's review
   * deck gets its own allowance of `dailyNewLimit` new cards per day, computed
   * against that language's cards only. Russian having more cards never reduces
   * Japanese's budget — the budgets don't share a pool.
   */
  dailyNewLimit: number;
  /**
   * Local hour (0–23) at which a new review day starts (Anki "next day
   * starts at"; default 4 AM). The new-card budget and the free-review
   * counter roll over at this hour in the device's local timezone.
   */
  dayStartHour: number;
}

export interface SearchSettings {
  /** Expand subtitle search from the fast default (50 hits) to the full
   *  maximum (500 hits). Matches Classic's "Limit 'this word in TV Shows'
   *  search result (faster)" setting. */
  expandSubsSearch: boolean;
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
     * `ruby`  — annotation above characters (pinyin on hanzi, furigana on kanji,
     *            romanization above Cyrillic / Greek / Thai / hangul).
     * `word`  — show ONLY phonetics, hide the original script.
     * `false` — hidden entirely. Also forced for languages where phonetics are
     *            suppressed: all Latin-script languages (en, fr, de, vi, tr, sw,
     *            etc.) and Burmese (my). See isPhoneticsEligible() in
     *            @langplayer/utils.
     */
    show: 'ruby' | 'word' | false;
    /**
     * `always`    — on every word
     * `hardWords` — only on words at or above the user's proficiency level.
     *                When `show` is `'word'`, easy words stay in the original script;
     *                hard words are replaced with phonetics. When `show` is `'ruby'`,
     *                only hard words get ruby annotations. When `show` is `false`,
     *                this field has no effect (nothing is shown regardless).
     *
     *                A word is considered "hard" when:
     *                 1. `levels[].numeric` ≥ user's level, OR
     *                 2. `frequencyLevel` ≥ user's level, OR
     *                 3. The entry is cached but has NO levels AND NO
     *                    frequencyLevel — unknown words are treated as
     *                    hard so the learner gets help.
     *
     *                Words not yet in cache are NOT shown (wait for
     *                the async bulk lookup to complete).
     */
    conditions: 'always' | 'hardWords';
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
  leading: 1.625,
  mode: 'normal',
  quickGloss: true,
  translationSize: 0.8,
};

export const DISPLAY_DEFAULTS: DisplaySettings = {
  theme: 'dark',
  translation: true,
  translationSplit: 0.6,
};

export const PLAYBACK_DEFAULTS: PlaybackSettings = {
  speed: 1.0,
  autoPause: false,
  karaokeMode: true,
  smoothScroll: false,
  collapsedVideo: false,
  transcriptMode: 'transcript',
};

export const REVIEW_DEFAULTS: ReviewSettings = {
  dailyNewLimit: 20,
  dayStartHour: 4,
};

export const SEARCH_DEFAULTS: SearchSettings = {
  expandSubsSearch: false,
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

/** Factory: create a fresh settings object with all defaults.
 *
 *  The default `ts` is the EPOCH, not "now": a freshly created defaults blob
 *  must never look like the latest write. The apps hydrate from the cloud row
 *  with ts-based last-write-wins (`cloud.ts > local.ts` wins), so when local
 *  storage is absent or was wiped (logout wipe, cleared browser storage, new
 *  device, app reinstall) the fresh defaults must LOSE to the user's cloud
 *  copy — otherwise every such boot shows defaults and the next change
 *  overwrites the saved settings. A real settings change stamps a new `ts`,
 *  so the epoch value only ever surfaces for placeholder/fresh state.
 */
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
    ts: new Date(0).toISOString(),
    tokenizedText: { ...TOKENIZED_TEXT_DEFAULTS },
    display: { ...DISPLAY_DEFAULTS },
    playback: { ...PLAYBACK_DEFAULTS },
    review: { ...REVIEW_DEFAULTS },
    search: { ...SEARCH_DEFAULTS },
    l2,
  };
}

/** Merge a stored/cloud SettingsV2 onto the defaults so older blobs (e.g.
 *  before the `search` section existed) still load with all fields present. */
export function normalizeSettingsV2(
  raw: Partial<SettingsV2> | null | undefined,
): SettingsV2 {
  const base = createSettingsV2();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    v: 2 as const,
    ts: raw.ts ?? base.ts,
    tokenizedText: { ...base.tokenizedText, ...(raw.tokenizedText ?? {}) },
    display: { ...base.display, ...(raw.display ?? {}) },
    playback: { ...base.playback, ...(raw.playback ?? {}) },
    review: { ...base.review, ...(raw.review ?? {}) },
    search: { ...base.search, ...(raw.search ?? {}) },
    l2: raw.l2 ?? base.l2,
    languagePair: raw.languagePair ?? base.languagePair,
  };
}

// ── Sketch Engine corpus (ARCH-020) ────────────────────────────────
// Cleaned responses from the Flask `/sketch-engine/*` endpoints, ready to
// render. See `docs/arch/020-sketch-engine-architecture.md`.

/** One collocation word inside a word-sketch grammatical-relation group. */
export interface SketchCollocationWord {
  word: string;
  /** Collocation measure label (may contain the POS-tag pattern, e.g. "知识 学习"). */
  cm: string;
  score: number;
  count: number;
}

/** A grammatical-relation group (e.g. "Object") of collocating words. */
export interface SketchCollocationGramrel {
  name: string;
  /** Display label with `{word}` substituted for the queried term. */
  description: string;
  count: number;
  score: number;
  words: SketchCollocationWord[];
}

/** GET /sketch-engine/collocations?word=&l2= */
export interface SketchCollocationsResponse {
  word: string;
  corpname: string;
  from: 'cache' | 'live';
  gramrels: SketchCollocationGramrel[];
}

/** One concordance example sentence (with optional parallel translation). */
export interface SketchExample {
  /** L2 sentence: left context + highlighted keyword + right context. */
  l2: string;
  /** Parallel L1 translation, present when the corpus is aligned. */
  l1?: string;
  /** First reference (source attribution) of the sentence. */
  ref?: string;
}

/** GET /sketch-engine/examples?word=&l2=&l1= */
export interface SketchExamplesResponse {
  word: string;
  corpname: string;
  parallel: boolean;
  from: 'cache' | 'live';
  examples: SketchExample[];
}

/** One thesaurus entry (related word). */
export interface SketchRelatedWord {
  word: string;
  score: number;
  freq: number;
}

/** GET /sketch-engine/thesaurus?word=&l2= */
export interface SketchThesaurusResponse {
  word: string;
  corpname: string;
  from: 'cache' | 'live';
  related: SketchRelatedWord[];
}

/** One Chinese learner-corpus mistake (guangwai corpus). */
export interface SketchMistake {
  /** Sentence part before the mistaken word. */
  left: string;
  /** Sentence part after the mistaken word. */
  right: string;
  /** Context before the sentence. */
  leftContext: string;
  /** Context after the sentence. */
  rightContext: string;
  /** Full sentence: left + word + right. */
  text: string;
  /** Learner's country (ISO2 code + name), when identifiable. */
  country: { code: string; name: string | null } | null;
  /** Learner proficiency: beginner | intermediate | advanced. */
  proficiency?: string;
  /** Error category (e.g. "orthography", "word choice"). */
  errorType?: string;
  /** Error sub-category (from the same errors map). */
  errorLevel?: string;
  /** Learner's native language code. */
  l1?: string;
}

/** GET /sketch-engine/mistakes?word= */
export interface SketchMistakesResponse {
  word: string;
  corpus: string;
  from: 'cache' | 'live';
  mistakes: SketchMistake[];
}

/** One corpus from the Sketch Engine CA corpus list (ARCH-020 §3). */
export interface SketchCorpus {
  corpname: string;
  /** Human-readable display name (e.g. "Chinese Web 2021 (zhTenTen21)"). */
  name: string;
  /** BCP 47 locale string (e.g. "zh-Hans", "zh-Hant"). */
  language_id: string;
  language_name?: string;
  is_featured?: boolean;
  /** Parallel-alignment target languages when the corpus is aligned. */
  aligned?: string[];
  tags?: string[];
  info?: string;
  sizes?: { wordcount?: number };
}

/** GET /sketch-engine/corpora */
export interface SketchCorporaResponse {
  data: SketchCorpus[];
  from: 'cache' | 'live';
  fetched_at: string;
}
