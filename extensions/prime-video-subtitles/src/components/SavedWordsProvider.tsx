/**
 * SavedWordsProvider — React context for saved words in the extension.
 *
 * Mirrors the web app's useSavedWordsContext() but backed by the extension's
 * auth module and Directus sync. Words are highlighted in the transcript
 * and can be saved/removed from the dictionary card.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { SavedLexicalItemRecord, SavedLexicalItemStore } from '@langplayer/shared';
import { fetchSavedWords, syncSavedWords, fetchInflectedForms } from '../saved-words';
import { getAuthState, type AuthState } from '../auth';

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

  // Load saved words on mount (if logged in)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const auth = await getAuthState();
      if (cancelled) return;
      setIsLoggedIn(!!auth);
      if (auth) {
        const store = await fetchSavedWords();
        if (!cancelled) {
          setSavedWords(store);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    setSavedWords(prev => {
      const langWords = [...(prev[l2Code] || [])];
      const idx = langWords.findIndex(w => w.id === record.id);
      if (idx >= 0) {
        langWords[idx] = record;
      } else {
        langWords.push(record);
      }
      const next = { ...prev, [l2Code]: langWords };
      syncSavedWords(next);
      return next;
    });
  }, []);

  const removeSavedWord = useCallback(async (l2Code: string, id: string) => {
    setSavedWords(prev => {
      const langWords = (prev[l2Code] || []).filter(w => w.id !== id);
      const next = { ...prev, [l2Code]: langWords };
      syncSavedWords(next);
      return next;
    });
  }, []);

  return (
    <SavedWordsContext.Provider value={{ savedWords, savedFormSet, loading, saveWord, removeSavedWord, isLoggedIn }}>
      {children}
    </SavedWordsContext.Provider>
  );
};
