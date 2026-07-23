import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionary } from '@langplayer/api-client';
import type { DictionaryEntry } from '@langplayer/shared';

// ── Sidebar / wordlist types ────────────────

export type SidebarSource =
  | { kind: 'saved' }
  | { kind: 'results'; items: DictionaryEntry[] }
  | { kind: 'wordlist'; items: { head: string; dictionaryId: string; entryId: string; id: string; pronunciation?: string; definition?: string }[]; currentId: string };

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
}

const DictionaryContext = createContext<DictionaryContextValue | null>(null);

import * as SecureStore from 'expo-secure-store';

// ── Provider ────────────────────────────────

const RECENT_STORAGE_KEY = 'zthRecentSearches';
const MAX_RECENT = 10;

async function loadRecent(l2Code: string): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(`${RECENT_STORAGE_KEY}:${l2Code}`);
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
    await SecureStore.setItemAsync(`${RECENT_STORAGE_KEY}:${l2Code}`, JSON.stringify(items));
  } catch (e) { console.log('[Dict] saveRecent failed:', e); }
}

export function DictionaryProvider({ children }: { children: ReactNode }) {
  const { l2Lang } = useLanguage();
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

  // Load recent on mount and when L2 changes
  useEffect(() => {
    loadRecent(l2Code).then(setRecentSearches);
    // Reset state on language change
    setQuery('');
    setResults(null);
    setMessage(null);
    setError(null);
    setSearchedText('');
    setCameFromSearch(false);
  }, [l2Code]);

  const doSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    setQuery(trimmed);
    setLoading(true);
    setError(null);
    setMessage(null);
    setSearchedText(trimmed);

    try {
      const res = await dict.lookup(trimmed, l2Code, 'en');
      // DEBUG: Confirms search completed and how many results returned.
      // If this logs but handleEntryPress never does, the tap isn't reaching the card's Pressable.
      console.log('[Dict] doSearch results — query:', trimmed, '— count:', res.results?.length ?? 0, '— timestamp:', Date.now());
      setResults(res.results ?? []);
      setMessage(res.message ?? null);
      await saveRecent(l2Code, trimmed);
      setRecentSearches(await loadRecent(l2Code));
    } catch (e: any) {
      setError(e?.message ?? 'Dictionary lookup failed');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [dict, l2Code]);

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
      await SecureStore.deleteItemAsync(`${RECENT_STORAGE_KEY}:${l2Code}`);
      setRecentSearches([]);
    } catch { /* ignore */ }
  }, [l2Code]);

  return (
    <DictionaryContext.Provider
      value={{
        query, setQuery, results, loading, error, message, searchedText,
        doSearch, clearSearch,
        recentSearches, clearRecent,
        cameFromSearch, setCameFromSearch,
        sidebarSource, setSidebarSource, detailHead, setDetailHead,
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
