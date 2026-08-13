/**
 * SavedWordsProvider — React context for saved words in the extension.
 *
 * Mirrors the web app's useSavedWordsContext() but backed by the extension's
 * auth module and the Supabase row API through Flask (SPEC-034). Words are
 * highlighted in the transcript and can be saved/removed from the dictionary
 * card.
 */

import React, {
  createContext, useContext, useEffect, useState, useCallback, useMemo, useRef,
} from 'react';
import type { SavedLexicalItemRecord, SavedLexicalItemStore } from '@langplayer/shared';
import { fetchSavedWords, putSavedWord, deleteSavedWord } from '../saved-words';
import { getAuthState } from '../auth';

// ── Context ────────────────────────────────────────────────────────────────

interface SavedWordsContextValue {
  /** All saved words, keyed by L2 language code. */
  savedWords: SavedLexicalItemStore;
  /** Set of lowercased word forms for quick lookup (e.g., highlighting). */
  savedFormSet: Set<string>;
  /** Whether we're currently loading from the server. */
  loading: boolean;
  /** Save a word and sync to the server. */
  saveWord: (l2Code: string, record: SavedLexicalItemRecord) => Promise<void>;
  /** Remove a saved word and sync to the server. */
  removeSavedWord: (l2Code: string, id: string) => Promise<void>;
  /** Whether the user is authenticated. */
  isLoggedIn: boolean;
}

const SavedWordsContext = createContext<SavedWordsContextValue>({
  savedWords: {},
  savedFormSet: new Set(),
  loading: false,
  saveWord: async () => {},
  removeSavedWord: async () => {},
  isLoggedIn: false,
});

export const useSavedWords = () => useContext(SavedWordsContext);

// ── Provider ───────────────────────────────────────────────────────────────

interface SavedWordsProviderProps {
  children: React.ReactNode;
  /** Current L2 code. When set, only that language's words are loaded
   *  (SPEC-062 Phase 3 — don't download the user's whole vocabulary store
   *  on every transcript mount). */
  l2Code?: string;
}

export const SavedWordsProvider: React.FC<SavedWordsProviderProps> = ({ children, l2Code }) => {
  const [savedWords, setSavedWords] = useState<SavedLexicalItemStore>({});
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  /** True once the initial fetch completes (success or failure). Prevents
   *  saving before we know the server state, which would overwrite all words. */
  const [loaded, setLoaded] = useState(false);

  const mountedRef = useRef(true);
  /** Invalidates in-flight fetches when auth or L2 changes. */
  const loadGenRef = useRef(0);
  /** Last user whose words are in state; token-only storage changes are
   *  ignored so an automatic refresh doesn't trigger a redundant refetch. */
  const lastUserIdRef = useRef<string | null>(null);
  const initialLoadRef = useRef(true);

  const loadStore = useCallback(async (userId?: string) => {
    const gen = ++loadGenRef.current;
    const expectedUserId = userId ?? lastUserIdRef.current;
    try {
      const store = await fetchSavedWords(l2Code);
      if (
        mountedRef.current
        && gen === loadGenRef.current
        && (!expectedUserId || lastUserIdRef.current === expectedUserId)
      ) {
        setSavedWords(store);
      }
    } catch {
      // fetchSavedWords already logs the error; keep empty state
    }
    if (mountedRef.current && gen === loadGenRef.current) {
      setLoaded(true);
      setLoading(false);
    }
  }, [l2Code]);

  const resetStore = useCallback(() => {
    loadGenRef.current += 1;
    setSavedWords({});
    setLoaded(true);
    setLoading(false);
  }, []);

  // Load saved words on mount (if logged in)
  useEffect(() => {
    mountedRef.current = true;
    initialLoadRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const auth = await getAuthState();
        if (!mountedRef.current || cancelled) return;
        const userId = auth?.userId ?? null;
        lastUserIdRef.current = userId;
        setIsLoggedIn(!!auth);
        if (auth) {
          await loadStore(userId);
        } else {
          resetStore();
        }
      } catch {
        if (mountedRef.current && !cancelled) resetStore();
      } finally {
        if (mountedRef.current && !cancelled) initialLoadRef.current = false;
      }
    })();
    return () => { cancelled = true; mountedRef.current = false; };
  }, [loadStore, resetStore]);

  // React to login/logout from the popup while the panel is open
  useEffect(() => {
    const onChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local' || !changes.lpv_auth) return;
      if (initialLoadRef.current) return;

      const auth = changes.lpv_auth.newValue;
      const userId = auth?.userId ?? null;

      // A refresh only rotates the token pair; the same user's words are
      // already loaded, so don't clear state or refetch.
      if (userId && userId === lastUserIdRef.current) {
        setIsLoggedIn(true);
        return;
      }

      // Auth user (or login/logout state) changed: invalidate any in-flight
      // fetch from the previous user before starting the new one.
      loadGenRef.current += 1;
      lastUserIdRef.current = userId;
      setIsLoggedIn(!!auth);
      if (auth) {
        setSavedWords({});
        setLoaded(false);
        setLoading(true);
        loadStore(userId);
      } else {
        resetStore();
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [loadStore, resetStore]);

  // Refetch when the transcript language changes (same user, new L2).
  useEffect(() => {
    if (initialLoadRef.current) return;
    if (!lastUserIdRef.current) return;
    setSavedWords({});
    setLoaded(false);
    setLoading(true);
    loadStore(lastUserIdRef.current ?? undefined);
  }, [l2Code, loadStore]);

  // Build the form set for quick lookup
  const savedFormSet = useMemo(() => {
    const forms = new Set<string>();
    for (const langWords of Object.values(savedWords)) {
      for (const w of langWords) {
        for (const f of w.forms) {
          forms.add(f.toLowerCase());
        }
      }
    }
    return forms;
  }, [savedWords]);

  const saveWord = useCallback(async (l2Code: string, record: SavedLexicalItemRecord) => {
    // Optimistic local update (server merges forms/instances idempotently)
    setSavedWords(prev => {
      const langWords = [...(prev[l2Code] || [])];
      const idx = langWords.findIndex(w => w.id === record.id);
      if (idx >= 0) {
        langWords[idx] = record;
      } else {
        langWords.push(record);
      }
      return { ...prev, [l2Code]: langWords };
    });

    const merged = await putSavedWord(l2Code, record);
    if (!merged) return;
    // Replace with the server-merged record so forms/instances stay canonical
    setSavedWords(prev => {
      const langWords = [...(prev[l2Code] || [])];
      const idx = langWords.findIndex(w => w.id === merged.id);
      if (idx >= 0) {
        langWords[idx] = merged;
      } else {
        langWords.push(merged);
      }
      return { ...prev, [l2Code]: langWords };
    });
  }, []);

  const removeSavedWord = useCallback(async (l2Code: string, id: string) => {
    // Optimistic local remove; refetch on failure to restore truth
    setSavedWords(prev => {
      const langWords = (prev[l2Code] || []).filter(w => w.id !== id);
      const next = { ...prev, [l2Code]: langWords };
      return next;
    });
    const ok = await deleteSavedWord(l2Code, id);
    if (!ok) {
      const store = await fetchSavedWords(l2Code);
      if (mountedRef.current) setSavedWords(store);
    }
  }, [l2Code]);

  return (
    <SavedWordsContext.Provider value={{ savedWords, savedFormSet, loading, saveWord, removeSavedWord, isLoggedIn }}>
      {children}
    </SavedWordsContext.Provider>
  );
};
