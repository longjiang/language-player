import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@langplayer/api-client';
import { useAuth } from '@/contexts/AuthContext';
import type { NoteListItem, Note } from '@langplayer/shared';

export interface UseReaderNotesReturn {
  notes: NoteListItem[];
  notesLoading: boolean;
  notesError: string | null;
  currentNote: Note | null;
  currentNoteId: number | null;
  loadNotes: () => Promise<void>;
  selectNote: (noteId: number) => Promise<void>;
  createNote: () => Promise<number>;
  renameNote: (noteId: number, title: string) => Promise<void>;
  deleteNote: (noteId: number) => Promise<void>;
  saveNote: (noteId: number, text: string, translation: string) => Promise<void>;
  setCurrentNoteId: (id: number | null) => void;
}

export function useReaderNotes(l2Code: string): UseReaderNotesReturn {
  const { user } = useAuth();
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [currentNoteId, setCurrentNoteId] = useState<number | null>(null);

  const loadNotes = useCallback(async () => {
    if (!user) return;
    setNotesLoading(true);
    setNotesError(null);
    try {
      const data = await apiClient.get<NoteListItem[]>('/user-notes', {
        params: { l2: l2Code },
      });
      setNotes(data.sort((a, b) =>
        (b.created_on ?? '').localeCompare(a.created_on ?? '')
      ));
    } catch (e: any) {
      setNotesError(e?.message ?? 'Failed to load notes');
    } finally {
      setNotesLoading(false);
    }
  }, [user, l2Code]);

  const selectNote = useCallback(async (noteId: number) => {
    try {
      const note = await apiClient.get<Note>(`/user-notes/${noteId}`);
      setCurrentNote(note);
      setCurrentNoteId(noteId);
    } catch {
      setNotesError('Failed to load note');
    }
  }, []);

  const createNote = useCallback(async () => {
    try {
      const created = await apiClient.post<Note>('/user-notes', {
        title: 'Untitled',
        text: '',
        translation: '',
        l2: l2Code,
      });
      setNotes(prev => [{
        id: created.id,
        title: created.title,
        created_on: created.created_on,
      }, ...prev]);
      setCurrentNote(created);
      setCurrentNoteId(created.id);
      return created.id;
    } catch {
      setNotesError('Failed to create note');
      return -1;
    }
  }, [l2Code]);

  const renameNote = useCallback(async (noteId: number, title: string) => {
    await apiClient.patch(`/user-notes/${noteId}`, { title });
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, title } : n));
    if (currentNoteId === noteId) {
      setCurrentNote(prev => prev ? { ...prev, title } : null);
    }
  }, [currentNoteId]);

  const deleteNote = useCallback(async (noteId: number) => {
    await apiClient.delete(`/user-notes/${noteId}`);
    setNotes(prev => prev.filter(n => n.id !== noteId));
    if (currentNoteId === noteId) {
      setCurrentNote(null);
      setCurrentNoteId(null);
    }
  }, [currentNoteId]);

  const saveNote = useCallback(async (noteId: number, text: string, translation: string) => {
    await apiClient.patch(`/user-notes/${noteId}`, { text, translation });
    setCurrentNote(prev => prev ? { ...prev, text, translation } : null);
  }, []);

  useEffect(() => {
    if (user) loadNotes();
  }, [user, l2Code, loadNotes]);

  return {
    notes, notesLoading, notesError,
    currentNote, currentNoteId,
    loadNotes, selectNote, createNote,
    renameNote, deleteNote, saveNote,
    setCurrentNoteId,
  };
}
