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
 */

import Stemmer from 'arabic-stem';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { LemmatizedToken } from '@langplayer/shared';

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

// ── Server call ─────────────────────────────────────────────────────

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
        // 3. Local fallback
        const words = tokenizeWords(text);
        let tokens: LemmatizedToken[];
        if (l2 === 'ar') {
          tokens = lemmatizeArabic(words);
        } else {
          tokens = surfaceAsLemma(words);
        }
        lemmatizeCache.set(cacheKey, tokens);
        return tokens;
      })
      .finally(() => {
        lemmatizeInflight.delete(cacheKey);
      });
    lemmatizeInflight.set(cacheKey, inflight);
  }

  return inflight;
}
