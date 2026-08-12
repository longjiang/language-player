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

export const SavedWordsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [savedWords, setSavedWords] = useState<SavedLexicalItemStore>({});
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  /** True once the initial fetch completes (success or failure). Prevents
   *  saving before we know the server state, which would overwrite all words. */
  const [loaded, setLoaded] = useState(false);

  const mountedRef = useRef(true);

  const loadStore = useCallback(async () => {
    try {
      const store = await fetchSavedWords();
      if (mountedRef.current) setSavedWords(store);
    } catch {
      // fetchSavedWords already logs the error; keep empty state
    }
    if (mountedRef.current) {
      setLoaded(true);
      setLoading(false);
    }
  }, []);

  // Load saved words on mount (if logged in)
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      const auth = await getAuthState();
      if (!mountedRef.current) return;
      setIsLoggedIn(!!auth);
      if (auth) {
        await loadStore();
      } else {
        setLoaded(true);
        setLoading(false);
      }
    })();
    return () => { mountedRef.current = false; };
  }, [loadStore]);

  // React to login/logout from the popup while the panel is open
  useEffect(() => {
    const onChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local' || !changes.lpv_auth) return;
      const auth = changes.lpv_auth.newValue;
      setIsLoggedIn(!!auth);
      if (auth) {
        setLoading(true);
        loadStore();
      } else {
        setSavedWords({});
        setLoaded(true);
        setLoading(false);
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [loadStore]);

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
      const store = await fetchSavedWords();
      if (mountedRef.current) setSavedWords(store);
    }
  }, []);

  return (
    <SavedWordsContext.Provider value={{ savedWords, savedFormSet, loading, saveWord, removeSavedWord, isLoggedIn }}>
      {children}
    </SavedWordsContext.Provider>
  );
};
