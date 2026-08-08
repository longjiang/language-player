import React, { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from './AuthContext';
import { useSavedWordApi } from '@langplayer/api-client';
import {
  decomposeWordId,
  type DictionaryEntry,
  type LlmGeneratedEntry,
  type SavedLexicalItemRecord,
  type SavedLexicalItemStore,
  type SavedWordContext,
} from '@langplayer/shared';
import { log, logwarn } from '@/lib/logger';
import { enqueueSyncOp, subscribeEntity } from '@/lib/sync-engine';
import { getEntityCache } from '@/lib/sync-db';
import { getOfflineEntryById } from '@/lib/dictionary-db';
import { isOfflineModeEnabled } from '@/lib/offline-mode';

const STORAGE_KEY = 'zthSavedWords';
const LEGACY_PENDING_OPS_KEY = 'zthSavedWordsPendingOps';

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
  /** Offline + online enrichment both failed; render without a spinner. */
  unresolvable?: boolean;
}

type SavedWordsStore = Record<string, SavedWordMeta[]>;

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
  const { getSavedWords: fetchSavedWordRows } = useSavedWordApi();
  const [savedWords, setSavedWords] = useState<SavedWordsStore>({});
  const [loaded, setLoaded] = useState(false);
  const hydratedUserId = useRef<string | null>(null);

  // Load from SecureStore on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SavedWordsStore;
          if (!cancelled) setSavedWords(parsed);
        }
        // Migrate the pre-Phase-2 pending-op queue into the durable outbox.
        const legacyRaw = await SecureStore.getItemAsync(LEGACY_PENDING_OPS_KEY);
        if (legacyRaw) {
          const legacy = JSON.parse(legacyRaw) as Array<{
            type: 'put' | 'delete';
            l2: string;
            wordId: string;
            word?: SavedLexicalItemRecord;
            updatedAt?: number;
          }>;
          if (Array.isArray(legacy)) {
            for (const op of legacy) {
              if (!op || !op.l2 || !op.wordId) continue;
              await enqueueSyncOp({
                entity: 'saved_word',
                entityId: `${op.l2}::${op.wordId}`,
                op: op.type === 'delete' ? 'delete' : 'upsert',
                payload: {
                  l2: op.l2,
                  wordId: op.wordId,
                  ...(op.word ? { word: op.word } : {}),
                },
                updatedAt: op.updatedAt ?? Date.now(),
              });
            }
            await SecureStore.deleteItemAsync(LEGACY_PENDING_OPS_KEY);
            log(`[SavedWordsContext] migrated ${legacy.length} legacy pending ops into outbox`);
          }
        }
      } catch (err) {
        logwarn('[SavedWordsContext] error loading from SecureStore:', err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Hydrate from the server (after replaying pending ops)
  useEffect(() => {
    if (!user || !loaded) return;
    if (hydratedUserId.current === user.id) return;
    hydratedUserId.current = user.id;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchSavedWordRows();
        if (cancelled) return;
        const local = storeToLocal(res.words ?? {});
        setSavedWords(local);
        SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(local)).catch(() => {});
      } catch (err) {
        logwarn('[SavedWordsContext] Hydration failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, loaded, fetchSavedWordRows]);

  // Pull-merge bridge: when the engine applies remote saved-word changes,
  // rebuild the local store from entity_cache (tombstones remove rows).
  useEffect(() => {
    const applyCache = async () => {
      try {
        const rows = await getEntityCache('saved_word');
        setSavedWords((prev) => {
          const next: SavedWordsStore = { ...prev };
          for (const row of rows) {
            const payload = JSON.parse(row.payload) as {
              l2?: string;
              wordId?: string;
              word?: SavedLexicalItemRecord;
            };
            if (!payload.l2) continue;
            const l2 = payload.l2;
            if (row.deleted_at != null) {
              next[l2] = (next[l2] ?? []).filter((w) => w.id !== payload.wordId);
              continue;
            }
            if (!payload.word) continue;
            const list = next[l2] ?? [];
            if (!list.some((w) => w.id === payload.word!.id)) {
              next[l2] = [...list, toLocalMeta(payload.word)];
            }
          }
          SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
      } catch (e) {
        logwarn('[SavedWordsContext] pull merge failed:', e);
      }
    };
    const unsub = subscribeEntity('saved_word', () => {
      void applyCache();
    });
    return unsub;
  }, []);

  const queueRowOp = useCallback((op: {
    type: 'put' | 'delete';
    l2: string;
    wordId: string;
    word?: SavedLexicalItemRecord;
    updatedAt?: number;
  }) => {
    if (!user) return;
    log(`[SavedWordsContext] enqueue ${op.type} saved_word ${op.l2}::${op.wordId}`);
    void enqueueSyncOp({
      entity: 'saved_word',
      entityId: `${op.l2}::${op.wordId}`,
      op: op.type === 'delete' ? 'delete' : 'upsert',
      payload: {
        l2: op.l2,
        wordId: op.wordId,
        ...(op.word ? { word: op.word } : {}),
      },
      updatedAt: op.updatedAt ?? Date.now(),
    }).catch((e) => {
      logwarn('[SavedWordsContext] enqueue failed:', e);
    });
  }, [user]);

  const saveWord = useCallback((l2Code: string, meta: SavedWordMeta) => {
    const savedAt = new Date().toISOString();
    setSavedWords((prev) => {
      const langWords = prev[l2Code] ?? [];
      if (langWords.some((w) => w.id === meta.id)) return prev;
      const next = { ...prev, [l2Code]: [...langWords, { ...meta, savedAt }] };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    queueRowOp({ type: 'put', l2: l2Code, wordId: meta.id, word: toServerRecord({ ...meta, savedAt }), updatedAt: Date.now() });
  }, [queueRowOp]);

  const removeWord = useCallback((l2Code: string, wordId: string) => {
    setSavedWords((prev) => {
      const next = { ...prev, [l2Code]: (prev[l2Code] ?? []).filter((w) => w.id !== wordId) };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    queueRowOp({ type: 'delete', l2: l2Code, wordId, updatedAt: Date.now() });
  }, [queueRowOp]);

  const hasWord = useCallback((l2Code: string, wordId: string): boolean => {
    return (savedWords[l2Code] ?? []).some((w) => w.id === wordId);
  }, [savedWords]);

  const clearAll = useCallback((l2Code: string) => {
    const current = savedWords[l2Code] ?? [];
    setSavedWords((prev) => {
      const next = { ...prev, [l2Code]: [] };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    for (const w of current) {
      queueRowOp({ type: 'delete', l2: l2Code, wordId: w.id, updatedAt: Date.now() });
    }
  }, [queueRowOp, savedWords]);

  const refreshEntry = useCallback(async (l2Code: string, wordId: string) => {
    const words = savedWords[l2Code] ?? [];
    const existing = words.find((w) => w.id === wordId);
    if (!existing) return;
    if (existing.head && (existing.canonicalEntry || existing.llmEntry)) return;
    if (existing.unresolvable && isOfflineModeEnabled()) return;

    const decomposed = decomposeWordId(wordId, l2Code);
    if (!decomposed) return;
    const { dict: dictId, id: scopedId } = decomposed;
    const baseL2 = l2Code.split('-')[0];

    const applyEntry = (entry: DictionaryEntry | null, unresolvable: boolean) => {
      setSavedWords((prev) => {
        const updated = { ...prev };
        updated[l2Code] = (prev[l2Code] ?? []).map((w) =>
          w.id === wordId
            ? {
                ...w,
                ...(entry
                  ? {
                      head: entry.head,
                      dictionaryId: dictId,
                      entryId: scopedId,
                      canonicalEntry: entry,
                    }
                  : {}),
                unresolvable,
              }
            : w,
        );
        SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    };

    // 1. Offline dictionary first — works in airplane mode and avoids the
    //    network round-trip for downloaded languages.
    try {
      const offline = await getOfflineEntryById(baseL2, scopedId);
      if (offline) {
        log('[SavedWordsContext] offline entry hit — l2:', baseL2, 'wordId:', wordId, 'head:', offline.head);
        applyEntry(offline, false);
        return;
      }
    } catch { /* no offline dict / corrupt — try network */ }

    // 2. Network (skip entirely in Offline Mode; the gate would reject it).
    if (isOfflineModeEnabled()) {
      applyEntry(null, true);
      return;
    }
    try {
      const { apiClient } = await import('@langplayer/api-client');
      // The endpoint takes query params, not path segments. Using the old
      // path form 404'd, leaving every saved-word card stuck on its spinner.
      const res = await apiClient.get('/dictionary/entry', {
        params: { l2: baseL2, dict: dictId, id: scopedId },
      });
      const entry = (res as any)?.entry as DictionaryEntry | undefined;
      if (entry) {
        applyEntry(entry, false);
        return;
      }
    } catch (e) {
      logwarn('[SavedWordsContext] entry enrichment failed — l2:', l2Code, 'wordId:', wordId, 'error:', (e as Error)?.message ?? e);
    }
    // Unresolvable — stop the spinner rather than hanging forever.
    applyEntry(null, true);
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
