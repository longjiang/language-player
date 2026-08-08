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

/**
 * Load the dictionary headword set for a language from the offline
 * dictionary SQLite database. Caches in memory for subsequent calls.
 *
 * Returns null if the dictionary is not downloaded for this language.
 */
async function loadDictWordSet(l2: string): Promise<{ wordSet: Set<string>; maxWordLen: number } | null> {
  // Check memory cache first
  const cached = dictWordSets.get(l2);
  if (cached) {
    return { wordSet: cached, maxWordLen: dictMaxWordLen.get(l2) ?? 5 };
  }

  try {
    const { openDictionaryDB } = await import('@/lib/dictionary-db');
    const db = await openDictionaryDB();
    const table = `dict_${l2.replace(/-/g, '_')}`;
    const rows = await db.getAllAsync<{ head: string }>(
      `SELECT DISTINCT head FROM ${table}`,
    );
    if (!rows || rows.length === 0) return null;

    const wordSet = new Set<string>();
    let maxWordLen = 1;
    for (const row of rows) {
      wordSet.add(row.head);
      if (row.head.length > maxWordLen) maxWordLen = row.head.length;
    }

    // Evict oldest language if at capacity (keep only last 3 to cap at ~3–6 MB)
    if (dictWordSets.size >= 3) {
      const firstKey = dictWordSets.keys().next().value;
      if (firstKey !== undefined) {
        dictWordSets.delete(firstKey);
        dictMaxWordLen.delete(firstKey);
      }
    }

    dictWordSets.set(l2, wordSet);
    dictMaxWordLen.set(l2, maxWordLen);
    return { wordSet, maxWordLen };
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
 * @returns Array of segmented tokens
 */
function maxMatchSegment(text: string, wordSet: Set<string>, maxWordLen: number): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < text.length) {
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
      return maxMatchSegment(text, dictData.wordSet, dictData.maxWordLen);
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
 * Attempt lemma table lookup for a single surface form.
 * Returns lemma strings, or null if not found / table not downloaded.
 */
async function tryLemmaTable(l2: string, surface: string): Promise<string[] | null> {
  try {
    // Dynamic import avoids circular dependency at module load time
    const { lookupLemma } = await import('@/lib/tokenizer-db');
    return await lookupLemma(l2, surface);
  } catch {
    return null;
  }
}

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
    const results = await Promise.all(
      words.map(async (word) => {
        const lemmas = await tryLemmaTable(l2, word);
        return { word, lemmas };
      }),
    );
    lemmaMap = new Map();
    for (const { word, lemmas } of results) {
      if (lemmas) lemmaMap.set(word, lemmas);
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

  const stemmed = result.filter(t => t.lemmas[0]?.lemma !== t.text).length;
  const sample = result.filter(t => t.lemmas[0]?.lemma !== t.text).slice(0, 10)
    .map(t => `${t.text}→${t.lemmas[0]?.lemma}`).join(', ');
  log(`[lemmatize] 🏷️ LOCAL-DONE l2=${l2} words=${result.length} stemmed=${stemmed} table=${tableHits} snowball=${snowballHits} sample="${sample}"`);

  return result;
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
    const tokens = tokenizer.tokenize(text) as Array<{
      surface_form: string;
      basic_form: string;
      reading?: string;
      pronunciation?: string;
      pos?: string;
    }>;

    return tokens.map((t) => ({
      text: t.surface_form,
      lemmas: [{ lemma: t.basic_form || t.surface_form }],
      // Include reading if available (kuromoji provides this for most
      // tokens, useful for furigana rendering in the UI)
      ...(t.reading ? { pronunciation: t.reading } : {}),
      source: 'ja-kuromoji' as const,
    }));
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
    const tokens = tokenizer.tokenize(text) as Array<{
      surface_form: string;
      expression?: string;
      pos?: string;
      reading?: string;
      type?: string;
      word_type?: string;
    }>;

    return tokens.map((t) => {
      // For verb/adjective inflections, extract the root from expression
      // Expression format: '먹/VV+었/EP+습니다/EF' → root is '먹' (lemma: '먹다')
      // For compound words: expression contains '+' separated parts
      // For simple tokens: surface form is the lemma
      let lemma = t.surface_form;

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
              lemma = root + '다';
            } else {
              lemma = root;
            }
          } else {
            lemma = root ?? t.surface_form;
          }
        }
      }

      return {
        text: t.surface_form,
        lemmas: [{ lemma }],
        // Include reading if available
        ...(t.reading && t.reading !== '*' ? { pronunciation: t.reading } : {}),
        source: 'ko-kuromoji' as const,
      };
    });
  } catch (e) {
    logwarn('[Tokenizer] kuromoji-ko tokenize error:', e);
    return null;
  } finally {
    log(`[lemmatize] 🤖 KO-TOKENIZE done`);
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Single entry point for lemmatization on mobile.
 *
 * Pipeline:
 *   1. In-memory cache hit → instant return
 *   2. POST /lemmatize-normalized (server, 3s timeout) → cache & return
 *   3. Local fallback (regex split + surface/stem) → cache & return
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

  // 2. Server (primary) — with in-flight deduplication so concurrent
  //    callers for the same text share one request.
  let inflight = lemmatizeInflight.get(cacheKey);
  if (inflight) {
    log(`[lemmatize] 🔗 REUSE in-flight l2=${l2} text="${text.slice(0, 50)}…"`);
    return inflight;
  }

  log(`[lemmatize] 🚀 DISPATCH l2=${l2} text="${text.slice(0, 50)}…"`);
  inflight = lemmatizeFromServer(text, l2, signal)
      .then((serverTokens) => {
        if (serverTokens) {
          cacheSet(cacheKey, serverTokens);
          return serverTokens;
        }
        // 3. Local fallback — extended chain
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
          const tokenizeFn = l2 === 'ko' ? tokenizeKorean : l2 === 'ja' ? tokenizeJapanese : null;
          if (tokenizeFn) {
            log(`[lemmatize] 🤖 KUPOMOJI l2=${l2} text="${text.slice(0, 50)}…"`);
            return tokenizeFn(text).then((kuromojiTokens) => {
              if (kuromojiTokens) {
                log(`[lemmatize] ✅ KUPOMOJI OK l2=${l2} tokens=${kuromojiTokens.length}`);
                cacheSet(cacheKey, kuromojiTokens);
                return kuromojiTokens;
              }
              // Data pack not available — fall through to generic path
              log(`[lemmatize] ⚠️ KUPOMOJI UNAVAIL l2=${l2} → falling to segment+local`);
              return segmentText(text, l2, config).then((words) =>
                lemmatizeLocal(words, l2, config),
              ).then((tokens) => {
                // If dict segmentation was used, override source for all word tokens
                const annotated = config?.needsDictSegmentation
                  ? tokens.map(t => t.lemmas.length > 0 ? { ...t, source: 'dict-seg' as const } : t)
                  : tokens;
                cacheSet(cacheKey, annotated);
                return annotated;
              });
            });
          }
        }

        // Phase 2b: Use dict-based segmentation for CJK/SEA languages
        // Falls back to regex word-split if dict not downloaded
        log(`[lemmatize] 🔽 GENERIC-FALLBACK l2=${l2} (no kuromoji for this lang)`);
        return segmentText(text, l2, config).then((words) =>
          lemmatizeLocal(words, l2, config),
        ).then((tokens) => {
          // If dict segmentation was used, override source for all word tokens
          const annotated = config?.needsDictSegmentation
            ? tokens.map(t => t.lemmas.length > 0 ? { ...t, source: 'dict-seg' as const } : t)
            : tokens;
          cacheSet(cacheKey, annotated);
          return annotated;
        });
      })
      .finally(() => {
        lemmatizeInflight.delete(cacheKey);
      });
    lemmatizeInflight.set(cacheKey, inflight);

  return inflight;
}
