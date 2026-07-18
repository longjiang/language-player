import { apiClient } from './client';

export interface UserDataResponse {
  id: string | number;
  saved_words: string;
  progress?: string;
  srs_progress?: string;
  settings_v2?: string;
}

// Module-level stable references — these functions have no dependencies
// on React state, so they can be created once and reused across all renders.
// This prevents infinite re-fetch loops caused by new function references
// being created on every render when used in useEffect dependency arrays.

const _getUserData = () =>
  apiClient.get<UserDataResponse>('/user-data');

const _syncSavedWords = (savedWords: string) =>
  apiClient.post<{ success: boolean }>('/user-data/sync', {
    saved_words: savedWords,
  });

const _syncSrsProgress = (srsProgress: string) =>
  apiClient.post<{ success: boolean }>('/user-data/sync', {
    srs_progress: srsProgress,
  });

const _stableReturn = {
  getUserData: _getUserData,
  syncSavedWords: _syncSavedWords,
  syncSrsProgress: _syncSrsProgress,
} as const;

export function useUserData() {
  return _stableReturn;
}
