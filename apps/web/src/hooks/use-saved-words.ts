'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import type { SavedWord, SavedWords, SavedWordContext } from '@langplayer/shared';
import { useUserData } from '@langplayer/api-client';

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
  const { data: session } = useSession();
  const { getUserData, syncSavedWords } = useUserData();
  const [savedWords, setSavedWords] = useState<SavedWords>({});
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);

  // ── Load from localStorage on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          setSavedWords(parsed);
        }
      }
    } catch { /* corrupted data — start fresh */ }
    setLoaded(true);
  }, []);

  // ── On login, merge cloud data ──
  useEffect(() => {
    if (!session || !loaded) return;

    const mergeFromCloud = async () => {
      try {
        const data = await getUserData();
        if (data?.saved_words) {
          const cloud = JSON.parse(data.saved_words) as SavedWords;
          setSavedWords(prev => mergeSavedWords(prev, cloud));
        }
      } catch (err) {
        // Not authenticated or network error — that's fine, keep local
        console.warn('[savedWords] Could not load from cloud:', err);
      }
    };
    mergeFromCloud();
  }, [session, loaded]);

  // ── Debounced cloud sync after local changes ──
  const scheduleSync = useCallback((words: SavedWords) => {
    if (!session) return;

    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        await syncSavedWords(JSON.stringify(words));
      } catch (err) {
        console.warn('[savedWords] Sync failed:', err);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [session]);

  // ── Persist to localStorage + schedule sync ──
  const persist = useCallback((words: SavedWords) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
    } catch { /* quota exceeded — ignore */ }
    scheduleSync(words);
  }, [scheduleSync]);

  // ── Public API ──

  const saveWord = useCallback((l2Code: string, word: SavedWord) => {
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

  const getSavedWords = useCallback((l2Code: string): SavedWord[] => {
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

/** Merge cloud data into local: local ∪ cloud, preferring local on conflict. */
export function mergeSavedWords(local: SavedWords, cloud: SavedWords): SavedWords {
  const merged: SavedWords = { ...local };

  for (const [l2, cloudWords] of Object.entries(cloud)) {
    const localWords = merged[l2] ?? [];
    const localIds = new Set(localWords.map(w => w.id));

    for (const cw of cloudWords) {
      if (!localIds.has(cw.id)) {
        localWords.push(cw);
      }
    }
    merged[l2] = localWords;
  }

  return merged;
}
