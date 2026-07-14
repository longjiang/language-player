import { apiClient } from './client';

export interface UserDataResponse {
  id: string | number;
  saved_words: string;
  progress?: string;
  srs_progress?: string;
}

export function useUserData() {
  return {
    /** Fetch user_data from the Python backend (auth via Authorization header).
     *  The user is identified server-side from the bearer token. */
    getUserData: () =>
      apiClient.get<UserDataResponse>('/user-data'),

    /** Sync saved_words to the Python backend (auth via Authorization header).
     *  The user is identified server-side from the bearer token. */
    syncSavedWords: (savedWords: string) =>
      apiClient.post<{ success: boolean }>('/user-data/sync', {
        saved_words: savedWords,
      }),

    /** Sync srs_progress to the Python backend (auth via Authorization header). */
    syncSrsProgress: (srsProgress: string) =>
      apiClient.post<{ success: boolean }>('/user-data/sync', {
        srs_progress: srsProgress,
      }),
  };
}
