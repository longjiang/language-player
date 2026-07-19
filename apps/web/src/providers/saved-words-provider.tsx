'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import type { SavedLexicalItemRecord, SavedLexicalItemStore, SavedWordContext } from '@langplayer/shared';
import { useSavedWords } from '@/hooks/use-saved-words';

interface SavedWordsContextValue {
  savedWords: SavedLexicalItemStore;
  loaded: boolean;
  saveWord: (l2Code: string, word: SavedLexicalItemRecord) => void;
  removeSavedWord: (l2Code: string, wordId: string) => void;
  hasSavedWord: (l2Code: string, wordId: string) => boolean;
  getSavedWords: (l2Code: string) => SavedLexicalItemRecord[];
  clearSavedWords: (l2Code: string) => void;
}

const SavedWordsContext = createContext<SavedWordsContextValue | undefined>(undefined);

export function SavedWordsProvider({ children }: { children: ReactNode }) {
  const value = useSavedWords();
  return (
    <SavedWordsContext.Provider value={value}>
      {children}
    </SavedWordsContext.Provider>
  );
}

export function useSavedWordsContext(): SavedWordsContextValue {
  const ctx = useContext(SavedWordsContext);
  if (!ctx) throw new Error('useSavedWordsContext must be used within <SavedWordsProvider>');
  return ctx;
}
