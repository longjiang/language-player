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
import type { DictionaryEntry, DictMeta } from '@langplayer/shared';
import {
  openDictionaryDB,
  lookupOffline,
  lookupLLMCache,
  storeLLMCacheEntry,
  bulkInsertEntries,
  deleteDictionary as deleteDictDB,
  hasOfflineDictionary,
  saveDictMeta,
  getDictMeta,
} from '@/lib/dictionary-db';
import { downloadLemmaTable, deleteLemmaTable } from '@/lib/tokenizer-db';
import { TOKENIZER_CONFIG } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { SQLiteDatabase } from 'expo-sqlite';

// ── Sidebar / wordlist types ────────────────

export type SidebarSource =
  | { kind: 'saved' }
  | { kind: 'results'; items: DictionaryEntry[] }
  | { kind: 'wordlist'; items: { head: string; dictionaryId: string; entryId: string; id: string; pronunciation?: string; definition?: string }[]; currentId: string };

// ── Download state ──────────────────────────

export interface DownloadState {
  status: 'idle' | 'downloading' | 'completed' | 'failed';
  progress: number; // 0–100
  downloaded: number;
  total: number;
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

/** Check whether any entry in the results is LLM-generated. */
function hasLlmEntry(entries: DictionaryEntry[]): boolean {
  return entries.some((e) => (e as any).kind === 'llm' || (e as any).match_type === 'llm');
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
    console.log('[Dict] saveRecent — l2:', l2Code, 'term:', term, 'items:', items.length);
    await storageSet(`${RECENT_STORAGE_KEY}:${l2Code}`, JSON.stringify(items));
  } catch (e) { console.log('[Dict] saveRecent failed:', e); }
}

export function DictionaryProvider({ children }: { children: ReactNode }) {
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
      const cached = sessionCache.get(cacheKey);
      if (cached) {
        console.log('[Dict] memory cache hit —', trimmed);
        setResults(cached);
        setLoading(false);
        await saveRecent(l2Code, trimmed);
        setRecentSearches(await loadRecent(l2Code));
        return;
      }

      // ── Tier 2: Offline SQLite ──
      if (dbRef.current) {
        const offline = await lookupOffline(dbRef.current, trimmed, l2Code);
        if (offline && offline.length > 0) {
          console.log('[Dict] offline hit —', trimmed, `(${offline.length} entries)`);
          sessionCache.set(cacheKey, offline);
          setResults(offline);
          setLoading(false);
          await saveRecent(l2Code, trimmed);
          setRecentSearches(await loadRecent(l2Code));
          return;
        }
      }

      // ── Tier 3: LLM cache ──
      if (dbRef.current) {
        const llmCached = await lookupLLMCache(dbRef.current, trimmed, l1Lang.code, l2Code);
        if (llmCached && llmCached.length > 0) {
          console.log('[Dict] LLM cache hit —', trimmed);
          sessionCache.set(cacheKey, llmCached);
          setResults(llmCached);
          setLoading(false);
          await saveRecent(l2Code, trimmed);
          setRecentSearches(await loadRecent(l2Code));
          return;
        }
      }

      // ── Tier 4: Online lookup ──
      const res = await dict.lookup(trimmed, l2Code, l1Lang.code);
      const entries = res.results ?? [];
      console.log('[Dict] online lookup —', trimmed, `(${entries.length} entries)`);

      // Cache in memory
      sessionCache.set(cacheKey, entries);

      // Auto-store LLM-generated entries in persistent cache
      if (entries.length > 0 && hasLlmEntry(entries) && dbRef.current) {
        storeLLMCacheEntry(dbRef.current, trimmed, l1Lang.code, l2Code, entries).catch(() => {});
      }

      setResults(entries);
      setMessage(res.message ?? null);
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
    console.log('[DictContext] 📥 startDownload — l2:', l2, '— timestamp:', Date.now());

    if (!dbRef.current) {
      console.log('[DictContext] DB not open, opening...');
      try { dbRef.current = await openDictionaryDB(); } catch (e) {
        console.log('[DictContext] ❌ Failed to open DB:', e);
        return;
      }
    }

    const db = dbRef.current;
    const stateMap = downloadStatesRef.current;
    const cancelMap = cancelRef.current;

    // Reset cancel flag
    cancelMap.set(l2, false);

    // Set initial state
    stateMap.set(l2, { status: 'downloading', progress: 0, downloaded: 0, total: 0 });
    setDownloadStatesVersion((v) => v + 1);

    try {
      console.log('[DictContext] 🌐 GET /dictionary/download — l2:', l2, 'l1:', l1Lang.code);
      const res = await dict.downloadDictionary(l2, l1Lang.code);
      const { entries, total, version } = res;
      console.log('[DictContext] ✅ download response — entries:', entries.length, 'total:', total, 'version:', version.slice(0, 12));

      // Check cancellation before starting insert
      if (cancelMap.get(l2)) {
        console.log('[DictContext] 🛑 Cancelled before insert — l2:', l2);
        stateMap.set(l2, { status: 'idle', progress: 0, downloaded: 0, total: 0 });
        setDownloadStatesVersion((v) => v + 1);
        throw new Error('Download cancelled');
      }

      console.log('[DictContext] 💾 bulkInsertEntries starting — l2:', l2, 'count:', entries.length);
      const insertStart = Date.now();

      await bulkInsertEntries(db, l2, entries, (pct) => {
        // Check cancellation between chunks
        if (cancelMap.get(l2)) return;
        const downloaded = Math.round((pct / 100) * entries.length);
        stateMap.set(l2, {
          status: 'downloading',
          progress: pct,
          downloaded,
          total: entries.length,
        });
        setDownloadStatesVersion((v) => v + 1);
      });

      console.log('[DictContext] 💾 bulkInsertEntries done — l2:', l2, '— took', Date.now() - insertStart, 'ms');

      // Check cancellation after insert
      if (cancelMap.get(l2)) {
        console.log('[DictContext] 🛑 Cancelled after insert, cleaning up — l2:', l2);
        await deleteDictDB(db, l2);
        stateMap.set(l2, { status: 'idle', progress: 0, downloaded: 0, total: 0 });
        setDownloadStatesVersion((v) => v + 1);
        throw new Error('Download cancelled');
      }

      // Save metadata
      const now = new Date().toISOString();
      const meta: DictMeta = {
        l2,
        downloaded_at: now,
        entry_count: entries.length,
        size_bytes: JSON.stringify(entries).length,
        version,
      };
      await saveDictMeta(db, meta);
      console.log('[DictContext] 💾 dict_meta saved — l2:', l2, 'meta:', JSON.stringify(meta).slice(0, 120));

      // ── SPEC-018 Phase 2a: Download lemma table as sidecar ──
      const tokenConfig = TOKENIZER_CONFIG[l2];
      if (tokenConfig?.hasLemmaTable) {
        console.log('[DictContext] 📥 downloading lemma table — l2:', l2, 'size:', tokenConfig.lemmaTableSize);
        try {
          const ok = await downloadLemmaTable(l2, PYTHON_API_URL);
          console.log('[DictContext] ' + (ok ? '✅' : '⚠️') + ' lemma table — l2:', l2, ok ? 'downloaded' : 'unavailable');
        } catch (e: any) {
          console.log('[DictContext] ⚠️ lemma table download failed (non-fatal) — l2:', l2, e?.message ?? e);
        }
      }

      stateMap.set(l2, {
        status: 'completed',
        progress: 100,
        downloaded: entries.length,
        total: entries.length,
      });
      setDownloadStatesVersion((v) => v + 1);
      console.log('[DictContext] 🎉 download complete — l2:', l2, 'total entries:', entries.length);

    } catch (e: any) {
      console.log('[DictContext] ❌ download failed — l2:', l2, 'error:', e?.message ?? e);
      // Clean up partial data on failure
      try { await deleteDictDB(db, l2); } catch {}

      stateMap.set(l2, {
        status: 'failed',
        progress: 0,
        downloaded: 0,
        total: 0,
        error: e?.message ?? 'Download failed',
      });
      setDownloadStatesVersion((v) => v + 1);
    }
  }, [dict, l1Lang.code]);

  const cancelDownload = useCallback((l2: string) => {
    cancelRef.current.set(l2, true);
  }, []);

  const deleteDictionary = useCallback(async (l2: string) => {
    if (!dbRef.current) return;
    await deleteDictDB(dbRef.current, l2);
    // Also clean up lemma table (SPEC-018 Phase 2a)
    try { await deleteLemmaTable(l2); } catch {}
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
