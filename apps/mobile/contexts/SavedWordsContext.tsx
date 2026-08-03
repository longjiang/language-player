import React, { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from './AuthContext';
import { useCloudUserData } from './UserDataContext';
import { useSavedWordApi } from '@langplayer/api-client';
import { enqueuePendingOp, flushPendingOps, type PendingSavedWordOp } from '@langplayer/utils';
import {
  decomposeWordId,
  type DictionaryEntry,
  type LlmGeneratedEntry,
  type SavedLexicalItemRecord,
  type SavedLexicalItemStore,
  type SavedWordContext,
} from '@langplayer/shared';
import { logwarn } from '@/lib/logger';
import { savedWordsRowApiEnabled } from '@/lib/saved-words-feature';

const STORAGE_KEY = 'zthSavedWords';
const PENDING_OPS_KEY = 'zthSavedWordsPendingOps';
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

/** Map a mobile SavedWordMeta to the server's SavedLexicalItemRecord shape. */
function toServerRecord(meta: SavedWordMeta): SavedLexicalItemRecord {
  const forms = meta.forms?.length ? meta.forms : [meta.head ?? meta.id];
  let date = typeof meta.date === 'number'
    ? meta.date
    : (meta.savedAt ? Date.parse(meta.savedAt) : Date.now());
  if (!Number.isFinite(date)) date = Date.now();
  return {
    id: meta.id,
    forms,
    date,
    context: meta.context as SavedWordContext | undefined,
  };
}

/** Map a server SavedLexicalItemRecord back to a mobile SavedWordMeta. */
function toLocalMeta(record: SavedLexicalItemRecord): SavedWordMeta {
  return {
    id: record.id,
    head: record.forms?.[0] ?? record.context?.form,
    forms: record.forms,
    date: record.date,
    context: record.context ? { ...record.context } : undefined,
  };
}

function storeToLocal(server: SavedLexicalItemStore): SavedWordsStore {
  const out: SavedWordsStore = {};
  for (const [l2, records] of Object.entries(server)) {
    out[l2] = records.map(toLocalMeta);
  }
  return out;
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
  const { getSavedWords: fetchSavedWordRows, putSavedWord, deleteSavedWord } = useSavedWordApi();
  const rowApi = savedWordsRowApiEnabled();
  const [savedWords, setSavedWords] = useState<SavedWordsStore>({});
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);
  const hydratedUserId = useRef<string | null>(null);
  const pendingOpsRef = useRef<PendingSavedWordOp[]>([]);

  const loadPendingOps = useCallback(async (): Promise<PendingSavedWordOp[]> => {
    try {
      const raw = await SecureStore.getItemAsync(PENDING_OPS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (op): op is PendingSavedWordOp =>
              !!op && (op.type === 'put' || op.type === 'delete')
              && typeof op.l2 === 'string' && typeof op.wordId === 'string',
          );
        }
      }
    } catch (err) {
      logwarn('[SavedWordsContext] error loading pending ops:', err);
    }
    return [];
  }, []);

  const savePendingOps = useCallback((ops: PendingSavedWordOp[]) => {
    pendingOpsRef.current = ops;
    SecureStore.setItemAsync(PENDING_OPS_KEY, JSON.stringify(ops)).catch(() => {});
  }, []);

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
          }
        }
        if (rowApi) savePendingOps(await loadPendingOps());
      } catch (err) {
        logwarn('[SavedWordsContext] error loading from SecureStore:', err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [rowApi, savePendingOps, loadPendingOps]);

  const flushPending = useCallback(async () => {
    if (!user) return;
    const remaining = await flushPendingOps(pendingOpsRef.current, { putSavedWord, deleteSavedWord });
    if (remaining.length > 0) {
      logwarn('[SavedWordsContext] Pending ops remain after flush:', remaining.length);
    }
    savePendingOps(remaining);
  }, [user, putSavedWord, deleteSavedWord, savePendingOps]);

  // Row API: hydrate from the server (after replaying pending ops)
  useEffect(() => {
    if (!rowApi || !user || !loaded) return;
    if (hydratedUserId.current === user.id) return;
    hydratedUserId.current = user.id;
    let cancelled = false;
    (async () => {
      try {
        await flushPending();
        const res = await fetchSavedWordRows();
        if (cancelled) return;
        const local = storeToLocal(res.words ?? {});
        setSavedWords(local);
        SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(local)).catch(() => {});
      } catch (err) {
        logwarn('[SavedWordsContext] Row-API hydration failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [rowApi, user, loaded, flushPending, fetchSavedWordRows]);

  // Legacy path: merge cloud data
  useEffect(() => {
    if (rowApi) return;
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
      logwarn('[SavedWordsContext] error parsing cloud data:', err);
    }
  }, [rowApi, user, loaded, cloudLoaded, cloudData]);

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
        logwarn('[SavedWordsContext] Cloud sync failed:', err);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [user]);

  const queueRowOp = useCallback((op: PendingSavedWordOp) => {
    if (!user) return;
    savePendingOps(enqueuePendingOp(pendingOpsRef.current, op));
    void flushPending();
  }, [user, savePendingOps, flushPending]);

  const saveWord = useCallback((l2Code: string, meta: SavedWordMeta) => {
    const savedAt = new Date().toISOString();
    setSavedWords((prev) => {
      const langWords = prev[l2Code] ?? [];
      if (langWords.some((w) => w.id === meta.id)) return prev;
      const next = { ...prev, [l2Code]: [...langWords, { ...meta, savedAt }] };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      if (!rowApi) scheduleSync(next);
      return next;
    });
    if (rowApi) {
      queueRowOp({ type: 'put', l2: l2Code, wordId: meta.id, word: toServerRecord({ ...meta, savedAt }), updatedAt: Date.now() });
    }
  }, [scheduleSync, rowApi, queueRowOp]);

  const removeWord = useCallback((l2Code: string, wordId: string) => {
    setSavedWords((prev) => {
      const next = { ...prev, [l2Code]: (prev[l2Code] ?? []).filter((w) => w.id !== wordId) };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      if (!rowApi) scheduleSync(next);
      return next;
    });
    if (rowApi) queueRowOp({ type: 'delete', l2: l2Code, wordId, updatedAt: Date.now() });
  }, [scheduleSync, rowApi, queueRowOp]);

  const hasWord = useCallback((l2Code: string, wordId: string): boolean => {
    return (savedWords[l2Code] ?? []).some((w) => w.id === wordId);
  }, [savedWords]);

  const clearAll = useCallback((l2Code: string) => {
    const current = savedWords[l2Code] ?? [];
    setSavedWords((prev) => {
      const next = { ...prev, [l2Code]: [] };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      if (!rowApi) scheduleSync(next);
      return next;
    });
    if (rowApi) {
      for (const w of current) {
        queueRowOp({ type: 'delete', l2: l2Code, wordId: w.id, updatedAt: Date.now() });
      }
    }
  }, [scheduleSync, rowApi, queueRowOp, savedWords]);

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
