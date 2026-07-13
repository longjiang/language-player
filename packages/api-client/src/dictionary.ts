import { apiClient } from './client';
import type { DictionaryLookupResponse, DictionaryEntry, Token, LemmatizeResponse } from '@langplayer/shared';

export function useDictionary() {
  return {
    /** Look up a word in the dictionary. POST /dictionary/lookup */
    lookup: (text: string, l2: string, l1: string = 'en') =>
      apiClient.post<DictionaryLookupResponse>('/dictionary/lookup', {
        text,
        l2,
        l1,
      }).then(r => r.data as unknown as DictionaryLookupResponse),

    /** Tokenize + lemmatize a sentence. POST /lemmatize */
    tokenize: (text: string, l2: string) =>
      apiClient.post<LemmatizeResponse>('/lemmatize', { text, l2 }),

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
