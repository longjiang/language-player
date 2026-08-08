import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionary } from '@langplayer/api-client';
import { useT } from '@/hooks/use-t';
import type { DictionaryEntry, DictMeta } from '@langplayer/shared';
import { log } from '@/lib/logger';
import {
  openDictionaryDB,
  lookupOffline,
  beginBulkInsert,
  insertBulkBatch,
  finishBulkInsert,
  abortBulkInsert,
  deleteDictionary as deleteDictDB,
  hasOfflineDictionary,
  saveDictMeta,
  getDictMeta,
} from '@/lib/dictionary-db';
import {
  downloadDictionaryData,
  type OfflineDictMeta,
} from '@/lib/dictionary-download';
import { downloadLemmaTable, deleteLemmaTable } from '@/lib/tokenizer-db';
import { TOKENIZER_CONFIG } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { SQLiteDatabase } from 'expo-sqlite';

// ── Sidebar / wordlist types ────────────────

export type SidebarSource =
  | { kind: 'saved' }
  | { kind: 'results'; items: DictionaryEntry[] }
  | {
      kind: 'wordlist';
      items: { head: string; dictionaryId: string; entryId: string; id: string; pronunciation?: string; definition?: string }[];
      currentId: string;
      /** Origin of the wordlist — used for the sidebar title ('corpus' → "Related"). */
      source?: 'search' | 'saved' | 'corpus';
    };

// ── Download state ──────────────────────────

export interface DownloadState {
  status: 'idle' | 'downloading' | 'completed' | 'failed';
  progress: number; // 0–100
  downloaded: number;
  total: number;
  phase?: 'dictionary' | 'insert' | 'lemma' | 'tokenizer' | 'finalizing';
  error?: string;
}

// ── Context shape ───────────────────────────

interface DictionaryContextValue {
  query: string;
  setQuery: (v: string) => void;
  results: DictionaryEntry[] | null;
  loading: boolean;
  error: string | null;
  message: string | null;
  searchedText: string;

  doSearch: (term: string) => Promise<void>;
  clearSearch: () => void;

  recentSearches: string[];
  clearRecent: () => void;

  cameFromSearch: boolean;
  setCameFromSearch: (v: boolean) => void;

  sidebarSource: SidebarSource;
  setSidebarSource: (s: SidebarSource) => void;
  detailHead: string | null;
  setDetailHead: (v: string | null) => void;

  /** Offline / download */
  startDownload: (l2: string) => Promise<void>;
  cancelDownload: (l2: string) => void;
  deleteDictionary: (l2: string) => Promise<void>;
  getDownloadState: (l2: string) => DownloadState;
  isOfflineAvailable: (l2: string) => Promise<boolean>;
  getDownloadedCount: (l2: string) => Promise<number>;
}

const DictionaryContext = createContext<DictionaryContextValue | null>(null);

import * as SecureStore from 'expo-secure-store';

// ── Session memory cache ────────────────────
// Caches online lookup results in memory to avoid redundant network
// calls within a session. Cleared when L2 changes.
const sessionCache = new Map<string, DictionaryEntry[]>();

/** Dictionary search shows real dictionary entries only — LLM-only results
 *  (e.g. nonsense words) should surface as "no results" instead. */
function stripLlmEntries(entries: DictionaryEntry[]): DictionaryEntry[] {
  return entries.filter(
    (e) => (e as any).kind !== 'llm' && (e as any).match_type !== 'llm',
  );
}

// ── Provider ────────────────────────────────

const RECENT_STORAGE_KEY = 'zthRecentSearches';
const MAX_RECENT = 10;

// In-memory fallback — SecureStore can be unavailable on iOS simulators
const memoryStore: Record<string, string> = {};

async function storageGet(key: string): Promise<string | null> {
  try { return await SecureStore.getItemAsync(key); } catch {}
  return memoryStore[key] ?? null;
}
async function storageSet(key: string, value: string) {
  try { await SecureStore.setItemAsync(key, value); } catch { memoryStore[key] = value; }
}
async function storageRemove(key: string) {
  try { await SecureStore.deleteItemAsync(key); } catch { delete memoryStore[key]; }
}

async function loadRecent(l2Code: string): Promise<string[]> {
  try {
    const raw = await storageGet(`${RECENT_STORAGE_KEY}:${l2Code}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

async function saveRecent(l2Code: string, term: string) {
  try {
    const prev = await loadRecent(l2Code);
    const filtered = prev.filter((t) => t !== term);
    filtered.unshift(term);
    const items = filtered.slice(0, MAX_RECENT);
    log('[Dict] saveRecent — l2:', l2Code, 'term:', term, 'items:', items.length);
    await storageSet(`${RECENT_STORAGE_KEY}:${l2Code}`, JSON.stringify(items));
  } catch (e) { log('[Dict] saveRecent failed:', e); }
}

export function DictionaryProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const { l1Lang, l2Lang } = useLanguage();
  const dict = useDictionary();
  const l2Code = l2Lang.code;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DictionaryEntry[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedText, setSearchedText] = useState('');

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [cameFromSearch, setCameFromSearch] = useState(false);
  const [sidebarSource, setSidebarSource] = useState<SidebarSource>({ kind: 'saved' });
  const [detailHead, setDetailHead] = useState<string | null>(null);

  // ── Offline / download state ──
  const dbRef = useRef<SQLiteDatabase | null>(null);
  const downloadStatesRef = useRef<Map<string, DownloadState>>(new Map());
  const [downloadStatesVersion, setDownloadStatesVersion] = useState(0); // bump to trigger re-renders
  const cancelRef = useRef<Map<string, boolean>>(new Map());
  const downloadAbortRef = useRef<Map<string, AbortController>>(new Map());

  // Init DB on mount
  useEffect(() => {
    openDictionaryDB().then((db) => { dbRef.current = db; });
  }, []);

  // Load recent on mount and when L2 changes; clear session cache
  useEffect(() => {
    loadRecent(l2Code).then(setRecentSearches);
    // Reset state on language change
    setQuery('');
    setResults(null);
    setMessage(null);
    setError(null);
    setSearchedText('');
    setCameFromSearch(false);
    // Clear session memory cache on L2 switch
    sessionCache.clear();
  }, [l2Code]);

  // ── 4-tier lookup ──────────────────────────

  const doSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    setQuery(trimmed);
    setLoading(true);
    setError(null);
    setMessage(null);
    setSearchedText(trimmed);

    const cacheKey = `${l2Code}:${trimmed}`;

    try {
      // ── Tier 1: Memory cache ──
      const cached = stripLlmEntries(sessionCache.get(cacheKey) ?? []);
      if (cached) {
        log('[Dict] memory cache hit —', trimmed);
        setResults(cached);
        setMessage(cached.length === 0 ? tRef.current('msg.no_results') : null);
        setLoading(false);
        await saveRecent(l2Code, trimmed);
        setRecentSearches(await loadRecent(l2Code));
        return;
      }

      // ── Tier 2: Offline SQLite ──
      if (dbRef.current) {
        const offline = await lookupOffline(dbRef.current, trimmed, l2Code);
        if (offline && offline.length > 0) {
          log('[Dict] offline hit —', trimmed, `(${offline.length} entries)`);
          sessionCache.set(cacheKey, offline);
          setResults(offline);
          setLoading(false);
          await saveRecent(l2Code, trimmed);
          setRecentSearches(await loadRecent(l2Code));
          return;
        }
      }

      // ── Tier 4: Online lookup ──
      const res = await dict.lookup(trimmed, l2Code, l1Lang.code);
      const entries = stripLlmEntries(res.results ?? []);
      log('[Dict] online lookup —', trimmed, `(${entries.length} entries)`);

      // Cache in memory
      sessionCache.set(cacheKey, entries);

      setResults(entries);
      setMessage(entries.length === 0 ? tRef.current('msg.no_results') : (res.message ?? null));
      await saveRecent(l2Code, trimmed);
      setRecentSearches(await loadRecent(l2Code));
    } catch (e: any) {
      setError(e?.message ?? 'Dictionary lookup failed');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [dict, l2Code, l1Lang.code]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults(null);
    setMessage(null);
    setError(null);
    setSearchedText('');
    setCameFromSearch(false);
  }, []);

  const clearRecent = useCallback(async () => {
    try {
      await storageRemove(`${RECENT_STORAGE_KEY}:${l2Code}`);
      setRecentSearches([]);
    } catch { /* ignore */ }
  }, [l2Code]);

  // ── Download management ────────────────────

  const getDownloadState = useCallback((l2: string): DownloadState => {
    return downloadStatesRef.current.get(l2) ?? { status: 'idle', progress: 0, downloaded: 0, total: 0 };
  }, []);

  const isOfflineAvailable = useCallback(async (l2: string): Promise<boolean> => {
    if (!dbRef.current) return false;
    return hasOfflineDictionary(dbRef.current, l2);
  }, []);

  const getDownloadedCount = useCallback(async (l2: string): Promise<number> => {
    if (!dbRef.current) return 0;
    const meta = await getDictMeta(dbRef.current, l2);
    return meta?.entry_count ?? 0;
  }, []);

  const startDownload = useCallback(async (l2: string) => {
    log('[DictContext] 📥 startDownload — l2:', l2, '— timestamp:', Date.now());

    if (!dbRef.current) {
      log('[DictContext] DB not open, opening...');
      try { dbRef.current = await openDictionaryDB(); } catch (e) {
        log('[DictContext] ❌ Failed to open DB:', e);
        return;
      }
    }

    const db = dbRef.current;
    const stateMap = downloadStatesRef.current;
    const cancelMap = cancelRef.current;
    const controller = new AbortController();
    downloadAbortRef.current.set(l2, controller);

    // Reset cancel flag
    cancelMap.set(l2, false);

    // Set initial state
    stateMap.set(l2, {
      status: 'downloading',
      progress: 1,
      downloaded: 0,
      total: 0,
      phase: 'dictionary',
    });
    setDownloadStatesVersion((v) => v + 1);

    const update = (patch: Partial<DownloadState>) => {
      const current = stateMap.get(l2) ?? {
        status: 'downloading' as const,
        progress: 0,
        downloaded: 0,
        total: 0,
      };
      stateMap.set(l2, { ...current, ...patch });
      setDownloadStatesVersion((v) => v + 1);
    };
    let tableReady = false;
    let bulkStarted = false;

    try {
      log('[DictContext] 🌐 streaming /dictionary/download — l2:', l2, 'l1:', l1Lang.code);
      const insertStart = Date.now();
      const downloadMeta: { value: OfflineDictMeta | null } = { value: null };
      let lastNetworkPct = -1;

      await downloadDictionaryData(
        l2,
        l1Lang.code,
        {
          onDownloadProgress: (fraction) => {
            // Network transfer maps to the first 0–64% of the bar.
            const pct = Math.min(64, Math.floor(fraction * 64));
            if (pct !== lastNetworkPct) {
              lastNetworkPct = pct;
              update({
                status: 'downloading',
                phase: 'dictionary',
                progress: pct,
                downloaded: 0,
                total: 0,
              });
            }
          },
          onMeta: (meta) => {
            downloadMeta.value = meta;
          },
          onRows: async (rows, processed, total) => {
            if (cancelMap.get(l2)) throw new Error('Download cancelled');
            // Only replace the existing table once the new data has actually
            // started arriving, so a failed network fetch keeps the old copy.
            if (!tableReady) {
              await beginBulkInsert(db, l2);
              tableReady = true;
              bulkStarted = true;
            }
            await insertBulkBatch(db, l2, rows);
            // Insertion maps to 65–90% of the bar.
            const insertPct = total > 0 ? Math.round((processed / total) * 25) : 25;
            update({
              status: 'downloading',
              phase: 'insert',
              progress: 65 + Math.min(25, insertPct),
              downloaded: processed,
              total,
            });
          },
        },
        controller.signal,
      );

      const total = downloadMeta.value?.downloaded || downloadMeta.value?.total || 0;
      const version = downloadMeta.value?.version ?? '';
      log('[DictContext] ✅ dictionary download done — l2:', l2, 'total:', total, 'version:', version.slice(0, 12), '— took', Date.now() - insertStart, 'ms');

      if (cancelMap.get(l2)) {
        log('[DictContext] 🛑 Cancelled after download, cleaning up — l2:', l2);
        if (bulkStarted) {
          await abortBulkInsert(db);
          bulkStarted = false;
        }
        await deleteDictDB(db, l2);
        stateMap.set(l2, { status: 'idle', progress: 0, downloaded: 0, total: 0 });
        setDownloadStatesVersion((v) => v + 1);
        throw new Error('Download cancelled');
      }

      if (bulkStarted) {
        await finishBulkInsert(db, l2);
        bulkStarted = false;
      }

      // Save metadata
      const now = new Date().toISOString();
      const meta: DictMeta = {
        l2,
        downloaded_at: now,
        entry_count: total,
        size_bytes: total * 600,
        version,
      };
      await saveDictMeta(db, meta);
      log('[DictContext] 💾 dict_meta saved — l2:', l2, 'meta:', JSON.stringify(meta).slice(0, 120));

      // ── SPEC-018 Phase 2a: Download lemma table as sidecar ──
      const tokenConfig = TOKENIZER_CONFIG[l2];
      if (tokenConfig?.hasLemmaTable) {
        if (cancelMap.get(l2)) throw new Error('Download cancelled');
        update({
          status: 'downloading',
          phase: 'lemma',
          progress: 92,
          downloaded: total,
          total,
        });
        log('[DictContext] 📥 downloading lemma table — l2:', l2, 'size:', tokenConfig.lemmaTableSize);
        try {
          const ok = await downloadLemmaTable(l2, PYTHON_API_URL, 50000, controller.signal);
          log('[DictContext] ' + (ok ? '✅' : '⚠️') + ' lemma table — l2:', l2, ok ? 'downloaded' : 'unavailable');
        } catch (e: any) {
          if (cancelMap.get(l2)) throw new Error('Download cancelled');
          log('[DictContext] ⚠️ lemma table download failed (non-fatal) — l2:', l2, e?.message ?? e);
        }
      }

      // ── SPEC-018 Phase 2c/2d: Download kuromoji/kuromoji-ko data pack ──
      // Japanese (ja): kuromoji + IPADIC dict, Korean (ko): kuromoji-ko + mecab-ko-dic
      if (tokenConfig?.needsKuromoji) {
        if (cancelMap.get(l2)) throw new Error('Download cancelled');
        update({
          status: 'downloading',
          phase: 'tokenizer',
          progress: 94,
          downloaded: total,
          total,
        });
        log('[DictContext] 📥 downloading kuromoji data pack — l2:', l2, 'size:', tokenConfig.tokenizerDataSize);
        try {
          const { downloadKuromojiData } = await import('@/lib/tokenizer-db');
          const ok = await downloadKuromojiData(
            l2,
            PYTHON_API_URL,
            (fraction) => {
              // Tokenizer pack maps to 94–99% of the bar.
              const pct = Math.min(99, 94 + Math.round(fraction * 5));
              update({
                status: 'downloading',
                phase: 'tokenizer',
                progress: pct,
                downloaded: total,
                total,
              });
            },
            controller.signal,
          );
          log('[DictContext] ' + (ok ? '✅' : '⚠️') + ' kuromoji data — l2:', l2, ok ? 'downloaded' : 'unavailable');
          if (ok) {
            // Reset the tokenizer singleton so next lemmatizeText() reloads
            const { resetTokenizer } = await import('@/lib/tokenizer');
            resetTokenizer(l2);
          }
          if (cancelMap.get(l2)) throw new Error('Download cancelled');
        } catch (e: any) {
          if (cancelMap.get(l2)) throw new Error('Download cancelled');
          log('[DictContext] ⚠️ kuromoji data download failed (non-fatal) — l2:', l2, e?.message ?? e);
        }
      }

      stateMap.set(l2, {
        status: 'completed',
        progress: 100,
        downloaded: total,
        total,
        phase: 'finalizing',
      });
      setDownloadStatesVersion((v) => v + 1);
      log('[DictContext] 🎉 download complete — l2:', l2, 'total entries:', total);

    } catch (e: any) {
      log('[DictContext] ❌ download failed — l2:', l2, 'error:', e?.message ?? e);
      // Clean up partial data on failure — but only if we actually replaced
      // the table. A failed network fetch leaves the previous download intact.
      if (bulkStarted) {
        await abortBulkInsert(db);
        bulkStarted = false;
      }
      if (tableReady) {
        try { await deleteDictDB(db, l2); } catch {}
      }

      if (cancelMap.get(l2)) {
        stateMap.set(l2, { status: 'idle', progress: 0, downloaded: 0, total: 0 });
        setDownloadStatesVersion((v) => v + 1);
        throw new Error('Download cancelled');
      }

      stateMap.set(l2, {
        status: 'failed',
        progress: 0,
        downloaded: 0,
        total: 0,
        error: e?.message ?? 'Download failed',
      });
      setDownloadStatesVersion((v) => v + 1);
    } finally {
      downloadAbortRef.current.delete(l2);
    }
  }, [l1Lang.code]);

  const cancelDownload = useCallback((l2: string) => {
    cancelRef.current.set(l2, true);
    downloadAbortRef.current.get(l2)?.abort();
  }, []);

  const deleteDictionary = useCallback(async (l2: string) => {
    if (!dbRef.current) return;
    downloadAbortRef.current.get(l2)?.abort();
    cancelRef.current.set(l2, true);
    // Also clean up lemma table (SPEC-018 Phase 2a)
    try { await deleteLemmaTable(l2); } catch {}
    // Also clean up kuromoji/kuromoji-ko data pack (SPEC-018 Phase 2c/2d)
    if (TOKENIZER_CONFIG[l2]?.needsKuromoji) {
      try {
        const { deleteKuromojiData } = await import('@/lib/tokenizer-db');
        await deleteKuromojiData(l2);
      } catch {}
    }
    // Drop the dictionary table + metadata last so the VACUUM reclaims every
    // freed page from the dict, lemma, and tokenizer cleanup in one pass.
    await deleteDictDB(dbRef.current, l2);
    // Drop in-memory headword/tokenizer/lemmatization state for this language.
    try {
      const { clearDictionaryCaches } = await import('@/lib/tokenizer');
      clearDictionaryCaches(l2);
    } catch {}
    downloadStatesRef.current.delete(l2);
    setDownloadStatesVersion((v) => v + 1);
  }, []);

  return (
    <DictionaryContext.Provider
      value={{
        query, setQuery, results, loading, error, message, searchedText,
        doSearch, clearSearch,
        recentSearches, clearRecent,
        cameFromSearch, setCameFromSearch,
        sidebarSource, setSidebarSource, detailHead, setDetailHead,
        startDownload, cancelDownload, deleteDictionary,
        getDownloadState, isOfflineAvailable, getDownloadedCount,
      }}
    >
      {children}
    </DictionaryContext.Provider>
  );
}

export function useDictionaryContext() {
  const ctx = useContext(DictionaryContext);
  if (!ctx) throw new Error('useDictionaryContext must be used within <DictionaryProvider>');
  return ctx;
}
