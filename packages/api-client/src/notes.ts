import { apiClient } from './client';
import type { NoteListItem, Note } from '@langplayer/shared';

export function useNotes() {
  return {
    /** List the authenticated user's notes for a given L2 language.
     *  Sorted by title. Only returns id + title (not full text). */
    listNotes: (l2Code: string) =>
      apiClient.get<NoteListItem[]>('/user-notes', {
        params: { l2: l2Code },
      }),

    /** Get a single note with full text and translation. */
    getNote: (noteId: number) =>
      apiClient.get<Note>(`/user-notes/${noteId}`),
  };
}
