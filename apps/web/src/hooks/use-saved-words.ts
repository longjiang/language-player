'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import type { SavedLexicalItemRecord, SavedLexicalItemStore, SavedLexicalItemInstance } from '@langplayer/shared';
import { useUserData } from '@langplayer/api-client';
import { useCloudUserData } from '@/providers/user-data-provider';
import { logwarn } from '@/lib/logger';

const STORAGE_KEY = 'zthSavedWords'; // match Classic for migration compatibility
const SYNC_DEBOUNCE_MS = 2000;

/**
 * Hook for managing saved words with localStorage + cloud sync.
 *
 * - Read/write localStorage immediately (offline-first)
 * - If authenticated, sync the full blob to Directus via Flask /user-data/sync
 * - On login, hydrate from cloud data (cloud is source of truth)
 * - Last-writer-wins on sync: local state is the user's intent (saves + deletes)
 */
export function useSavedWords() {
  const { data: session, status } = useSession();
  const { syncSavedWords } = useUserData();
  const { data: cloudData, loaded: cloudLoaded } = useCloudUserData();
  const [savedWords, setSavedWords] = useState<SavedLexicalItemStore>({});
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);

  // ── On mount: load from localStorage (offline-first, both anonymous & authed) ──
  // LocalStorage is always read first so that the latest local changes (saves,
  // unsaves) survive an immediate refresh — including the unsave-not-yet-synced
  // case, where cloud still holds a word the user just deleted. Cloud data is
  // then merged in (see below) without resurrecting locally-deleted words.
  useEffect(() => {
    if (loaded) return;
    if (status === 'loading') return; // still loading auth state

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

    setLoaded(true);
  }, [status, loaded]);

  // ── On cloud load, merge cloud data (local deletes win) ──
  // Cloud is a source of truth for words saved on OTHER devices, but it must
  // not resurrect a word the user deleted locally. We merge by only adding cloud
  // words that are not already present in local state (keyed by `id`). This
  // preserves local unsaves across a refresh while still importing new saves.
  //
  // Note: a cross-device delete where BOTH devices still have the word in
  // memory is a known limitation (addressed by the debounced sync updating
  // cloud). This prioritizes the far more common single-device refresh case.
  useEffect(() => {
    if (status !== 'authenticated' || !loaded || !cloudLoaded) return;
    if (!cloudData) return;

    try {
      const cloud = cloudData.saved_words
        ? (JSON.parse(cloudData.saved_words) as SavedLexicalItemStore)
        : {};
      sanitizeStore(cloud);

      setSavedWords((prev) => {
        // Build the merged store, preserving locally-deleted words by never
        // re-adding a cloud word whose id already exists in local state.
        const next: SavedLexicalItemStore = { ...prev };
        for (const [l2, cloudWords] of Object.entries(cloud)) {
          const merged = [...(prev[l2] ?? [])];
          const localIds = new Set(merged.map((w) => w.id));
          for (const cw of cloudWords) {
            if (!localIds.has(cw.id)) {
              merged.push(cw);
              localIds.add(cw.id);
            }
          }
          next[l2] = merged;
        }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    } catch (err) {
      logwarn('[savedWords] Could not parse cloud data:', err);
    }
  }, [status, loaded, cloudLoaded, cloudData]);

  // ── Debounced cloud sync (write local state directly) ──
  // Last-writer-wins: the local state represents the user's intent (saves + deletes).
  // Merging cloud data back in would re-add words the user deleted on another device,
  // making deletions non-propagating.
  const scheduleSync = useCallback((words: SavedLexicalItemStore) => {
    if (!session) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        await syncSavedWords(JSON.stringify(words));
      } catch (err) {
        logwarn('[savedWords] Sync failed — will retry:', err);
        // Retry after a delay so a transient failure doesn't silently drop a
        // save/unsave (which would let an unsaved word come back on refresh).
        syncTimer.current = setTimeout(() => {
          isSyncing.current = false;
          scheduleSync(words);
        }, 10_000);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [session, syncSavedWords]);

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
        // Sanitize cloud-only words before adding — they may have missing forms/context
        sanitizeForms(cw);
        sanitizeContext(cw);
        if (typeof cw.date !== 'number') cw.date = Date.now();
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
