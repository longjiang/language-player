/**
 * Saved words for the Language Player extension.
 *
 * Uses the Supabase row API through Flask (SPEC-034): GET/PUT /saved-words
 * and DELETE /saved-words/{l2}/{wordId}. The old full-blob /user-data and
 * /user-data/sync endpoints were removed in SPEC-039 WS-8 (2026-08-10).
 */

import type { SavedLexicalItemRecord, SavedLexicalItemStore } from '@langplayer/shared';
import { authorizedFetch } from './auth';
import { log, logwarn } from './i18n';

const API_BASE = 'https://pythonvps.zerotohero.ca';

/** Fetch the full saved words store for the authenticated user. */
export async function fetchSavedWords(l2?: string): Promise<SavedLexicalItemStore> {
  const query = l2 ? `?l2=${encodeURIComponent(l2)}` : '';
  const res = await authorizedFetch(`${API_BASE}/saved-words${query}`);
  if (!res) return {};

  if (!res.ok) {
    logwarn('Failed to fetch saved words:', res.status);
    return {};
  }

  const data = await res.json();
  return (data?.words ?? {}) as SavedLexicalItemStore;
}

/** Upsert one word (server merges forms + instances; Supabase row API). */
export async function putSavedWord(
  l2: string,
  word: SavedLexicalItemRecord,
): Promise<SavedLexicalItemRecord | null> {
  log('[SAVE] Upserting word:', l2, word.id);
  const res = await authorizedFetch(`${API_BASE}/saved-words`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ l2, word }),
  });
  if (!res) return null;

  if (!res.ok) {
    logwarn('Failed to upsert saved word:', res.status);
    return null;
  }

  const data = await res.json();
  return (data?.word ?? word) as SavedLexicalItemRecord;
}

/** Hard-delete one saved word (instances cascade server-side). */
export async function deleteSavedWord(l2: string, wordId: string): Promise<boolean> {
  const res = await authorizedFetch(
    `${API_BASE}/saved-words/${encodeURIComponent(l2)}/${encodeURIComponent(wordId)}`,
    { method: 'DELETE' },
  );
  if (!res) return false;
  if (!res.ok) {
    logwarn('Failed to delete saved word:', res.status);
    return false;
  }
  return true;
}

/** Fetch inflected forms for a word in a given language. */
export async function fetchInflectedForms(
  head: string,
  l2Code: string,
): Promise<string[]> {
  const base = l2Code.split('-')[0]!;
  const endpoints: Record<string, string> = {
    ja: '/inflect-japanese',
    ko: '/inflect-korean',
    ru: '/inflect-pymorphy',
    uk: '/inflect-pymorphy',
    en: '/inflect-pattern',
    fr: '/inflect-pattern',
    de: '/inflect-pattern',
    es: '/inflect-pattern',
    it: '/inflect-pattern',
    nl: '/inflect-pattern',
  };

  const endpoint = endpoints[base];
  if (!endpoint) return [head];

  try {
    const res = await fetch(
      `${API_BASE}${endpoint}?text=${encodeURIComponent(head)}&lang=${base}`,
    );
    if (!res.ok) return [head];
    const data = await res.json();
    const forms: string[] = (Array.isArray(data) ? data : [])
      .map((f: any) => (typeof f === 'string' ? f : (f.form as string)))
      .filter((f: string) => f && f.length > 1 && f !== head);
    // Deduplicate, keeping the head first
    const seen = new Set([head]);
    const result = [head];
    for (const f of forms) {
      if (!seen.has(f)) {
        seen.add(f);
        result.push(f);
      }
    }
    return result;
  } catch {
    return [head];
  }
}
