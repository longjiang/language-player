import { apiClient } from './client';
import type { DictionaryEntry, Token } from '@langplayer/shared';

export function useDictionary() {
  return {
    /** Look up a word in the dictionary. */
    lookup: (word: string, lang: string) =>
      apiClient.get<DictionaryEntry[]>('/dictionary/lookup', {
        params: { word, lang },
      }),

    /** Tokenize + lemmatize a sentence. */
    tokenize: (text: string, lang: string) =>
      apiClient.post<Token[]>('/dictionary/tokenize', { text, lang }),

    /** Get saved words for the current user. */
    getSavedWords: (lang: string, page?: number) =>
      apiClient.get<DictionaryEntry[]>('/dictionary/saved', {
        params: { lang, page },
      }),

    /** Save a word to the user's vocabulary list. */
    saveWord: (word: string, lang: string) =>
      apiClient.post<void>('/dictionary/save', { word, lang }),

    /** Remove a word from the user's vocabulary list. */
    removeWord: (word: string, lang: string) =>
      apiClient.delete<void>('/dictionary/save', {
        params: { word, lang },
      }),
  };
}
