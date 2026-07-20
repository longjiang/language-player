'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
  type FormEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { baseCode } from '@/lib/language-data';
import { useDictionary } from '@langplayer/api-client';
import type { DictionaryEntry } from '@langplayer/shared';

// ── Recent searches (localStorage) ──────────

const RECENT_STORAGE_PREFIX = 'zthRecentSearches:';
const MAX_RECENT = 10;

function loadRecent(l2Code: string): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_PREFIX + l2Code);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

function saveRecent(l2Code: string, term: string) {
  const prev = loadRecent(l2Code).filter((t) => t !== term);
  prev.unshift(term);
  localStorage.setItem(RECENT_STORAGE_PREFIX + l2Code, JSON.stringify(prev.slice(0, MAX_RECENT)));
}

// ── Sidebar content type ─────────────────────

export type SidebarSource =
  | { kind: 'saved' }
  | { kind: 'results'; items: DictionaryEntry[] }
  | { kind: 'wordlist'; items: { head: string; dictionaryId: string; entryId: string; id: string; pronunciation?: string; definition?: string }[]; currentId: string };

// ── Context shape ────────────────────────────

interface DictionaryContextValue {
  // Search state
  query: string;
  setQuery: (v: string) => void;
  results: DictionaryEntry[] | null;
  loading: boolean;
  error: string | null;
  message: string | null;
  searchedText: string;

  // Actions
  doSearch: (term: string) => Promise<void>;
  handleSearch: (e?: FormEvent) => void;
  clearSearch: () => void;

  // Recent searches
  recentSearches: string[];
  clearRecent: () => void;
  handleRecentClick: (term: string) => void;

  // Navigation context
  /** True if the current detail view was reached via search results. */
  cameFromSearch: boolean;
  setCameFromSearch: (v: boolean) => void;

  // Sidebar
  sidebarSource: SidebarSource;
  setSidebarSource: (s: SidebarSource) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;

  // Detail view
  /** The head word of the currently viewed entry (for the search bar). */
  detailHead: string | null;
  setDetailHead: (v: string | null) => void;
}

const DictionaryContext = createContext<DictionaryContextValue | null>(null);

// ── Provider ─────────────────────────────────

export function DictionaryProvider({ children }: { children: ReactNode }) {
  const { l1, l2 } = useLanguage();
  const dict = useDictionary();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DictionaryEntry[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedText, setSearchedText] = useState('');
  const loadingRef = useRef(false);
  const searchedRef = useRef(false);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecent(l2.code));

  const [cameFromSearch, setCameFromSearch] = useState(false);
  const [sidebarSource, setSidebarSource] = useState<SidebarSource>({ kind: 'saved' });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [detailHead, setDetailHead] = useState<string | null>(null);

  // Reload recent searches when l2 changes
  useEffect(() => {
    setRecentSearches(loadRecent(l2.code));
    // Reset state on language change
    setQuery('');
    setResults(null);
    setMessage(null);
    setError(null);
    setSearchedText('');
    setCameFromSearch(false);
    setSidebarSource({ kind: 'saved' });
    setDetailHead(null);
    searchedRef.current = false;
  }, [l2.code]);

  // Auto-search from ?q= param on first load; reset if no query
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !searchedRef.current) {
      searchedRef.current = true;
      setQuery(q);
      setTimeout(() => { doSearch(q); }, 100);
    } else if (!q && searchedRef.current) {
      // Navigated back to dictionary without query — reset to empty state
      searchedRef.current = false;
      setQuery('');
      setResults(null);
      setMessage(null);
      setError(null);
      setSearchedText('');
      setCameFromSearch(false);
      setSidebarSource({ kind: 'saved' });
      setDetailHead(null);
    }
  }, [searchParams]);

  const doSearch = useCallback(
    async (term: string) => {
      const trimmed = term.trim();
      if (!trimmed || loadingRef.current) return;
      loadingRef.current = true;

      flushSync(() => {
        setLoading(true);
        setError(null);
        setResults(null);
        setMessage(null);
        setSearchedText(trimmed);
      });

      saveRecent(l2.code, trimmed);
      setRecentSearches(loadRecent(l2.code));

      const params = new URLSearchParams(searchParams.toString());
      params.set('q', trimmed);
      router.replace(`/${l1.code}/${l2.code}/dictionary?${params.toString()}`, { scroll: false });

      try {
        const response: any = await dict.lookup(trimmed, baseCode(l2.code), l1.code);
        const res: DictionaryEntry[] = response.results ?? [];
        setResults(res);
        setMessage(response.message ?? null);
        setCameFromSearch(false);
        setDetailHead(null);
      } catch (err: any) {
        setError(err?.message ?? 'Unknown error');
        setResults(null);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [dict, l2.code, l1.code, searchParams, router, l1.code],
  );

  const handleSearch = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      doSearch(query.trim());
    },
    [query, doSearch],
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults(null);
    setMessage(null);
    setError(null);
    setSearchedText('');
    setCameFromSearch(false);
    setDetailHead(null);
    setSidebarSource({ kind: 'saved' });
    searchedRef.current = false;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    router.replace(`/${l1.code}/${l2.code}/dictionary?${params.toString()}`, { scroll: false });
  }, [router, l1.code, l2.code, searchParams]);

  const clearRecent = useCallback(() => {
    localStorage.removeItem(RECENT_STORAGE_PREFIX + l2.code);
    setRecentSearches([]);
  }, [l2.code]);

  const handleRecentClick = useCallback((term: string) => {
    setQuery(term);
    doSearch(term);
  }, [doSearch]);

  return (
    <DictionaryContext.Provider
      value={{
        query, setQuery,
        results, loading, error, message, searchedText,
        doSearch, handleSearch, clearSearch,
        recentSearches, clearRecent, handleRecentClick,
        cameFromSearch, setCameFromSearch,
        sidebarSource, setSidebarSource,
        sidebarOpen, setSidebarOpen,
        detailHead, setDetailHead,
      }}
    >
      {children}
    </DictionaryContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────

export function useDictionaryContext() {
  const ctx = useContext(DictionaryContext);
  if (!ctx) throw new Error('useDictionaryContext must be used within DictionaryProvider');
  return ctx;
}
