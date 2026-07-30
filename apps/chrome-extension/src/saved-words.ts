/**
 * Saved words sync for the Prime Video Subtitle extension.
 *
 * Fetches and syncs saved words via the Python API (/user-data),
 * which proxies to Directus. The saved_words column is stored as a
 * JSON-encoded SavedLexicalItemStore:
 *
 *   { "ja": [SavedLexicalItemRecord, ...], "zh": [...], ... }
 */

import type { SavedLexicalItemRecord, SavedLexicalItemStore } from '@langplayer/shared';
import { getAuthState } from './auth';

const API_BASE = 'https://pythonvps.zerotohero.ca';

/** Fetch the full saved words store for the authenticated user. */
export async function fetchSavedWords(): Promise<SavedLexicalItemStore> {
  const auth = await getAuthState();
  if (!auth) return {};

  const res = await fetch(`${API_BASE}/user-data`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  if (!res.ok) {
    console.warn('[LPV] Failed to fetch saved words:', res.status);
    return {};
  }

  const data = await res.json();
  if (data.saved_words) {
    try {
      return JSON.parse(data.saved_words) as SavedLexicalItemStore;
    } catch {
      console.warn('[LPV] Failed to parse saved_words JSON');
      return {};
    }
  }

  return {};
}

/** Sync the full saved words store to the server. */
export async function syncSavedWords(store: SavedLexicalItemStore): Promise<void> {
  const auth = await getAuthState();
  if (!auth) return;

  const res = await fetch(`${API_BASE}/user-data/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify({
      saved_words: JSON.stringify(store),
    }),
  });

  if (!res.ok) {
    console.warn('[LPV] Failed to sync saved words:', res.status);
  }
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
