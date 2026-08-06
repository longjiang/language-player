import { apiClient } from './client';
import type {
  DictionaryLookupResponse,
  DictionaryAutocompleteResponse,
  DictionaryEntry,
  DictionaryDownloadResponse,
  Token,
  LemmatizeResponse,
} from '@langplayer/shared';

export function useDictionary() {
  return {
    /** Look up a word in the dictionary. POST /dictionary/lookup */
    lookup: (text: string, l2: string, l1: string = 'en') =>
      apiClient.post<DictionaryLookupResponse>('/dictionary/lookup', {
        text,
        l2,
        l1,
      }),

    /**
     * Fast, LLM-free autocomplete suggestions for a partial query.
     * POST /dictionary/autocomplete — English definitions only (l1 unset),
     * ranked for prefix relevance, capped at 6 results.
     */
    autocomplete: (text: string, l2: string) =>
      apiClient.post<DictionaryAutocompleteResponse>('/dictionary/autocomplete', {
        text,
        l2,
      }),

    /** Fetch a single entry by ID. GET /dictionary/entry?l2=&dict=&id=&l1= */
    getEntry: (l2: string, dictId: string, entryId: string, l1: string = 'en') =>
      apiClient.get<{ entry: DictionaryEntry }>('/dictionary/entry', {
        params: { l2, dict: dictId, id: entryId, l1 },
      }),

    /** Tokenize + lemmatize a sentence. POST /lemmatize-normalized */
    tokenize: (text: string, l2: string) =>
      apiClient.post<LemmatizeResponse>('/lemmatize-normalized', { text, l2 }),

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

    /** Download offline dictionary data. GET /dictionary/download */
    downloadDictionary: (l2: string, l1?: string, limit?: number) =>
      apiClient.get<DictionaryDownloadResponse>('/dictionary/download', {
        params: { l2, l1: l1 ?? 'en', limit: limit ?? 125000 },
      }),
  };
}
