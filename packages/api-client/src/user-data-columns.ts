import { apiClient } from './client';
import type { L2Progress, SrsFields, SettingsV2 } from '@langplayer/shared';

/**
 * SPEC-039 5.2 — row-level endpoints for progress, SRS, and settings
 * (Supabase-backed via Flask). Replaces the full-blob /user-data/sync uploads.
 */

export interface ProgressResponse {
  progress: Record<string, Partial<L2Progress>>;
}

export interface SrsResponse {
  settings: { dailyNewLimit: number };
  cards: Record<string, Record<string, SrsFields>>;
}

/** Local-day metadata sent with SRS card writes (SPEC-066). */
export interface SrsCardMeta {
  /** IANA timezone id of the device at write time (e.g. "America/Vancouver"). */
  timezone?: string;
  /** "Next day starts at" hour (0–23) from the user's review settings. */
  dayStartHour?: number;
}

export interface UserSettingsResponse {
  settings_v2: SettingsV2 | null;
  settings_classic: Record<string, unknown> | null;
}

export const getProgress = () =>
  apiClient.get<ProgressResponse>('/progress');

export const putProgress = (l2: string, progress: Partial<L2Progress>) =>
  apiClient.put<{ success: boolean }>('/progress', { l2, progress });

export const getSrs = () =>
  apiClient.get<SrsResponse>('/srs');

export const putSrsCard = (
  l2: string,
  wordId: string,
  state: SrsFields,
  meta: SrsCardMeta = {},
) =>
  apiClient.put<{ success: boolean }>('/srs/cards', {
    l2,
    wordId,
    state,
    updatedAt: state.lastReview ?? Date.now(),
    ...(meta.timezone ? { timezone: meta.timezone } : {}),
    ...(typeof meta.dayStartHour === 'number' ? { dayStartHour: meta.dayStartHour } : {}),
  });

export const deleteSrsCard = (l2: string, wordId: string) =>
  apiClient.delete<{ success: boolean }>(
    `/srs/cards/${encodeURIComponent(l2)}/${encodeURIComponent(wordId)}`,
  );

export const getUserSettings = () =>
  apiClient.get<UserSettingsResponse>('/user-settings');

export const putUserSettings = (body: {
  settings_v2?: SettingsV2;
  settings_classic?: Record<string, unknown>;
}) => apiClient.put<{ success: boolean }>('/user-settings', body);

export function useUserDataColumns() {
  return {
    getProgress,
    putProgress,
    getSrs,
    putSrsCard,
    deleteSrsCard,
    getUserSettings,
    putUserSettings,
  };
}
