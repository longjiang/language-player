/**
 * On-the-spot machine translation client (SPEC-095).
 *
 * Task instructions are authored in L2 only; their L1 rendering is translated at
 * runtime rather than authored per locale. Authoring translations by hand would
 * mean 17 extra strings per task for a line the student reads once, and it would
 * drift the moment the L2 instruction is edited.
 *
 * Shared by both apps because the request shape and the caching policy are the
 * same; the caller passes its own `PYTHON_API_URL` (each app has its own
 * source of truth for that — see `lib/api-url.ts`).
 */

export interface TranslateRequest {
  texts: string[];
  /** Native language to translate into. */
  l1: string;
  /** Language the texts are written in. */
  l2: string;
  /** Base URL of the Python backend. */
  apiBaseUrl: string;
  signal?: AbortSignal;
}

const TIMEOUT_MS = 30_000;

/**
 * In-memory cache, keyed by language pair + source text.
 *
 * Instructions are short and repeated across a session (every visit to the same
 * task re-asks for the same line), and the backend call is an LLM round-trip, so
 * caching is the difference between one request per task and one per view.
 */
const cache = new Map<string, string>();

function cacheKey(l1: string, l2: string, text: string): string {
  return `${l1}\u0000${l2}\u0000${text}`;
}

/** Drop the cache. Exported for tests, which must not leak state between cases. */
export function clearTranslationCache(): void {
  cache.clear();
}

/**
 * Translate `texts` from `l2` into `l1`.
 *
 * Returns `null` on any failure rather than throwing: a missing instruction
 * translation must leave the L2 instructions (which are always shown) intact —
 * it is a nice-to-have under them, never the exercise itself.
 */
export async function translateTexts({
  texts,
  l1,
  l2,
  apiBaseUrl,
  signal,
}: TranslateRequest): Promise<string[] | null> {
  if (texts.length === 0) return [];
  // Same language: nothing to translate, and the backend would echo anyway.
  if (l1 === l2) return texts;

  const missing = texts.filter((t) => t.trim() && !cache.has(cacheKey(l1, l2, t)));
  if (missing.length === 0) {
    return texts.map((t) => cache.get(cacheKey(l1, l2, t)) ?? t);
  }

  try {
    const base = apiBaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/translate_array`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: missing, l1, l2 }),
      signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { translated_texts?: unknown };
    const translated = Array.isArray(data.translated_texts) ? data.translated_texts : null;
    // A short response would silently misalign translations with their sources,
    // so a mismatch is treated as a failure rather than partially applied.
    if (!translated || translated.length !== missing.length) return null;

    missing.forEach((source, i) => {
      const value = translated[i];
      if (typeof value === 'string' && value.trim()) {
        cache.set(cacheKey(l1, l2, source), value);
      }
    });

    return texts.map((t) => cache.get(cacheKey(l1, l2, t)) ?? t);
  } catch {
    // Offline, timeout, aborted, CORS — all the same outcome from here.
    return null;
  }
}
