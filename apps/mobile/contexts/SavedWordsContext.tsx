import React, { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from './AuthContext';
import { useCloudUserData } from './UserDataContext';
import { decomposeWordId, type DictionaryEntry, type LlmGeneratedEntry } from '@langplayer/shared';

const STORAGE_KEY = 'zthSavedWords';
const SYNC_DEBOUNCE_MS = 2000;

export interface SavedWordMeta {
  id: string;
  head?: string;
  dictionaryId?: string;
  entryId?: string;
  savedAt?: string;
  forms?: string[];
  date?: number;
  context?: Record<string, unknown>;
  canonicalEntry?: DictionaryEntry;
  llmEntry?: LlmGeneratedEntry;
}

type SavedWordsStore = Record<string, SavedWordMeta[]>;

function mergeSavedWords(local: SavedWordsStore, cloud: SavedWordsStore): SavedWordsStore {
  const merged = { ...local };
  for (const [lang, words] of Object.entries(cloud)) {
    const existing = merged[lang] ?? [];
    const existingIds = new Set(existing.map((w) => w.id));
    const newWords = words.filter((w) => !existingIds.has(w.id));
    merged[lang] = [...existing, ...newWords];
  }
  return merged;
}

interface SavedWordsContextValue {
  savedWords: SavedWordsStore;
  loaded: boolean;
  saveWord: (l2Code: string, meta: SavedWordMeta) => void;
  removeWord: (l2Code: string, wordId: string) => void;
  hasWord: (l2Code: string, wordId: string) => boolean;
  clearAll: (l2Code: string) => void;
  refreshEntry: (l2Code: string, wordId: string) => Promise<void>;
}

const SavedWordsContext = createContext<SavedWordsContextValue | null>(null);

export function SavedWordsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: cloudData, loaded: cloudLoaded } = useCloudUserData();
  const [savedWords, setSavedWords] = useState<SavedWordsStore>({});
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);

  // Load from SecureStore on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SavedWordsStore;
          if (!cancelled) {
            setSavedWords(parsed);
            setLoaded(true);
          }
        } else {
          if (!cancelled) setLoaded(true);
        }
      } catch (err) {
        console.warn('[SavedWordsContext] error loading from SecureStore:', err);
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Merge cloud data
  useEffect(() => {
    if (!user || !loaded || !cloudLoaded || !cloudData?.saved_words) return;
    try {
      const cloud = JSON.parse(cloudData.saved_words) as SavedWordsStore;
      setSavedWords((prev) => {
        const merged = mergeSavedWords(prev, cloud);
        if (merged === prev) return prev;
        SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged));
        return merged;
      });
    } catch (err) {
      console.warn('[SavedWordsContext] error parsing cloud data:', err);
    }
  }, [user, loaded, cloudLoaded, cloudData]);

  const scheduleSync = useCallback((words: SavedWordsStore) => {
    if (!user) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        const { apiClient } = await import('@langplayer/api-client');
        await apiClient.post('/user-data/sync', { saved_words: JSON.stringify(words) });
      } catch (err) {
        console.warn('[SavedWordsContext] Cloud sync failed:', err);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [user]);

  const saveWord = useCallback((l2Code: string, meta: SavedWordMeta) => {
    setSavedWords((prev) => {
      const langWords = prev[l2Code] ?? [];
      if (langWords.some((w) => w.id === meta.id)) return prev;
      const next = { ...prev, [l2Code]: [...langWords, { ...meta, savedAt: new Date().toISOString() }] };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      scheduleSync(next);
      return next;
    });
  }, [scheduleSync]);

  const removeWord = useCallback((l2Code: string, wordId: string) => {
    setSavedWords((prev) => {
      const next = { ...prev, [l2Code]: (prev[l2Code] ?? []).filter((w) => w.id !== wordId) };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      scheduleSync(next);
      return next;
    });
  }, [scheduleSync]);

  const hasWord = useCallback((l2Code: string, wordId: string): boolean => {
    return (savedWords[l2Code] ?? []).some((w) => w.id === wordId);
  }, [savedWords]);

  const clearAll = useCallback((l2Code: string) => {
    setSavedWords((prev) => {
      const next = { ...prev, [l2Code]: [] };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      scheduleSync(next);
      return next;
    });
  }, [scheduleSync]);

  const refreshEntry = useCallback(async (l2Code: string, wordId: string) => {
    const words = savedWords[l2Code] ?? [];
    const existing = words.find((w) => w.id === wordId);
    if (!existing || (existing.head && (existing.canonicalEntry || existing.llmEntry))) return;

    try {
      const decomposed = decomposeWordId(wordId, l2Code);
      if (!decomposed) return;
      const { dict: dictId, id: scopedId } = decomposed;
      const { apiClient } = await import('@langplayer/api-client');
      const res = await apiClient.get(`/dictionary/entry/${l2Code}/${dictId}/${scopedId}`);
      const entry = (res as any)?.entry as DictionaryEntry | undefined;
      if (!entry) return;

      setSavedWords((prev) => {
        const updated = { ...prev };
        const langWords = (prev[l2Code] ?? []).map((w) =>
          w.id === wordId
            ? { ...w, head: entry.head, dictionaryId: dictId, entryId: scopedId, canonicalEntry: entry }
            : w,
        );
        updated[l2Code] = langWords;
        SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch { /* skip */ }
  }, [savedWords]);

  return (
    <SavedWordsContext.Provider value={{ savedWords, loaded, saveWord, removeWord, hasWord, clearAll, refreshEntry }}>
      {children}
    </SavedWordsContext.Provider>
  );
}

export function useSavedWordsContext(): SavedWordsContextValue {
  const ctx = useContext(SavedWordsContext);
  if (!ctx) {
    throw new Error('useSavedWordsContext must be used within a SavedWordsProvider');
  }
  return ctx;
}
