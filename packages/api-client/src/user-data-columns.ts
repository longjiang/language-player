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

/** Delete a card. `updatedAt` (client unsave time) lets the server drop
 *  stale deletes that would destroy newer writes from another device
 *  (ADR-0040). */
export const deleteSrsCard = (l2: string, wordId: string, updatedAt?: number) =>
  apiClient.delete<{ success: boolean }>(
    `/srs/cards/${encodeURIComponent(l2)}/${encodeURIComponent(wordId)}`
    + (typeof updatedAt === 'number' ? `?updatedAt=${updatedAt}` : ''),
  );

export interface SrsCardDeleteItem {
  l2: string;
  wordId: string;
  updatedAt?: number;
}

/** Bulk-delete SRS cards in ONE request. The review page's orphan cleanup can
 *  accumulate hundreds of cards whose saved words were unsaved; per-card
 *  DELETEs (each with a CORS preflight) freeze a slow dev server, so the
 *  pending-queue drains them in a single round-trip. Each item honors the same
 *  stale-delete guard as deleteSrsCard (ADR-0040). */
export const deleteSrsCardsBatch = (items: SrsCardDeleteItem[]) =>
  apiClient.post<{ success: boolean; deleted: number; dropped: number; skipped: number }>(
    '/srs/cards/batch-delete',
    { deletes: items },
  );

export interface SrsReconcileResponse {
  success: boolean;
  deleted: number;
  dropped: number;
  skipped: number;
  /** wordIds of cards the server deleted for unsaved words — the client must
   *  drop these from its local store (they are already gone server-side, so it
   *  must NOT enqueue its own DELETE /srs/cards). */
  deletedWordIds: string[];
}

/**
 * Authoritative server-side orphan reconciliation. The server owns both
 * `user_srs_cards` and `user_saved_words`, so it compares all cards of a given
 * l2 against all saved words of the same l2 and deletes orphans. This replaces
 * the fragile client-side prune, which deleted cards whenever a client-local
 * saved-word snapshot was partial and could take out genuinely saved words.
 *
 * `protectedWordIds` are words with a pending (unsynced) local saved-word put
 * (offline-first mobile); the server never deletes their cards.
 */
export const reconcileSrsCards = (l2: string, protectedWordIds: string[] = []) =>
  apiClient.post<SrsReconcileResponse>(
    '/srs/cards/reconcile',
    { l2, protectedWordIds },
  );

export const getUserSettings = () =>
  apiClient.get<UserSettingsResponse>('/user-settings');

export const putUserSettings = (body: {
  settings_v2?: SettingsV2;
  settings_classic?: Record<string, unknown>;
  /** Client timestamp (ms) used for server-side last-write-wins. */
  updatedAt?: number;
  /** Stable per-install device id — logged server-side for write attribution. */
  deviceId?: string;
}) => apiClient.put<{ success: boolean }>('/user-settings', body);

export function useUserDataColumns() {
  return {
    getProgress,
    putProgress,
    getSrs,
    putSrsCard,
    deleteSrsCard,
    deleteSrsCardsBatch,
    getUserSettings,
    putUserSettings,
  };
}
