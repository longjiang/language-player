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
 */

import Stemmer from 'arabic-stem';
import Snowball from 'snowball-stemmers';
import { PYTHON_API_URL } from '@/lib/api-url';
import { TOKENIZER_CONFIG } from '@langplayer/shared';
import type { LemmatizedToken, TokenizerConfig } from '@langplayer/shared';

const arabicStemmer = new Stemmer();

// ── Shared in-memory cache ──────────────────────────────────────────
// All callers share this Map, so if two components render the same text,
// only one server call is made. Keyed by `${l2}:${text}`.
const lemmatizeCache = new Map<string, LemmatizedToken[]>();

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
      // Skip whitespace in scriptio continua — these languages don't use
      // spaces between words, and the dict headwords won't include spaces.
      // Preserve punctuation as standalone tokens (not found in dict).
      return maxMatchSegment(text, dictData.wordSet, dictData.maxWordLen);
    }
    // Dict not downloaded — fall through to regex
  }

  // Default: regex word-split (works for all space-separated languages)
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
      };
    } catch {
      return { text: t, lemmas: [{ lemma: t }] };
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
    return surfaceAsLemma(words);
  }

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
    lemmaMap = new Map();
    for (const word of words) {
      const lemmas = await tryLemmaTable(l2, word);
      if (lemmas) lemmaMap.set(word, lemmas);
    }
  }

  // Get snowball stemmer if configured
  const stemmer = config.snowballCode
    ? getSnowballStemmer(config.snowballCode)
    : null;

  // Process each word through the fallback chain
  return words.map((word) => {
    // 1. Lemma table
    if (lemmaMap?.has(word)) {
      return {
        text: word,
        lemmas: lemmaMap.get(word)!.map((l) => ({ lemma: l })),
      };
    }

    // 2. Snowball stemmer
    if (stemmer) {
      try {
        const stem = stemmer(word);
        if (stem && stem !== word) {
          return { text: word, lemmas: [{ lemma: stem }] };
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
    return { text: word, lemmas: [{ lemma: word }] };
  });
}

// Track which languages we've already attempted background download for
const lemmaDownloadAttempted = new Set<string>();

/**
 * Fire-and-forget background download of lemma table.
 * Called on first local fallback invocation for a language.
 */
function backgroundDownloadLemmaTable(l2: string, apiUrl: string): void {
  if (lemmaDownloadAttempted.has(l2)) return;
  lemmaDownloadAttempted.add(l2);

  // Don't await — fire and forget
  import('@/lib/tokenizer-db').then(({ downloadLemmaTable }) => {
    downloadLemmaTable(l2, apiUrl).catch(() => { /* silent */ });
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
    if (!response.ok) return null;
    const data = await response.json();
    return (data.tokens ?? []) as LemmatizedToken[];
  } catch {
    return null; // network error or timeout → fall through to local
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
  const cached = lemmatizeCache.get(cacheKey);
  if (cached) return cached;

  // 2. Server (primary) — with in-flight deduplication so concurrent
  //    callers for the same text share one request.
  let inflight = lemmatizeInflight.get(cacheKey);
  if (!inflight) {
    inflight = lemmatizeFromServer(text, l2, signal)
      .then((serverTokens) => {
        if (serverTokens) {
          lemmatizeCache.set(cacheKey, serverTokens);
          return serverTokens;
        }
        // 3. Local fallback — extended chain (Phase 1 + Phase 2a + Phase 2b)
        const config = TOKENIZER_CONFIG[l2];

        // Background download for future calls (fire-and-forget)
        if (config?.hasLemmaTable) {
          backgroundDownloadLemmaTable(l2, PYTHON_API_URL);
        }

        // Phase 2b: Use dict-based segmentation for CJK/SEA languages
        // Falls back to regex word-split if dict not downloaded
        return segmentText(text, l2, config).then((words) =>
          lemmatizeLocal(words, l2, config),
        ).then((tokens) => {
          lemmatizeCache.set(cacheKey, tokens);
          return tokens;
        });
      })
      .finally(() => {
        lemmatizeInflight.delete(cacheKey);
      });
    lemmatizeInflight.set(cacheKey, inflight);
  }

  return inflight;
}
