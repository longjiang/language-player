/**
 * Saved-word quick gloss helpers (apps/web token-span.tsx parity).
 *
 * A saved word's inline glossary comes from the entry the user actually saved
 * (preferred by its id), falling back to the first cached dictionary match.
 * When L1 ≠ English, web fetches the L1-translated definition per saved word
 * via /dictionary/lookup (the batch endpoint returns English definitions only);
 * this module reproduces that behaviour for both the page reader (vanilla
 * page-content.js) and the video transcript (React transcript-app.tsx), so the
 * two surfaces render identical glosses.
 */

import type { LemmatizedToken, DictionaryEntry, SavedLexicalItemStore } from '@langplayer/shared';
import { firstGloss } from '@langplayer/shared';
import {
  baseCode,
  pickSavedEntry,
  getCachedEntries,
  getCachedEntryById,
  getL1CachedEntry,
  setL1CachedEntry,
} from '@langplayer/utils';
import { API_BASE } from './api-config';
import { apiFetch } from './api-fetch';

// ── Module-level L1 definition cache (mirrors web's _l1DefCache) ──
// Keyed by `${l2}:${form}:${savedWordId}:${l1}`. A lookup can return several
// entries for one surface form; prefer the saved entry's translated definition.
const _l1DefCache = new Map<string, string>();
/** In-flight per-saved-word L1 lookup promises (dedup). */
const _l1DefInflight = new Map<string, Promise<string | null>>();

/** Build the saved-word lookup maps for one L2:
 *  - `savedFormSet` — lowercased forms for quick "is this word saved?" checks.
 *  - `savedWordIdByForm` — surface form → the entry id the user saved. A form
 *    can match several saved entries (homographs, multiple senses); the most
 *    recently saved entry wins, so the gloss reflects the user's latest intent
 *    (web: savedWordIdByForm, most-recent-wins). */
export function buildSavedWordMaps(
  store: SavedLexicalItemStore,
  l2Code: string,
): { savedFormSet: Set<string>; savedWordIdByForm: Map<string, string> } {
  const savedFormSet = new Set<string>();
  const savedWordIdByForm = new Map<string, string>();
  const words = [...(store[l2Code] ?? [])].sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  const addForm = (form: string, id: string) => {
    const key = form.toLowerCase();
    if (!form.trim() || savedFormSet.has(key)) return;
    savedFormSet.add(key);
    savedWordIdByForm.set(key, id);
  };
  for (const w of words) {
    for (const f of w.forms) addForm(f, w.id);
    if (w.context?.form) addForm(w.context.form, w.id);
    for (const inst of w.instances ?? []) if (inst.form) addForm(inst.form, w.id);
  }
  return { savedFormSet, savedWordIdByForm };
}

/** Entry id of the saved word a token belongs to (undefined when the token
 *  isn't saved, or the saved record can't be matched). Surface form first,
 *  then lemma forms (web: savedWordIdForToken). */
export function savedWordIdForToken(
  token: LemmatizedToken,
  savedWordIdByForm: Map<string, string>,
): string | undefined {
  const surfaceId = savedWordIdByForm.get(token.text.toLowerCase());
  if (surfaceId) return surfaceId;
  for (const l of token.lemmas) {
    const id = savedWordIdByForm.get(l.lemma.toLowerCase());
    if (id) return id;
  }
  return undefined;
}

/** Synchronously resolve the quick gloss definition from the shared batch
 *  dictionary cache. Prefers the exact entry the user saved (by id), then the
 *  surface form, then the first lemma. Returns null when no definition is
 *  cached yet — the batch lookup populates the cache asynchronously. */
export function getCachedQuickGloss(
  token: LemmatizedToken,
  savedWordId: string | undefined,
  l2Code: string,
): string | null {
  const base = baseCode(l2Code);
  if (savedWordId) {
    const saved =
      getCachedEntryById(base, savedWordId) ??
      getCachedEntryById(l2Code, savedWordId);
    if (saved && saved.definitions.length > 0) return firstGloss(saved.definitions);
  }
  const texts = [token.text, ...(token.lemmas.map((l) => l.lemma))];
  for (const text of texts) {
    const entries = getCachedEntries(base, text) ?? getCachedEntries(l2Code, text);
    if (entries && entries.length > 0 && entries[0].definitions.length > 0) {
      return firstGloss(entries[0].definitions);
    }
  }
  return null;
}

/** Synchronously resolve an already-translated L1 definition for the saved
 *  entry (from the shared L1 cache, populated by the dictionary popup / the
 *  per-word L1 lookup). Returns null when not yet fetched. */
export function getCachedL1Gloss(
  l2Code: string,
  l1Code: string,
  savedWordId: string | undefined,
): string | null {
  if (!savedWordId) return null;
  const base = baseCode(l2Code);
  const savedL1 =
    getL1CachedEntry(base, l1Code, savedWordId) ??
    getL1CachedEntry(l2Code, l1Code, savedWordId);
  return savedL1 && savedL1.definitions.length > 0 ? firstGloss(savedL1.definitions) : null;
}

/** Resolve the L1-translated quick gloss definition for a saved word.
 *
 *  - L1 === 'en': the batch cache already holds English definitions, so return
 *    the cached def synchronously.
 *  - L1 ≠ 'en': fetch /dictionary/lookup with `l1`, preferring the entry the
 *    user actually saved (pickSavedEntry), then cache the result both in a
 *    module-level map and the shared L1 entry cache so the dictionary popup
 *    and review surfaces reuse it. In-flight requests are deduplicated.
 */
export function fetchL1Gloss(
  token: LemmatizedToken,
  savedWordId: string | undefined,
  l1Code: string,
  l2Code: string,
): Promise<string | null> {
  const base = baseCode(l2Code);
  const lookupText = token.lemmas[0]?.lemma || token.text;
  const cacheKey = `${base}:${lookupText}:${savedWordId ?? ''}:${l1Code}`;

  // English defs are already in the batch cache — no per-word call needed.
  if (l1Code === 'en' || l1Code === base) {
    return Promise.resolve(getCachedQuickGloss(token, savedWordId, l2Code));
  }

  const cached = _l1DefCache.get(cacheKey);
  if (cached !== undefined) return Promise.resolve(cached || null);

  const inflight = _l1DefInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = apiFetch(`${API_BASE}/dictionary/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: lookupText, l2: base, l1: l1Code }),
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      const results = (data.results ?? []) as DictionaryEntry[];
      const entry = pickSavedEntry(results, savedWordId, base) ?? results[0];
      const gloss = entry?.definitions ? firstGloss(entry.definitions) : null;
      _l1DefCache.set(cacheKey, gloss ?? '');
      if (entry?.id) setL1CachedEntry(base, l1Code, entry);
      return gloss;
    })
    .catch(() => null)
    .finally(() => {
      _l1DefInflight.delete(cacheKey);
    });

  _l1DefInflight.set(cacheKey, promise);
  return promise;
}
