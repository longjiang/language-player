'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import type { SavedLexicalItemRecord, SavedLexicalItemStore, SavedLexicalItemInstance } from '@langplayer/shared';
import { useUserData } from '@langplayer/api-client';
import { useCloudUserData } from '@/providers/user-data-provider';

const STORAGE_KEY = 'zthSavedWords'; // match Classic for migration compatibility
const SYNC_DEBOUNCE_MS = 2000;

/**
 * Hook for managing saved words with localStorage + cloud sync.
 *
 * - Read/write localStorage immediately (offline-first)
 * - If authenticated, sync the full blob to Directus via Flask /user-data/sync
 * - On login, load from cloud and merge with local (cloud ∪ local, by id per L2)
 */
export function useSavedWords() {
  const { data: session, status } = useSession();
  const { getUserData, syncSavedWords } = useUserData();
  const { data: cloudData, loaded: cloudLoaded } = useCloudUserData();
  const [savedWords, setSavedWords] = useState<SavedLexicalItemStore>({});
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);

  // ── On mount: load from localStorage if not logged in, else load from cloud ──
  useEffect(() => {
    if (loaded) return;
    // Don't touch localStorage while session is still loading — we don't know
    // which user (if any) is logged in yet.  Cloud load handles the logged-in path.
    if (status === 'loading') return;
    if (status !== 'authenticated') {
      // Not logged in — load from localStorage (anonymous mode)
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed === 'object' && parsed !== null) {
            sanitizeStore(parsed);
            setSavedWords(parsed);
          }
        }
      } catch { /* corrupted data */ }
    }
    // Logged in — localStorage is skipped; cloud load (next effect) will hydrate
    setLoaded(true);
  }, [status, loaded]);

  // ── On cloud load, merge cloud data (newer date wins per word) ──
  useEffect(() => {
    if (status !== 'authenticated' || !loaded || !cloudLoaded) return;
    if (!cloudData) return;

    try {
      const cloud = cloudData.saved_words
        ? (JSON.parse(cloudData.saved_words) as SavedLexicalItemStore)
        : {};
      setSavedWords((prev) => {
        const merged = mergeSavedWords(prev, cloud);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
        return merged;
      });
    } catch (err) {
      console.warn('[savedWords] Could not parse cloud data:', err);
    }
  }, [status, loaded, cloudLoaded, cloudData]);

  // ── Debounced cloud sync (read-merge-write) ──
  const scheduleSync = useCallback((words: SavedLexicalItemStore) => {
    if (!session) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        // Read-merge-write: avoid overwriting changes from other devices
        const cloudResp = await getUserData();
        if (cloudResp?.saved_words) {
          const cloud = JSON.parse(cloudResp.saved_words) as SavedLexicalItemStore;
          words = mergeSavedWords(words, cloud);
        }
        await syncSavedWords(JSON.stringify(words));
      } catch (err) {
        console.warn('[savedWords] Sync failed:', err);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [session, getUserData]);

  // ── Persist to localStorage + schedule sync ──
  const persist = useCallback((words: SavedLexicalItemStore) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
    } catch { /* quota exceeded — ignore */ }
    scheduleSync(words);
  }, [scheduleSync]);

  // ── Public API ──

  const saveWord = useCallback((l2Code: string, word: SavedLexicalItemRecord) => {
    setSavedWords(prev => {
      const langWords = [...(prev[l2Code] ?? [])];
      const existing = langWords.find(w => w.id === word.id);
      if (existing) {
        // Word already saved — append new instances, merge forms
        const existingInsts = normalizeInstances(existing);
        const newInsts = normalizeInstances(word);
        const seen = new Set(existingInsts.map(i => `${i.timestamp}|${i.form}|${i.context.text}`));
        for (const ni of newInsts) {
          const key = `${ni.timestamp}|${ni.form}|${ni.context.text}`;
          if (!seen.has(key)) {
            existingInsts.push(ni);
            seen.add(key);
          }
        }
        existing.instances = existingInsts;
        existing.forms = [...new Set([...(existing.forms ?? []), ...(word.forms ?? [])])];
        existing.date = Math.max(existing.date, word.date);
        // Keep legacy context in sync (= latest instance)
        existing.context = existingInsts[existingInsts.length - 1]!.context;
      } else {
        // New word — ensure instances array is populated
        if (!word.instances || word.instances.length === 0) {
          word.instances = normalizeInstances(word);
        }
        sanitizeForms(word);
        langWords.push(word);
      }
      const next = { ...prev, [l2Code]: langWords };
      persist(next);
      return next;
    });
  }, [persist]);

  const removeSavedWord = useCallback((l2Code: string, wordId: string) => {
    setSavedWords(prev => {
      const langWords = (prev[l2Code] ?? []).filter(w => w.id !== wordId);
      const next = { ...prev, [l2Code]: langWords };
      persist(next);
      return next;
    });
  }, [persist]);

  const hasSavedWord = useCallback((l2Code: string, wordId: string): boolean => {
    return (savedWords[l2Code] ?? []).some(w => w.id === wordId);
  }, [savedWords]);

  const getSavedWords = useCallback((l2Code: string): SavedLexicalItemRecord[] => {
    // Return newest first
    return [...(savedWords[l2Code] ?? [])].sort((a, b) => b.date - a.date);
  }, [savedWords]);

  const clearSavedWords = useCallback((l2Code: string) => {
    setSavedWords(prev => {
      const next = { ...prev, [l2Code]: [] };
      persist(next);
      return next;
    });
  }, [persist]);

  return {
    savedWords,
    loaded,
    saveWord,
    removeSavedWord,
    hasSavedWord,
    getSavedWords,
    clearSavedWords,
  };
}

// ── Instance Helpers ──────────────────────────

/** Normalize a record to its instances array, handling legacy single-context records.
 *  Ensures every record can be treated uniformly as having `instances[]`. */
export function normalizeInstances(record: SavedLexicalItemRecord): SavedLexicalItemInstance[] {
  if (record.instances && record.instances.length > 0) {
    return record.instances;
  }
  // Legacy record with only the flat `context` field
  if (record.context) {
    return [{
      timestamp: record.date,
      form: record.context.form,
      context: record.context,
    }];
  }
  return [];
}

/** Ensure every record has a forms array. Falls back to context.form or '?' for legacy records. */
function sanitizeForms(record: SavedLexicalItemRecord): void {
  if (!Array.isArray(record.forms) || record.forms.length === 0) {
    record.forms = [record.context?.form ?? '?'];
  }
}

/** Ensure a record has at least a minimal valid context. */
function sanitizeContext(record: SavedLexicalItemRecord): void {
  if (!record.context || (!record.context.form && !record.context.text)) {
    const head = record.forms?.[0] ?? '?';
    record.context = { form: head, text: head, textTitle: '' };
  }
}

/** Sanitize an entire store — ensures every record in every L2 has forms + context. */
function sanitizeStore(store: SavedLexicalItemStore): void {
  for (const [l2, words] of Object.entries(store)) {
    store[l2] = words.filter(w => {
      // Drop records that are completely unrecoverable (no id, no forms, no context)
      if (!w.id) return false;
      sanitizeForms(w);
      sanitizeContext(w);
      if (typeof w.date !== 'number') w.date = Date.now();
      return true;
    });
  }
}

/** Merge two instance arrays, deduping by timestamp+form+text. */
export function mergeInstances(
  a: SavedLexicalItemInstance[],
  b: SavedLexicalItemInstance[],
): SavedLexicalItemInstance[] {
  const seen = new Set<string>();
  const result: SavedLexicalItemInstance[] = [];
  for (const inst of [...a, ...b]) {
    const key = `${inst.timestamp}|${inst.form}|${inst.context.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(inst);
    }
  }
  return result.sort((x, y) => x.timestamp - y.timestamp);
}

// ── Merge Helpers ──

/** Merge cloud data into local. Merges instances per word, newer date wins per word, cloud-only words are added. */
export function mergeSavedWords(local: SavedLexicalItemStore, cloud: SavedLexicalItemStore): SavedLexicalItemStore {
  const merged: SavedLexicalItemStore = { ...local };

  for (const [l2, cloudWords] of Object.entries(cloud)) {
    const localWords = [...(merged[l2] ?? [])];
    const localById = new Map(localWords.map(w => [w.id, w]));

    for (const cw of cloudWords) {
      const lw = localById.get(cw.id);
      if (!lw) {
        localWords.push(cw);
      } else {
        // Merge instances from both, dedup
        lw.instances = mergeInstances(normalizeInstances(lw), normalizeInstances(cw));
        lw.forms = [...new Set([...(lw.forms ?? []), ...(cw.forms ?? [])])];
        lw.date = Math.max(lw.date, cw.date);
        lw.context = lw.instances[lw.instances.length - 1]!.context;
      }
    }
    merged[l2] = localWords;
  }

  return merged;
}
