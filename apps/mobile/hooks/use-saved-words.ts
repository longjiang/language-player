import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import { useUserData, useDictionary } from '@langplayer/api-client';
import { decomposeWordId } from '@langplayer/shared';
import { useCloudUserData } from '@/contexts/UserDataContext';

const STORAGE_KEY = 'zthSavedWords';
const SYNC_DEBOUNCE_MS = 2000;

interface SavedWordMeta {
  id: string;
  head?: string;          // mobile-v2 format
  dictionaryId?: string;  // mobile-v2 format
  entryId?: string;       // mobile-v2 format
  savedAt?: string;       // mobile-v2 format
  forms?: string[];       // Classic/Nuxt format
  date?: number;          // Classic/Nuxt format (millis)
  context?: Record<string, unknown>; // Classic/Nuxt format
}

type SavedWordsStore = Record<string, SavedWordMeta[]>; // keyed by L2 code

// ── Enrichment: fill missing heads for old saved-word records ──
async function enrichMissingHeads(
  store: SavedWordsStore,
  l2Code: string,
  dict: ReturnType<typeof useDictionary>,
): Promise<SavedWordsStore> {
  const words = store[l2Code] ?? [];
  const missing = words.filter((w) => !w.head);
  if (missing.length === 0) return store;

  const enriched = [...words];
  for (let i = 0; i < enriched.length; i++) {
    const w = enriched[i]!;
    if (w.head) continue;
    try {
      const decomposed = decomposeWordId(w.id, l2Code);
      if (!decomposed) continue;
      const { dict: dictId, id: scopedId } = decomposed;
      const res = await dict.getEntry(l2Code, dictId, scopedId);
      if (res?.entry?.head) {
        enriched[i] = { ...w, head: res.entry.head };
      }
    } catch { /* skip failed lookups */ }
  }
  return { ...store, [l2Code]: enriched };
}

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

export function useSavedWords() {
  const { user } = useAuth();
  const { getUserData } = useUserData();
  const { data: cloudData, loaded: cloudLoaded } = useCloudUserData();
  const dict = useDictionary();
  const [savedWords, setSavedWords] = useState<SavedWordsStore>({});
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);

  // Load from SecureStore
  useEffect(() => {
    if (loaded) return;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SavedWordsStore;
          // Enrich old records missing head words + persist
          let enriched = false;
          for (const lang of Object.keys(parsed)) {
            const result = await enrichMissingHeads(parsed, lang, dict);
            if (result[lang] !== parsed[lang]) {
              parsed = result;
              enriched = true;
            }
          }
          if (enriched) {
            SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(parsed));
          }
          setSavedWords(parsed);
        }
      } catch {}
      setLoaded(true);
    })();
  }, [loaded]);

  // Merge cloud data
  useEffect(() => {
    if (!user || !loaded || !cloudLoaded || !cloudData?.saved_words) return;
    try {
      const cloud = JSON.parse(cloudData.saved_words) as SavedWordsStore;
      setSavedWords((prev) => {
        const merged = mergeSavedWords(prev, cloud);
        SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged));
        return merged;
      });
    } catch {}
  }, [user, loaded, cloudLoaded, cloudData]);

  const scheduleSync = useCallback((words: SavedWordsStore) => {
    if (!user) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        const cloudResp = await getUserData();
        if (cloudResp?.saved_words) {
          const cloud = JSON.parse(cloudResp.saved_words) as SavedWordsStore;
          const merged = mergeSavedWords(words, cloud);
          SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged));
          setSavedWords(merged);
        }
        const { apiClient } = await import('@langplayer/api-client');
        await apiClient.post('/user-data/sync', { saved_words: JSON.stringify(words) });
      } catch (err) {
        console.warn('[savedWords] Cloud sync failed:', err);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [user, getUserData]);

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

  return { savedWords, loaded, saveWord, removeWord, hasWord, clearAll };
}
