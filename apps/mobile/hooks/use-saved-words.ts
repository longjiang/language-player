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
  console.log('[savedWords] enrichMissingHeads — lang:', l2Code, 'total:', words.length, 'missing:', missing.length);

  const enriched = [...words];
  for (let i = 0; i < enriched.length; i++) {
    const w = enriched[i]!;
    if (w.head) continue;
    try {
      const decomposed = decomposeWordId(w.id, l2Code);
      if (!decomposed) {
        console.warn('[savedWords] enrichMissingHeads — could not decompose word id:', w.id);
        continue;
      }
      const { dict: dictId, id: scopedId } = decomposed;
      console.log('[savedWords] enrichMissingHeads — fetching entry:', { l2Code, dictId, scopedId });
      const res = await dict.getEntry(l2Code, dictId, scopedId);
      if (res?.entry?.head) {
        enriched[i] = { ...w, head: res.entry.head };
        console.log('[savedWords] enrichMissingHeads — enriched head for:', w.id, '->', res.entry.head);
      } else {
        console.warn('[savedWords] enrichMissingHeads — no head in response for:', w.id);
      }
    } catch (err) {
      console.warn('[savedWords] enrichMissingHeads — error fetching entry for', w.id, ':', err);
    }
  }
  console.log('[savedWords] enrichMissingHeads — done for lang:', l2Code);
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

  // Load from SecureStore — set loaded=true immediately so the UI renders,
  // then enrich missing heads in the background.
  useEffect(() => {
    let cancelled = false;
    console.log('[savedWords] EFFECT 1 — starting');
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        console.log('[savedWords] EFFECT 1 — SecureStore read, found:', !!raw);
        if (raw) {
          const parsed = JSON.parse(raw) as SavedWordsStore;
          console.log('[savedWords] EFFECT 1 — parsed keys:', Object.keys(parsed), 'counts:', Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, v.length])));
          if (!cancelled) {
            setSavedWords(parsed);
            setLoaded(true);
          }
          // Enrich missing heads in the background (don't block UI)
          let enriched = false;
          let enrichedStore = parsed;
          for (const lang of Object.keys(parsed)) {
            if (cancelled) return;
            const missingCount = parsed[lang].filter((w) => !w.head).length;
            if (missingCount === 0) continue;
            console.log('[savedWords] EFFECT 1 — enriching lang:', lang, 'missing heads:', missingCount);
            const result = await enrichMissingHeads(parsed, lang, dict);
            if (result[lang] !== enrichedStore[lang]) {
              enrichedStore = result;
              enriched = true;
              console.log('[savedWords] EFFECT 1 — enriched heads for lang:', lang);
            }
          }
          if (enriched && !cancelled) {
            console.log('[savedWords] EFFECT 1 — persisting enriched store');
            SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(enrichedStore));
            setSavedWords(enrichedStore);
          }
        } else {
          if (!cancelled) {
            setLoaded(true);
          }
        }
      } catch (err) {
        console.warn('[savedWords] EFFECT 1 — error loading from SecureStore:', err);
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge cloud data
  useEffect(() => {
    console.log('[savedWords] EFFECT 2 — deps:', { hasUser: !!user, loaded, cloudLoaded, hasCloudData: !!cloudData?.saved_words });
    if (!user || !loaded || !cloudLoaded || !cloudData?.saved_words) return;
    try {
      const cloud = JSON.parse(cloudData.saved_words) as SavedWordsStore;
      console.log('[savedWords] EFFECT 2 — merging cloud data, keys:', Object.keys(cloud));
      setSavedWords((prev) => {
        const merged = mergeSavedWords(prev, cloud);
        if (merged === prev) return prev; // skip no-op
        console.log('[savedWords] EFFECT 2 — merged, counts:', Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, v.length])));
        SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged));
        return merged;
      });
    } catch (err) {
      console.warn('[savedWords] EFFECT 2 — error parsing cloud data:', err);
    }
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
