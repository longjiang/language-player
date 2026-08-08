/**
 * Mobile Local Tokenization & Lemmatization
 *
 * Single entry point for all tokenization and lemmatization on mobile.
 *
 * Pipeline: in-memory cache → server (3s timeout, always preferred) → local fallback
 *
 * See SPEC-018 for full design:
 *   docs/specs/018-local-tokenization-mobile.md
 *
 * Phase 1 — Zero-Cost Baseline:
 *   - Regex word-split (all 207 languages)
 *   - Surface-as-lemma (~166 languages with no inflections)
 *   - arabic-stem integration (Arabic, ~85% coverage)
 *   - Server POST /lemmatize-normalized as primary (3s timeout)
 *
 * Phase 2a — Snowball Stemmers + Lemma Tables:
 *   - snowball-stemmers (pure JS, ~25 KB per language, bundled)
 *   - Downloaded lemma tables ({surface → [lemma]} stored in SQLite)
 *   - Extended fallback: lemma table → snowball → arabic-stem → surface
 *
 * Phase 2b — Dict-Based Segmentation (CJK + SEA scriptio continua):
 *   - Forward maximum matching using offline dictionary headwords
 *   - Word set includes both simplified heads and traditional alternates so
 *     both scripts segment the same way (script conversion stays at the
 *     render layer, per ADR-0019)
 *   - Covers Chinese varieties (zh, cmn, yue, nan, ...) + Thai, Khmer,
 *     Burmese, Lao, Tibetan (th, km, my, lo, bo)
 *   - ~90% accuracy for Chinese (cedict, 30K entries)
 *   - Falls back to regex word-split if offline dict not downloaded
 *   - No npm dependencies — reuses SPEC-013 offline dictionary SQLite
 *
 * Phase 2c — kuromoji (Japanese, full morphological analysis):
 *   - Pure JS bundled engine (~200 KB), downloaded IPADIC data pack (~3 MB)
 *   - Handles both segmentation and lemmatization in one call
 *   - Custom RN loader reads .dat.gz from device filesystem via expo-file-system
 *   - Falls back to regex + surface-as-lemma if data pack not downloaded
 *   - npm dependency: kuromoji (engine), fflate (zip extraction), pako (gzip)
 *
 * Phase 2d — kuromoji-ko (Korean, full morphological analysis):
 *   - Pure TS bundled engine (~200 KB), downloaded mecab-ko-dic data pack (~2 MB)
 *   - Same custom RN loader pattern as Phase 2c
 *   - Inline shim classes for DynamicDictionaries internals (kuromoji-ko is tsup-bundled)
 *   - Token lemma extracted from kuromoji-ko's expression field (e.g., '먹/VV+었/EP+다/EF')
 *   - npm dependency: kuromoji-ko (engine), doublearray (trie), pako (gzip)
 */

import Stemmer from 'arabic-stem';
import Snowball from 'snowball-stemmers';
import { PYTHON_API_URL } from '@/lib/api-url';
import { TOKENIZER_CONFIG } from '@langplayer/shared';
import type { LemmatizedToken, TokenizerConfig } from '@langplayer/shared';
import { log, logwarn } from '@/lib/logger';
import { isOfflineModeEnabled } from '@/lib/offline-mode';
import {
  tokenizeDictSegInWorker,
  tokenizeJapaneseInWorker,
} from '@/lib/tokenizer-worker';
import { cleanJapaneseLemma } from '@/lib/japanese-lemma';
import { romanize, ROMANIZABLE_LANGS } from '@/lib/romanize';

const arabicStemmer = new Stemmer();

// ── Shared in-memory cache ──────────────────────────────────────────
// All callers share this Map, so if two components render the same text,
// only one server call is made. Keyed by `${l2}:${text}`.
const lemmatizeCache = new Map<string, LemmatizedToken[]>();

/**
 * LRU-aware cache setter — evicts oldest entry when at capacity.
 * Re-inserts on get to maintain LRU ordering via Map insertion order.
 */
const MAX_LEMMATIZE_CACHE = 2000; // ~2–10 MB worst case

function cacheSet(key: string, value: LemmatizedToken[]): void {
  if (lemmatizeCache.size >= MAX_LEMMATIZE_CACHE) {
    const firstKey = lemmatizeCache.keys().next().value;
    if (firstKey !== undefined) lemmatizeCache.delete(firstKey);
  }
  lemmatizeCache.set(key, value);
}

function cacheGet(key: string): LemmatizedToken[] | undefined {
  const value = lemmatizeCache.get(key);
  if (value !== undefined) {
    // Re-insert to promote to most-recent (LRU via Map insertion order)
    lemmatizeCache.delete(key);
    lemmatizeCache.set(key, value);
  }
  return value;
}

// ── In-flight request deduplication ─────────────────────────────────
// Prevents thundering herd when many components mount simultaneously
// and all miss the cache for the same text.
const lemmatizeInflight = new Map<string, Promise<LemmatizedToken[]>>();

// ── Tokenization ────────────────────────────────────────────────────

/**
 * Yield to the UI thread so long synchronous tokenization work can be
 * time-sliced (keeps scrolling/rendering responsive on long paragraphs).
 */
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Split text into word tokens using a regex.
 * Works for all space-separated languages (Category A, B, D, E in ARCH-018).
 *
 * Pattern: /[\w']+|[^\w\s']+/g
 * - `[\w']+` — word characters plus apostrophes (for contractions: don't, l'avion)
 * - `[^\w\s']+` — non-word, non-space, non-apostrophe characters (punctuation)
 */
function tokenizeWords(text: string): string[] {
  const matches = text.match(/[\w']+|[^\w\s']+/g);
  return matches ?? [];
}

// ── Dict-Based Segmentation (Phase 2b) ──────────────────────────────
// Forward maximum matching using offline dictionary headwords.
// Used for CJK, Thai, Khmer, Burmese, Lao, Tibetan where words are
// not space-separated. Reuses the SPEC-013 offline dictionary SQLite.

/** In-memory cache of dict headword sets keyed by L2 code. */
const dictWordSets = new Map<string, Set<string>>();
const dictMaxWordLen = new Map<string, number>();
const dictPosByWord = new Map<string, Map<string, string>>();

/**
 * Load the dictionary headword set for a language from the offline
 * dictionary SQLite database. Caches in memory for subsequent calls.
 *
 * Returns null if the dictionary is not downloaded for this language.
 */
async function loadDictWordSet(l2: string): Promise<{
  wordSet: Set<string>;
  maxWordLen: number;
  posByWord: Map<string, string>;
} | null> {
  // Check memory cache first
  const cached = dictWordSets.get(l2);
  if (cached) {
    return {
      wordSet: cached,
      maxWordLen: dictMaxWordLen.get(l2) ?? 5,
      posByWord: dictPosByWord.get(l2) ?? new Map(),
    };
  }

  try {
    const { openOfflineDictionaryDB, openDictionaryDB } = await import('@/lib/dictionary-db');
    // Precompiled per-language files first; legacy central tables as fallback.
    let l2Db: Awaited<ReturnType<typeof openOfflineDictionaryDB>> | null = null;
    try {
      l2Db = await openOfflineDictionaryDB(l2);
    } catch {
      l2Db = null;
    }
    const db = l2Db ?? (await openDictionaryDB());
    const table = `dict_${l2.replace(/-/g, '_')}`;
    // part_of_speech is optional (not present in current zh downloads) —
    // probe defensively and fall back to the head/alternate query.
    let rows: Array<{ head: string; part_of_speech: string | null }>;
    try {
      rows = await db.getAllAsync<{ head: string; part_of_speech: string | null }>(
        // head = simplified form (zh), alternate = traditional form (zh/yue).
        // UNION dedupes across both scripts.
        `SELECT head, part_of_speech FROM ${table} WHERE head != ''
         UNION
         SELECT alternate, part_of_speech FROM ${table} WHERE alternate IS NOT NULL AND alternate != ''`,
      );
    } catch {
      rows = await db.getAllAsync<{ head: string; part_of_speech: string | null }>(
        `SELECT head FROM ${table} WHERE head != ''
         UNION
         SELECT alternate FROM ${table} WHERE alternate IS NOT NULL AND alternate != ''`,
      );
    }
    if (!rows || rows.length === 0) return null;

    const wordSet = new Set<string>();
    const posByWord = new Map<string, string>();
    let maxWordLen = 1;
    for (const row of rows) {
      if (!wordSet.has(row.head)) {
        wordSet.add(row.head);
        if (row.part_of_speech) posByWord.set(row.head, row.part_of_speech);
      }
      if (row.head.length > maxWordLen) maxWordLen = row.head.length;
    }

    // Evict oldest language if at capacity (keep only last 3 to cap at ~3–6 MB)
    if (dictWordSets.size >= 3) {
      const firstKey = dictWordSets.keys().next().value;
      if (firstKey !== undefined) {
        dictWordSets.delete(firstKey);
        dictMaxWordLen.delete(firstKey);
        dictPosByWord.delete(firstKey);
      }
    }

    dictWordSets.set(l2, wordSet);
    dictMaxWordLen.set(l2, maxWordLen);
    dictPosByWord.set(l2, posByWord);
    return { wordSet, maxWordLen, posByWord };
  } catch {
    // Table doesn't exist (dict not downloaded) or DB error
    return null;
  }
}

/**
 * Forward maximum matching word segmentation.
 *
 * At each position in the text, find the longest dictionary word that
 * starts at that position. If no match, emit a single-character token.
 *
 * This is the same core algorithm used by jieba (Chinese tokenizer) —
 * without the HMM layer for unknown words (~+5% accuracy). If the
 * missing ~5% proves insufficient, we can explore WASM jieba or a
 * lightweight HMM in pure JS using bigram frequencies.
 *
 * @param text - The text to segment
 * @param wordSet - Set of known dictionary headwords
 * @param maxWordLen - Maximum word length in the dictionary
 * @returns Promise of segmented tokens (async so long text can yield to the UI)
 */
async function maxMatchSegment(text: string, wordSet: Set<string>, maxWordLen: number): Promise<string[]> {
  const result: string[] = [];
  let i = 0;
  let charsSinceYield = 0;
  while (i < text.length) {
    // Group ASCII letters/digits into one token (ISBN, 978, URLs) instead of
    // emitting char-by-char tokens — matches the online jieba output and keeps
    // the tokenized rendering from looking spaced out.
    if (/[A-Za-z0-9]/.test(text[i]!)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9]/.test(text[j]!)) j++;
      result.push(text.slice(i, j));
      i = j;
      continue;
    }
    let longestMatch = text[i]!;
    const searchEnd = Math.min(i + maxWordLen, text.length);
    for (let len = searchEnd - i; len >= 1; len--) {
      const candidate = text.slice(i, i + len);
      if (wordSet.has(candidate)) {
        longestMatch = candidate;
        break;
      }
    }
    result.push(longestMatch);
    i += longestMatch.length;
    charsSinceYield += longestMatch.length;
    // Time-slice: let the UI breathe between chunks of long text.
    if (charsSinceYield >= 200) {
      charsSinceYield = 0;
      await yieldToUI();
    }
  }
  return result;
}

/**
 * Segment text using the best available method for the language.
 *
 * For languages with `needsDictSegmentation` (CJK, Thai, Khmer, etc.):
 *   1. Try offline dictionary headword set → maxMatchSegment
 *   2. Fall back to regex word-split (tokenizeWords)
 *
 * For all other languages:
 *   1. Regex word-split (always available)
 */
async function segmentText(text: string, l2: string, config: TokenizerConfig | undefined): Promise<string[]> {
  // Phase 2b: Dict-based segmentation for CJK/SEA languages
  if (config?.needsDictSegmentation) {
    const dictData = await loadDictWordSet(l2);
    if (dictData) {
    log(`[lemmatize] 📖 DICT-SEG l2=${l2} words=${dictData.wordSet.size} maxLen=${dictData.maxWordLen}`);
      return await maxMatchSegment(text, dictData.wordSet, dictData.maxWordLen);
    }
    log(`[lemmatize] 📖 DICT-MISS l2=${l2} → falling to regex`);
  }

  // Default: regex word-split (works for all space-separated languages)
  log(`[lemmatize] 📝 REGEX-SPLIT l2=${l2} text="${text.slice(0, 50)}…"`);
  return tokenizeWords(text);
}

// ── Lemmatization strategies ───────────────────────────────────────

/**
 * Each token is its own lemma (surface-as-lemma).
 *
 * For languages where the inflected form equals the base form
 * (Chinese, Vietnamese, Thai, etc.) or as a last-resort fallback
 * for all languages when no other strategy is available.
 */
function surfaceAsLemma(tokens: string[]): LemmatizedToken[] {
  return tokens.map((t) => ({
    text: t,
    lemmas: [{ lemma: t }],
    source: 'surface',
  }));
}

/**
 * Arabic lemmatization using arabic-stem (pure JS, ~15 KB).
 * Covers ~85% of forms via suffix stripping + pattern matching.
 *
 * Falls back to surface-as-lemma on any stemmer error.
 */
function lemmatizeArabic(words: string[]): LemmatizedToken[] {
  return words.map((t) => {
    try {
      const result = arabicStemmer.stem(t);
      const stem = result.stem?.[0];
      return {
        text: t,
        lemmas: [{ lemma: stem || t }],
        pronunciation: result.normalized !== t ? result.normalized : undefined,
        source: 'arabic-stem',
      };
    } catch {
      return { text: t, lemmas: [{ lemma: t }], source: 'arabic-stem' };
    }
  });
}

// ── Snowball stemmer singleton ───────────────────────────────────────
// Lazily-initialized stemmers, one per language. snowball-stemmers
// are pure JS (~25 KB each, bundled at build time) — no data files.

const snowballStemmers = new Map<string, (word: string) => string>();

/** Suppletive Korean honorific lemmas (ARCH-018 kuromoji-ko table):
 *  드시다 (honorific of 먹다) canonicalizes to 들다, not 드시다. */
const KO_SUPPLETIVE_LEMMAS: Record<string, string> = {
  드시: '들다',
};

function getSnowballStemmer(snowballCode: string): (word: string) => string {
  let stemmer = snowballStemmers.get(snowballCode);
  if (!stemmer) {
    const instance = Snowball.newStemmer(snowballCode);
    stemmer = (word: string) => instance.stem(word);
    snowballStemmers.set(snowballCode, stemmer);
  }
  return stemmer;
}

// ── Local lemmatization (offline fallback) ───────────────────────────

/**
 * Apply the full local (offline) lemmatization chain for a batch of words.
 *
 * Per-word fallback order:
 *   1. Lemma table SQLite lookup (if hasLemmaTable and table is downloaded)
 *   2. Snowball stemmer (if snowballCode is configured)
 *   3. arabic-stem (if l2 === 'ar')
 *   4. Surface form as lemma (always available)
 *
 * On first call for a language, fires a background download of the lemma
 * table if one is configured but not yet downloaded. Subsequent calls
 * benefit from the downloaded table.
 *
 * POS note: lemma-table / snowball / surface paths have no local POS source,
 * so their lemmas carry no `part_of_speech` (equivalent to the server's
 * `''` for LemmatizationList/fallback). POS parity only applies where the
 * engine itself provides tags (kuromoji ja/ko, dictionary sidecar for zh).
 */
async function lemmatizeLocal(
  words: string[],
  l2: string,
  config: TokenizerConfig | undefined,
): Promise<LemmatizedToken[]> {
  // Fast path: no config at all → surface-as-lemma for everything
  if (!config) {
    log(`[lemmatize] 🏷️ SURFACE-AS-LEMMA l2=${l2} words=${words.length} (no config)`);
    return surfaceAsLemma(words);
  }

  // Track which strategy resolved each word (for logging)
  let tableHits = 0;
  let snowballHits = 0;

  // Check if lemma table is downloaded (non-blocking — if it's not ready
  // yet, we fall through to snowball/surface on this call).
  let tableReady = false;
  if (config.hasLemmaTable) {
    try {
      const { hasLemmaTable } = await import('@/lib/tokenizer-db');
      tableReady = await hasLemmaTable(l2);
    } catch {
      // DB not open or error — proceed without table
    }
  }

  // Pre-warm lemma table lookups if available (batch for efficiency)
  let lemmaMap: Map<string, string[]> | null = null;
  if (tableReady) {
    try {
      // One SQLite query per chunk instead of one async round-trip per word.
      const { lookupLemmasBatch } = await import('@/lib/tokenizer-db');
      const results = await lookupLemmasBatch(l2, words);
      if (results.size > 0) lemmaMap = results;
    } catch {
      // Table query failed — fall through to snowball/surface.
    }
  }

  // Get snowball stemmer if configured
  const stemmer = config.snowballCode
    ? getSnowballStemmer(config.snowballCode)
    : null;

  // Process each word through the fallback chain
  const result = words.map((word) => {
    // 1. Lemma table
    if (lemmaMap?.has(word)) {
      tableHits++;
      return {
        text: word,
        lemmas: lemmaMap.get(word)!.map((l) => ({ lemma: l })),
        source: 'lemma-table' as const,
      };
    }

    // 2. Snowball stemmer
    if (stemmer) {
      try {
        const stem = stemmer(word);
        if (stem && stem !== word) {
          snowballHits++;
          return { text: word, lemmas: [{ lemma: stem }], source: 'snowball' as const };
        }
      } catch {
        // Stemmer error — fall through
      }
    }

    // 3. Arabic stemmer (Phase 1)
    if (l2 === 'ar') {
      return lemmatizeArabic([word])[0]!;
    }

    // 4. Surface as lemma
    return { text: word, lemmas: [{ lemma: word }], source: 'surface' as const };
  });

  // Attach romanization for the non-Latin scripts the server romanizes
  // (ko/ru/bg/uk/el/hy/ka) so offline tokens match online output. Word
  // tokens only — non-word tokens keep `lemmas: []` and no pronunciation.
  const romanizer = ROMANIZABLE_LANGS.has(l2) ? (word: string) => romanize(word, l2) : null;
  const romanized = romanizer
    ? result.map((t) => {
        if (t.lemmas.length === 0) return t;
        const pron = romanizer(t.text);
        return pron ? { ...t, pronunciation: pron } : t;
      })
    : result;

  const stemmed = romanized.filter(t => t.lemmas[0]?.lemma !== t.text).length;
  const sample = romanized.filter(t => t.lemmas[0]?.lemma !== t.text).slice(0, 10)
    .map(t => `${t.text}→${t.lemmas[0]?.lemma}`).join(', ');
  log(`[lemmatize] 🏷️ LOCAL-DONE l2=${l2} words=${romanized.length} stemmed=${stemmed} table=${tableHits} snowball=${snowballHits} sample="${sample}"`);

  return romanized;
}

// Track which languages we've already attempted background download for,
// plus the timestamp of the last attempt (for retry on failure).
const lemmaDownloadState = new Map<string, number>();

/** Retry failed lemma table downloads after this many ms. */
const LEMMA_DOWNLOAD_RETRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fire-and-forget background download of lemma table.
 * Called on first local fallback invocation for a language.
 * Retries after LEMMA_DOWNLOAD_RETRY_MS on previous failure.
 */
function backgroundDownloadLemmaTable(l2: string, apiUrl: string): void {
  const lastAttempt = lemmaDownloadState.get(l2);
  if (lastAttempt !== undefined && Date.now() - lastAttempt < LEMMA_DOWNLOAD_RETRY_MS) {
    return;
  }
  lemmaDownloadState.set(l2, Date.now());

  // Don't await — fire and forget
  import('@/lib/tokenizer-db').then(({ downloadLemmaTable }) => {
    downloadLemmaTable(l2, apiUrl, 50000).catch(() => { /* silent */ });
  });
}

/**
 * Fetch tokens from the server with a 3-second timeout.
 *
 * The server (POST /lemmatize-normalized) has the best accuracy —
 * it uses language-specific lemmatizers (MeCab, Jieba, Qalsadi, etc.)
 * and handles both tokenization and lemmatization in one call.
 *
 * Returns null on any failure (network error, timeout, non-2xx) —
 * the caller is expected to fall through to local fallback.
 */
async function lemmatizeFromServer(
  text: string,
  l2: string,
  signal?: AbortSignal,
): Promise<LemmatizedToken[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  const shortText = text.length > 50 ? text.slice(0, 50) + '…' : text;

  log(`[lemmatize] 🔵 REQ l2=${l2} text="${shortText}"`);

  try {
    const combinedSignal = signal
      ? anySignal(signal, controller.signal)
      : controller.signal;

    const response = await fetch(`${PYTHON_API_URL}/lemmatize-normalized`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, l2 }),
      signal: combinedSignal,
    });
    if (!response.ok) {
      log(`[lemmatize] ❌ HTTP ${response.status} l2=${l2} text="${shortText}"`);
      return null;
    }
    const data = await response.json();
    const tokens = (data.tokens ?? []) as LemmatizedToken[];
    const wordTokens = tokens.filter(t => t.lemmas.length > 0);
    const lemmaSample = wordTokens.slice(0, 10).map(t => `${t.text}→${t.lemmas[0]?.lemma}`).join(', ');
    log(`[lemmatize] ✅ RES l2=${l2} total=${tokens.length} words=${wordTokens.length} lemmas="${lemmaSample}"`);
    return tokens.map((t) => ({ ...t, source: 'server' as const }));
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      log(`[lemmatize] ⏰ TIMEOUT l2=${l2} text="${shortText}"`);
    } else {
      log(`[lemmatize] ❌ ERR l2=${l2} text="${shortText}"`, e?.message ?? e);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── AbortSignal combiner ────────────────────────────────────────────

/**
 * Combine multiple AbortSignals into one.
 * The returned signal aborts when any of the input signals abort.
 * This allows the component's AbortSignal (from useEffect cleanup)
 * to cancel the server request alongside the internal 3s timeout.
 */
function anySignal(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return controller.signal;
    }
    sig.addEventListener('abort', () => controller.abort(sig.reason), { once: true });
  }
  return controller.signal;
}

// ── Phase 2c/2d: kuromoji/kuromoji-ko (Japanese & Korean) ──────────
// Full morphological analysis: handles both segmentation and lemmatization
// in one call. Requires downloaded dictionary data pack on the device
// filesystem. Falls back to regex word-split + surface-as-lemma if the
// data pack is not available.
//
// Architecture:
//   getKuromojiTokenizer(l2) — singleton per language, lazily loads
//   resetTokenizer(l2) — resets singleton (called after data pack download)
//   tokenizeJapanese() / tokenizeKorean() — wraps engine output into
//     LemmatizedToken[] shape
//
// Languages:
//   ja — kuromoji, IPADIC dict (~3 MB), npm: kuromoji (Phase 2c)
//   ko — kuromoji-ko, mecab-ko-dic (~2 MB pruned), npm: kuromoji-ko (Phase 2d)

/**
 * Singleton promises for kuromoji-based tokenizers, keyed by language code.
 * Lazily initialized on first access.
 */
const kuromojiTokenizers = new Map<string, Promise<any | null>>();

/**
 * Get (or create) a kuromoji-based tokenizer singleton for a language.
 *
 * Lazily loads the dictionary data pack from the device filesystem on
 * first call. Returns null if the data pack has not been downloaded.
 * Subsequent calls reuse the cached instance.
 *
 * Currently supports:
 *   - 'ja' → kuromoji (IPADIC)
 *   - 'ko' → kuromoji-ko (mecab-ko-dic)
 *
 * @param l2 - Language code ('ja' or 'ko')
 */
async function getKuromojiTokenizer(l2: string): Promise<any | null> {
  const existing = kuromojiTokenizers.get(l2);
  if (existing) {
    log(`[lemmatize] 🤖 TOKENIZER-CACHED l2=${l2}`);
    return existing;
  }

  log(`[lemmatize] 🤖 TOKENIZER-INIT l2=${l2} (loading data pack…)`);
  const promise = (async () => {
    try {
      const { hasKuromojiData, getKuromojiDataPath } = await import('@/lib/tokenizer-db');
      const hasData = await hasKuromojiData(l2);
      if (!hasData) return null;

      const dicPath = getKuromojiDataPath(l2);

      if (l2 === 'ko') {
        const { loadKuromojiKo } = await import('@/lib/kuromoji-ko-loader');
        return await loadKuromojiKo(dicPath);
      }

      // Default to kuromoji (Japanese)
      const { loadKuromoji } = await import('@/lib/kuromoji-loader');
      const result = await loadKuromoji(dicPath);
      log(`[lemmatize] 🤖 TOKENIZER-READY l2=${l2} loaded=${!!result}`);
      return result;
    } catch (e) {
      logwarn(`[Tokenizer] kuromoji (${l2}) init error:`, e);
      return null;
    }
  })();

  kuromojiTokenizers.set(l2, promise);
  return promise;
}

/**
 * Reset a kuromoji-based tokenizer singleton for a language.
 *
 * Called after the data pack finishes downloading so the next
 * lemmatizeText() call will load the fresh dictionary files.
 *
 * @param l2 - Language code ('ja', 'ko', etc.)
 */
export function resetTokenizer(l2: string): void {
  kuromojiTokenizers.delete(l2);
}

/**
 * Drop all in-memory tokenizer/lemma state for a language.
 *
 * Called when an offline dictionary is deleted so stale headword sets,
 * kuromoji singletons, and cached lemmatizations don't linger after the
 * on-device data is gone.
 */
export function clearDictionaryCaches(l2: string): void {
  dictWordSets.delete(l2);
  dictMaxWordLen.delete(l2);
  kuromojiTokenizers.delete(l2);
  lemmaDownloadState.delete(l2);

  for (const key of [...lemmatizeCache.keys()]) {
    if (key.startsWith(`${l2}:`)) lemmatizeCache.delete(key);
  }
  for (const key of [...lemmatizeInflight.keys()]) {
    if (key.startsWith(`${l2}:`)) lemmatizeInflight.delete(key);
  }
}

/**
 * Backward-compatible alias for resetTokenizer('ja').
 */
export function resetJaTokenizer(): void {
  resetTokenizer('ja');
}

/**
 * Backward-compatible alias for resetTokenizer('ko').
 */
export function resetKoTokenizer(): void {
  resetTokenizer('ko');
}

/**
 * Split long text into chunks at natural boundaries so tokenization can
 * yield to the UI between chunks. Short texts (typical subtitle lines) are
 * returned untouched as a single chunk.
 *
 * Boundaries are chosen at sentence-final punctuation first, then whitespace,
 * then a hard length split (rare) — never inside a normal word.
 */
function chunkTextForYield(text: string, maxChunk = 300): string[] {
  if (text.length <= maxChunk) return [text];
  const chunks: string[] = [];
  const lowerBound = Math.floor(maxChunk / 2);
  let rest = text;
  while (rest.length > maxChunk) {
    let cut = -1;
    for (let i = maxChunk - 1; i >= lowerBound; i--) {
      const ch = rest[i];
      if (ch === '。' || ch === '！' || ch === '？' || ch === '…' || ch === '!' || ch === '?' || ch === '；' || ch === ';') {
        cut = i + 1;
        break;
      }
    }
    if (cut === -1) {
      for (let i = maxChunk - 1; i >= lowerBound; i--) {
        if (/\s/.test(rest[i]!)) {
          cut = i + 1;
          break;
        }
      }
    }
    if (cut === -1) cut = maxChunk;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}

/**
 * Tokenize and lemmatize Japanese text using kuromoji.
 *
 * kuromoji performs morphological analysis: segmentation + POS tagging +
 * lemmatization (basic_form). Each token's `basic_form` is the dictionary
 * lemma form (e.g., 食べた → 食べる, 美味しかった → 美味しい).
 *
 * @param text - Japanese text to analyze
 * @returns LemmatizedToken[] with kuromoji's results, or null if
 *   kuromoji is not available (data pack not downloaded / error)
 */
async function tokenizeJapanese(text: string): Promise<LemmatizedToken[] | null> {
  log(`[lemmatize] 🤖 JA-TOKENIZE start text="${text.slice(0, 40)}…"`);
  const tokenizer = await getKuromojiTokenizer('ja');
  if (!tokenizer) {
    log(`[lemmatize] 🤖 JA-NO-TOKENIZER`);
    return null;
  }

  try {
    const chunks = chunkTextForYield(text);
    const out: LemmatizedToken[] = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      if (ci > 0) await yieldToUI();
      const tokens = tokenizer.tokenize(chunks[ci]) as Array<{
        surface_form: string;
        basic_form: string;
        reading?: string;
        pronunciation?: string;
        pos?: string;
      }>;
      for (const t of tokens) {
        out.push({
          text: t.surface_form,
          lemmas: [{
            lemma: cleanJapaneseLemma(t.surface_form, t.basic_form),
            part_of_speech: t.pos || undefined,
          }],
          // Include reading if available (kuromoji provides this for most
          // tokens, useful for furigana rendering in the UI)
          ...(t.reading ? { pronunciation: t.reading } : {}),
          source: 'ja-kuromoji' as const,
        });
      }
    }
    return out;
  } catch (e) {
    logwarn('[Tokenizer] kuromoji tokenize error:', e);
    return null;
  } finally {
    log(`[lemmatize] 🤖 JA-TOKENIZE done`);
  }
}

/**
 * Tokenize and lemmatize Korean text using kuromoji-ko.
 *
 * kuromoji-ko performs morphological analysis: segmentation + POS tagging +
 * lemmatization. Korean verbs and adjectives inflect heavily. kuromoji-ko
 * returns tokens with an `expression` field containing the decomposed form
 * (e.g., '먹었습니다' → expression: '먹/VV+었/EP+습니다/EF'). The lemma
 * (dictionary form) is the root verb/adjective + '다' suffix.
 *
 * For simple tokens (nouns, particles), the surface form is the lemma.
 *
 * @param text - Korean text to analyze
 * @returns LemmatizedToken[] with kuromoji-ko's results, or null if
 *   kuromoji-ko is not available (data pack not downloaded / error)
 */
async function tokenizeKorean(text: string): Promise<LemmatizedToken[] | null> {
  log(`[lemmatize] 🤖 KO-TOKENIZE start text="${text.slice(0, 40)}…"`);
  const tokenizer = await getKuromojiTokenizer('ko');
  if (!tokenizer) {
    log(`[lemmatize] 🤖 KO-NO-TOKENIZER`);
    return null;
  }

  try {
    const chunks = chunkTextForYield(text);
    const out: LemmatizedToken[] = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      if (ci > 0) await yieldToUI();
      const tokens = tokenizer.tokenize(chunks[ci]) as Array<{
        surface_form: string;
        expression?: string;
        pos?: string;
        reading?: string;
        type?: string;
        word_type?: string;
      }>;
      for (const t of tokens) {
        // For verb/adjective inflections, extract the root from expression
        // Expression format: '먹/VV+었/EP+습니다/EF' → root is '먹' (lemma: '먹다')
        // For compound words: expression contains '+' separated parts
        // For simple tokens: surface form is the lemma
        let lemma = t.surface_form;
        let lemmaPos = t.pos;

        if (t.expression && t.expression !== '*' && t.expression !== t.surface_form) {
          // Extract the first verb/adjective root from the expression
          // e.g., '먹/VV+었/EP+습니다/EF' → first part '먹/VV'
          const firstPart = t.expression.split('+')[0];
          if (firstPart) {
            const [root, pos] = firstPart.split('/');
            if (root && pos) {
              // VV = verb, VA = adjective, VX = auxiliary verb
              if (pos === 'VV' || pos === 'VA' || pos === 'VX') {
                // Korean dictionary form is root + '다'
                lemma = KO_SUPPLETIVE_LEMMAS[root] ?? root + '다';
              } else {
                lemma = root;
              }
              lemmaPos = pos;
            } else {
              lemma = root ?? t.surface_form;
            }
          }
        }

        // Include reading if available; otherwise romanize the surface
        // form with koroman so offline ko matches the server.
        const pron =
          t.reading && t.reading !== '*'
            ? t.reading
            : /[\uAC00-\uD7A3]/.test(t.surface_form)
              ? romanize(t.surface_form, 'ko')
              : undefined;

        out.push({
          text: t.surface_form,
          lemmas: [{ lemma, part_of_speech: lemmaPos || undefined }],
          ...(pron ? { pronunciation: pron } : {}),
          source: 'ko-kuromoji' as const,
        });
      }
    }
    return out;
  } catch (e) {
    logwarn('[Tokenizer] kuromoji-ko tokenize error:', e);
    return null;
  } finally {
    log(`[lemmatize] 🤖 KO-TOKENIZE done`);
  }
}

// ── Public API ──────────────────────────────────────────────────────

/** Whitespace or punctuation/symbol-only token → canonical non-word. */
const NONWORD_RE = /^[\s\p{P}\p{S}]+$/u;

function isNonWordToken(text: string): boolean {
  return text.length > 0 && NONWORD_RE.test(text);
}

/**
 * Canonicalize local tokens to the unified contract (SPEC-018 / ARCH-016):
 * whitespace and punctuation/symbol tokens become non-interactive
 * (`lemmas: []`), and any whitespace the tokenizer dropped (regex path,
 * kuromoji chunking) is restored as gap tokens from the original text —
 * mirroring the server's `_recover_spaces`. This guarantees the token list
 * reconstructs `text` exactly, so format ranges and search highlights stay
 * aligned on every local path.
 */
function canonicalizeLocalTokens(tokens: LemmatizedToken[], text: string): LemmatizedToken[] {
  const result: LemmatizedToken[] = [];
  let pos = 0;
  for (const token of tokens) {
    const tokenText = token.text;
    if (!tokenText) {
      result.push(token);
      continue;
    }
    const idx = text.indexOf(tokenText, pos);
    if (idx > pos) {
      for (let i = pos; i < idx; i++) {
        const ch = text[i]!;
        if (ch === ' ' || ch === '\n' || ch === '\t') {
          result.push({ text: ch, lemmas: [] });
        }
      }
    }
    result.push(isNonWordToken(tokenText) ? { ...token, lemmas: [] } : token);
    pos = idx >= 0 ? idx + tokenText.length : pos + tokenText.length;
  }
  // Trailing whitespace after the last token (regex path drops it).
  for (let i = pos; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      result.push({ text: ch, lemmas: [] });
    }
  }
  return result;
}

/**
 * Run the full local (offline) fallback chain and cache the result.
 *
 * Order: kuromoji/kuromoji-ko (JA/KO) → dict-based segmentation (CJK/SEA)
 * → regex word-split → lemma table → snowball → arabic-stem → surface.
 */
async function runLocalFallback(
  text: string,
  l2: string,
  cacheKey: string,
): Promise<LemmatizedToken[]> {
  const tokens = await runLocalFallbackRaw(text, l2);
  const canonical = canonicalizeLocalTokens(tokens, text);
  cacheSet(cacheKey, canonical);
  return canonical;
}

/** Raw fallback chain (no canonicalization/caching — see runLocalFallback). */
async function runLocalFallbackRaw(
  text: string,
  l2: string,
): Promise<LemmatizedToken[]> {
  log(`[lemmatize] 🔽 FALLBACK l2=${l2} text="${text.slice(0, 50)}…"`);
  const config = TOKENIZER_CONFIG[l2];

  // Background download for future calls (fire-and-forget)
  if (config?.hasLemmaTable) {
    backgroundDownloadLemmaTable(l2, PYTHON_API_URL);
  }

  // Phase 2c/2d: kuromoji/kuromoji-ko (Japanese & Korean).
  // Full morphological analysis — handles both segmentation and
  // lemmatization in one call with best offline accuracy.
  if (config?.needsKuromoji) {
    // WebView worker first (off the RN JS thread) — ja only for now; the
    // main-thread kuromoji singleton remains the fallback.
    if (l2 === 'ja') {
      log(`[lemmatize] 🤖 WEBVIEW-WORKER l2=${l2} text="${text.slice(0, 50)}…"`);
      const workerTokens = await tokenizeJapaneseInWorker(text);
      if (workerTokens && workerTokens.length > 0) {
        log(`[lemmatize] ✅ WEBVIEW-WORKER OK l2=${l2} tokens=${workerTokens.length}`);
        return workerTokens;
      }
      log(`[lemmatize] ⚠️ WEBVIEW-WORKER UNAVAIL l2=${l2} → main-thread kuromoji`);
    }
    const tokenizeFn = l2 === 'ko' ? tokenizeKorean : l2 === 'ja' ? tokenizeJapanese : null;
    if (tokenizeFn) {
      log(`[lemmatize] 🤖 KUPOMOJI l2=${l2} text="${text.slice(0, 50)}…"`);
      const kuromojiTokens = await tokenizeFn(text);
      if (kuromojiTokens) {
        log(`[lemmatize] ✅ KUPOMOJI OK l2=${l2} tokens=${kuromojiTokens.length}`);
        return kuromojiTokens;
      }
      // Data pack not available — fall through to generic path
      log(`[lemmatize] ⚠️ KUPOMOJI UNAVAIL l2=${l2} → falling to segment+local`);
    }
  }

  // Phase 2b: Use dict-based segmentation for CJK/SEA languages
  // Falls back to regex word-split if dict not downloaded
  if (config?.needsDictSegmentation) {
    // WebView worker first — it internally waits for a launch-time warm so
    // even the first page uses the worker when possible.
    log(`[lemmatize] 🤖 WEBVIEW-DICT-WORKER l2=${l2} text="${text.slice(0, 50)}…"`);
    const workerTokens = await tokenizeDictSegInWorker(text, l2);
    if (workerTokens && workerTokens.length > 0) {
      log(`[lemmatize] ✅ WEBVIEW-DICT-WORKER OK l2=${l2} tokens=${workerTokens.length}`);
      return workerTokens;
    }
    log(`[lemmatize] ⚠️ WEBVIEW-DICT-WORKER UNAVAIL l2=${l2} → main-thread dict-seg`);
  }
  log(`[lemmatize] 🔽 GENERIC-FALLBACK l2=${l2} (${config?.needsKuromoji ? 'kuromoji unavailable' : 'no kuromoji for this lang'})`);
  const words = await segmentText(text, l2, config);
  const tokens = await lemmatizeLocal(words, l2, config);
  // If dict segmentation actually ran (dictionary downloaded), attach the
  // dictionary's POS when available and mark the source. POS is absent from
  // current zh downloads, so lemmas keep `part_of_speech` undefined until a
  // server-side head→POS sidecar exists (Phase 1 follow-up).
  if (config?.needsDictSegmentation) {
    const dictData = await loadDictWordSet(l2);
    if (dictData) {
      const posByWord = dictData.posByWord;
      return tokens.map(t => t.lemmas.length > 0
        ? {
            ...t,
            lemmas: t.lemmas.map(l => ({ ...l, part_of_speech: l.part_of_speech ?? posByWord.get(l.lemma) })),
            source: 'dict-seg' as const,
          }
        : t);
    }
  }
  return tokens;
}

/**
 * Single entry point for lemmatization on mobile.
 *
 * Pipeline:
 *   1. In-memory cache hit → instant return
 *   2. Offline Mode active → local fallback (no network attempt at all)
 *   3. POST /lemmatize-normalized (server, 3s timeout) → cache & return
 *   4. Local fallback (regex split + surface/stem) → cache & return
 *
 * The server is always preferred when reachable (best accuracy).
 * Local fallback produces lower-accuracy tokens but is always available.
 *
 * @param text - The text to tokenize and lemmatize
 * @param l2 - Target language code (e.g., 'zh', 'ja', 'ar', 'de')
 * @param signal - Optional AbortSignal for cancellation
 * @returns Array of LemmatizedToken. Never throws — degrades gracefully.
 */
export async function lemmatizeText(
  text: string,
  l2: string,
  signal?: AbortSignal,
): Promise<LemmatizedToken[]> {
  const cacheKey = `${l2}:${text}`;

  // 1. In-memory cache
  const cached = cacheGet(cacheKey);
  if (cached) {
    log(`[lemmatize] 💾 CACHE HIT l2=${l2} text="${text.slice(0, 50)}…"`);
    return cached;
  }

  // In-flight deduplication so concurrent callers for the same text share
  // one request (server or local fallback).
  let inflight = lemmatizeInflight.get(cacheKey);
  if (inflight) {
    log(`[lemmatize] 🔗 REUSE in-flight l2=${l2} text="${text.slice(0, 50)}…"`);
    return inflight;
  }

  log(`[lemmatize] 🚀 DISPATCH l2=${l2} text="${text.slice(0, 50)}…"`);

  // 2. Offline Mode: skip the server round-trip entirely. The network gate
  //    would reject instantly anyway, but skipping keeps the local fallback
  //    instant and makes the intent explicit in logs.
  if (isOfflineModeEnabled()) {
    log(`[lemmatize] 🚫 OFFLINE-MODE l2=${l2} text="${text.slice(0, 50)}…" → local fallback`);
    inflight = runLocalFallback(text, l2, cacheKey).finally(() => {
      lemmatizeInflight.delete(cacheKey);
    });
    lemmatizeInflight.set(cacheKey, inflight);
    return inflight;
  }

  // 3. Server (primary) — with in-flight deduplication so concurrent
  //    callers for the same text share one request.
  inflight = lemmatizeFromServer(text, l2, signal)
      .then((serverTokens) => {
        if (serverTokens) {
          cacheSet(cacheKey, serverTokens);
          return serverTokens;
        }
        // 4. Local fallback — extended chain
        return runLocalFallback(text, l2, cacheKey);
      })
      .finally(() => {
        lemmatizeInflight.delete(cacheKey);
      });
    lemmatizeInflight.set(cacheKey, inflight);

  return inflight;
}

/**
 * Pre-warm the local tokenizer machinery (kuromoji data pack + dictionary
 * headword set) in the background so the first visible line doesn't pay the
 * full one-time initialization cost. Fire-and-forget; safe to call from
 * every TokenizedText mount (singletons dedupe the work).
 */
export function prewarmLocalLemmatizer(l2: string): void {
  const config = TOKENIZER_CONFIG[l2];
  if (config?.needsKuromoji) {
    void getKuromojiTokenizer(l2);
  }
  if (config?.needsDictSegmentation) {
    void loadDictWordSet(l2).catch(() => null);
  }
}
