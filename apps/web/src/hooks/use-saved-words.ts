'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import type { SavedLexicalItemRecord, SavedLexicalItemStore } from '@langplayer/shared';
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
      // Avoid duplicates by id
      if (langWords.some(w => w.id === word.id)) return prev;
      langWords.push(word);
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

// ── Helpers ──

/** Merge cloud data into local. Newer date wins per word, cloud-only words are added. */
export function mergeSavedWords(local: SavedLexicalItemStore, cloud: SavedLexicalItemStore): SavedLexicalItemStore {
  const merged: SavedLexicalItemStore = { ...local };

  for (const [l2, cloudWords] of Object.entries(cloud)) {
    const localWords = [...(merged[l2] ?? [])];
    const localById = new Map(localWords.map(w => [w.id, w]));

    for (const cw of cloudWords) {
      const lw = localById.get(cw.id);
      if (!lw) {
        // Word only on cloud — add it
        localWords.push(cw);
      } else if (cw.date > lw.date) {
        // Both have it, cloud is newer — replace
        const idx = localWords.indexOf(lw);
        localWords[idx] = cw;
      }
      // else: local is newer or same — keep local
    }
    merged[l2] = localWords;
  }

  return merged;
}
