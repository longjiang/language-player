import { apiClient } from './client';
import type { SavedLexicalItemRecord, SavedLexicalItemStore } from '@langplayer/shared';

export interface SavedWordsResponse {
  /** Words grouped by L2 code (matches SavedLexicalItemStore). */
  words: SavedLexicalItemStore;
}

export interface SavedWordUpsertResponse {
  success: boolean;
  word: SavedLexicalItemRecord;
}

const _getSavedWords = (l2?: string) =>
  apiClient.get<SavedWordsResponse>('/saved-words', {
    params: l2 ? { l2 } : undefined,
  });

const _putSavedWord = (l2: string, word: SavedLexicalItemRecord) =>
  apiClient.put<SavedWordUpsertResponse>('/saved-words', { l2, word });

const _deleteSavedWord = (l2: string, wordId: string) =>
  apiClient.delete<{ success: boolean }>(
    `/saved-words/${encodeURIComponent(l2)}/${encodeURIComponent(wordId)}`,
  );

/**
 * Row-level saved-words API (SPEC-034 Phase 1/2). Backed by Supabase via Flask;
 * replaces the full-blob /user-data/sync upload for saved words once the
 * NEXT_PUBLIC_SAVED_WORDS_ROW_API flag is on.
 */
export function useSavedWordApi() {
  return {
    getSavedWords: _getSavedWords,
    putSavedWord: _putSavedWord,
    deleteSavedWord: _deleteSavedWord,
  };
}
