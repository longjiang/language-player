import { PYTHON_API_URL } from '@/lib/api-url';
import { md5 } from '@langplayer/utils';
import { log, logwarn } from '@/lib/logger';

/**
 * Batch LLM calls can take a while — give them a generous timeout.
 */
const TRANSLATE_ARRAY_TIMEOUT_MS = 60_000;

/** Translations keyed by the md5 hash of the source text. */
export type KeyedTranslations = Record<string, string>;

export interface KeyedTranslateResult {
  /** md5 keys for each requested text, in request order. */
  keys: string[];
  /** Verified translations keyed by md5 — never includes unverifiable entries. */
  byKey: KeyedTranslations;
}

/**
 * Translate a single text string via the Python backend LLM.
 * Falls back to the original text on any error.
 */
export async function translateText(
  text: string,
  l1: string,
  l2: string,
): Promise<string> {
  if (!text || l1 === l2) return text;

  try {
    const params = new URLSearchParams({ text, l1, l2 });
    const res = await fetch(`${PYTHON_API_URL}/translate?${params}`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return text;
    const data = await res.json();
    return data?.translated_text?.trim() || text;
  } catch {
    return text;
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string');
}

/**
 * Reconcile raw (key, translation) pairs into a keyed map, refusing to keep
 * any key whose duplicates came back with conflicting translations.
 */
function reconcilePairs(pairs: Array<[string, string]>): KeyedTranslations {
  const seen = new Map<string, string>();
  const conflicted = new Set<string>();
  for (const [key, out] of pairs) {
    const prev = seen.get(key);
    if (prev === undefined) {
      seen.set(key, out);
    } else if (prev !== out) {
      conflicted.add(key);
    }
  }
  const byKey: KeyedTranslations = {};
  for (const [key, out] of seen) {
    if (!conflicted.has(key)) byKey[key] = out;
  }
  return byKey;
}

/**
 * Batch-translate reader blocks with md5-keyed requests and processing.
 *
 * Each text is hashed to an md5 key. The keys are sent alongside the texts so
 * the backend can echo them; on the way back every translation is paired with
 * a key and validated against the request. If the response ever misaligns —
 * wrong count, unknown echoed key, or duplicate texts with conflicting
 * translations — the unverifiable entries are dropped (or the whole response
 * rejected) instead of silently showing the wrong translation for a block.
 *
 * The Flask `/translate_array` endpoint currently returns a positional array
 * without echoing keys; that path is still verified (exact count match +
 * duplicate-text consistency) and the keyed payload keeps us forward-compatible
 * with a backend that echoes keys.
 *
 * Throws on hard misalignment (HTTP error, missing/invalid response, count
 * mismatch, unknown echoed key); callers catch and fall back to showing no
 * translations.
 */
export async function translateTextsKeyed(
  texts: string[],
  l1: string,
  l2: string,
): Promise<KeyedTranslateResult> {
  const keys = texts.map(t => md5(t));
  if (texts.length === 0 || l1 === l2) return { keys, byKey: {} };

  let data: { translated_texts?: unknown; keys?: unknown };
  try {
    const res = await fetch(`${PYTHON_API_URL}/translate_array`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, keys, l1, l2 }),
      signal: AbortSignal.timeout(TRANSLATE_ARRAY_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`translate_array HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    logwarn(
      '[LP Web] translateTextsKeyed request failed for %d text(s): %s',
      texts.length,
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }

  const translated = data?.translated_texts;
  if (!isStringArray(translated)) {
    logwarn('[LP Web] translate_array returned no translated_texts array');
    throw new Error('translate_array response missing translated_texts');
  }

  const echoedKeys = data?.keys;
  if (isStringArray(echoedKeys)) {
    // Backend echoed keys — pair by echoed key and verify every key matches
    // the request, so ordering can never cause a mismatch.
    if (echoedKeys.length !== translated.length || echoedKeys.length !== texts.length) {
      logwarn(
        '[LP Web] translate_array echoed %d key(s) for %d text(s) / %d translation(s) — rejecting response',
        echoedKeys.length,
        texts.length,
        translated.length,
      );
      throw new Error('translate_array echoed key count mismatch');
    }
    const requested = new Set(keys);
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < echoedKeys.length; i++) {
      const key = echoedKeys[i]!;
      if (!requested.has(key)) {
        logwarn('[LP Web] translate_array echoed unknown key "%s" — rejecting response', key);
        throw new Error('translate_array echoed unknown key');
      }
      pairs.push([key, translated[i]!.trim()]);
    }
    const byKey = reconcilePairs(pairs);
    log('[LP Web] translateTextsKeyed: %d/%d verified translation(s) via echoed keys', Object.keys(byKey).length, texts.length);
    return { keys, byKey };
  }

  // Current backend contract: positional array, no keys echoed. Only accept
  // an exact-count response; anything shorter/longer is misalignment.
  if (translated.length !== texts.length) {
    logwarn(
      '[LP Web] translate_array returned %d translation(s) for %d text(s) — rejecting response to avoid misalignment',
      translated.length,
      texts.length,
    );
    throw new Error('translate_array response length mismatch');
  }
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < texts.length; i++) {
    pairs.push([keys[i]!, translated[i]!.trim()]);
  }
  const byKey = reconcilePairs(pairs);
  log('[LP Web] translateTextsKeyed: %d/%d verified translation(s) via positional pairing', Object.keys(byKey).length, texts.length);
  return { keys, byKey };
}
