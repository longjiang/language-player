import { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@langplayer/api-client';
import { useAuth } from '@/contexts/AuthContext';
import type { NoteListItem, Note } from '@langplayer/shared';
import {
  getCachedNotesList,
  cacheNotesList,
  getCachedNote,
  cacheNote,
  removeCachedNote,
  patchCachedNotesList,
  saveActiveNote,
  getSavedActiveNote,
} from '@/lib/notes-storage';
import {
  checkOnline,
  enqueue,
  getPendingSyncMap,
  processSyncQueue,
  startNotesSyncListener,
  type SyncStatus,
} from '@/lib/notes-sync';

export interface NoteListItemWithSync extends NoteListItem {
  _syncStatus: SyncStatus;
}

export interface UseReaderNotesReturn {
  notes: NoteListItemWithSync[];
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
  /** Manually trigger a sync (useful for pull-to-refresh). */
  syncNow: () => Promise<void>;
  /** Count of pending sync operations. */
  pendingSyncCount: number;
}

function makeTempId(): number {
  // Negative timestamp — won't collide with server IDs (positive integers)
  return -Date.now();
}

export function useReaderNotes(l2Code: string): UseReaderNotesReturn {
  const { user } = useAuth();
  const [notes, setNotes] = useState<NoteListItemWithSync[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [currentNoteId, setCurrentNoteId] = useState<number | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const mountedRef = useRef(true);

  // Start sync listener once
  useEffect(() => {
    startNotesSyncListener();
    return () => { mountedRef.current = false; };
  }, []);

  // ── Annotate notes list with sync status ──────────────

  const annotateSyncStatus = useCallback(async (list: NoteListItem[]): Promise<NoteListItemWithSync[]> => {
    const pendingMap = await getPendingSyncMap(l2Code);
    return list.map(n => ({
      ...n,
      _syncStatus: pendingMap.get(n.id) ?? 'synced',
    }));
  }, [l2Code]);

  // ── Refresh pending count ─────────────────────────────

  const refreshPendingCount = useCallback(async () => {
    const { getPendingCount } = await import('@/lib/notes-sync');
    const count = await getPendingCount();
    if (mountedRef.current) setPendingSyncCount(count);
    return count;
  }, []);

  // ── Load notes list ───────────────────────────────────

  const loadNotes = useCallback(async () => {
    if (!user) return;
    setNotesLoading(true);
    setNotesError(null);

    // 1. Load cache first for instant UI
    try {
      const cached = await getCachedNotesList(l2Code);
      if (cached.length > 0 && mountedRef.current) {
        const annotated = await annotateSyncStatus(cached);
        setNotes(annotated.sort((a, b) =>
          (b.created_on ?? '').localeCompare(a.created_on ?? ''),
        ));
      }
    } catch { /* cache miss — non-critical */ }

    // 2. Fetch from server (updates cache in background)
    try {
      const data = await apiClient.get<NoteListItem[]>('/user-notes', {
        params: { l2: l2Code },
      });
      const sorted = data.sort((a, b) =>
        (b.created_on ?? '').localeCompare(a.created_on ?? ''),
      );
      await cacheNotesList(l2Code, sorted);
      if (mountedRef.current) {
        const annotated = await annotateSyncStatus(sorted);
        setNotes(annotated);
      }
    } catch (e: any) {
      // Server fetch failed — cache is already showing
      if (mountedRef.current) {
        setNotesError(e?.message ?? 'Failed to load notes from server');
      }
    } finally {
      if (mountedRef.current) setNotesLoading(false);
    }

    // 3. Try to process any pending sync operations
    await processSyncQueue();
    await refreshPendingCount();
    // Re-annotate after processing queue
    if (mountedRef.current) {
      setNotes(prev => prev.map(n => ({
        ...n,
        _syncStatus: 'synced' as SyncStatus,
      })));
      // Re-check actual status
      const currentList = await getCachedNotesList(l2Code);
      const annotated = await annotateSyncStatus(currentList);
      setNotes(annotated.sort((a, b) =>
        (b.created_on ?? '').localeCompare(a.created_on ?? ''),
      ));
    }
  }, [user, l2Code, annotateSyncStatus, refreshPendingCount]);

  // ── Select a note ─────────────────────────────────────

  const selectNote = useCallback(async (noteId: number) => {
    setNotesError(null);

    // Try cache first
    const cached = await getCachedNote(noteId);
    if (cached && mountedRef.current) {
      setCurrentNote(cached);
      setCurrentNoteId(noteId);
    }

    // Then try server
    try {
      const note = await apiClient.get<Note>(`/user-notes/${noteId}`);
      await cacheNote(note);
      if (mountedRef.current) {
        setCurrentNote(note);
        setCurrentNoteId(noteId);
      }
    } catch {
      if (!cached) {
        if (mountedRef.current) setNotesError('Failed to load note');
      }
      // If we had cached data, keep showing it
    }

    // Persist selection
    await saveActiveNote(noteId, l2Code);
  }, [l2Code]);

  // ── Create note ───────────────────────────────────────

  const createNote = useCallback(async (): Promise<number> => {
    const online = await checkOnline();

    if (online) {
      // Happy path: create on server
      try {
        const created = await apiClient.post<Note>('/user-notes', {
          title: 'Untitled',
          text: '',
          translation: '',
          l2: l2Code,
        });
        await cacheNote(created);
        await patchCachedNotesList(l2Code, 'create', {
          id: created.id,
          title: created.title,
          created_on: created.created_on,
        });
        if (mountedRef.current) {
          setNotes(prev => [{
            id: created.id,
            title: created.title,
            created_on: created.created_on,
            _syncStatus: 'synced',
          }, ...prev]);
          setCurrentNote(created);
          setCurrentNoteId(created.id);
        }
        await saveActiveNote(created.id, l2Code);
        return created.id;
      } catch {
        // Fall through to offline path
      }
    }

    // Offline path: create locally, queue for sync
    const tempId = makeTempId();
    const now = new Date().toISOString();
    const localNote: Note = {
      id: tempId,
      title: 'Untitled',
      text: '',
      translation: '',
      l2: 0, // placeholder — filled on sync
      owner: 0,
      created_on: now,
    };

    await cacheNote(localNote);
    await patchCachedNotesList(l2Code, 'create', {
      id: tempId,
      title: 'Untitled',
      created_on: now,
    });
    await enqueue({
      action: 'create',
      tempId,
      payload: { title: 'Untitled', text: '', translation: '', l2: l2Code },
      l2Code,
    });

    if (mountedRef.current) {
      setNotes(prev => [{
        id: tempId,
        title: 'Untitled',
        created_on: now,
        _syncStatus: 'pending',
      }, ...prev]);
      setCurrentNote(localNote);
      setCurrentNoteId(tempId);
    }
    await saveActiveNote(tempId, l2Code);
    await refreshPendingCount();
    return tempId;
  }, [l2Code, refreshPendingCount]);

  // ── Rename note ───────────────────────────────────────

  const renameNote = useCallback(async (noteId: number, title: string) => {
    const online = await checkOnline();

    // Update local state immediately (optimistic)
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, title } : n));
    if (currentNoteId === noteId) {
      setCurrentNote(prev => prev ? { ...prev, title } : null);
    }
    await patchCachedNotesList(l2Code, 'update', { id: noteId, title });

    if (online) {
      try {
        await apiClient.patch(`/user-notes/${noteId}`, { title });
      } catch {
        // Queue for later
        await enqueue({
          action: 'update',
          noteId,
          payload: { title },
          l2Code,
        });
        await refreshPendingCount();
        // Re-annotate
        if (mountedRef.current) {
          const pendingMap = await getPendingSyncMap(l2Code);
          setNotes(prev => prev.map(n => ({
            ...n,
            _syncStatus: pendingMap.get(n.id) ?? n._syncStatus,
          })));
        }
      }
    } else {
      await enqueue({
        action: 'update',
        noteId,
        payload: { title },
        l2Code,
      });
      await refreshPendingCount();
      if (mountedRef.current) {
        setNotes(prev => prev.map(n =>
          n.id === noteId ? { ...n, _syncStatus: 'pending' } : n,
        ));
      }
    }
  }, [l2Code, currentNoteId, refreshPendingCount]);

  // ── Delete note ───────────────────────────────────────

  const deleteNote = useCallback(async (noteId: number) => {
    const online = await checkOnline();

    // Update local state immediately (optimistic)
    setNotes(prev => prev.filter(n => n.id !== noteId));
    if (currentNoteId === noteId) {
      setCurrentNote(null);
      setCurrentNoteId(null);
      await saveActiveNote(null, l2Code);
    }
    await removeCachedNote(noteId);
    await patchCachedNotesList(l2Code, 'delete', { id: noteId, title: '' });

    if (online) {
      try {
        await apiClient.delete(`/user-notes/${noteId}`);
      } catch {
        await enqueue({
          action: 'delete',
          noteId,
          l2Code,
        });
        await refreshPendingCount();
      }
    } else {
      await enqueue({
        action: 'delete',
        noteId,
        l2Code,
      });
      await refreshPendingCount();
    }
  }, [l2Code, currentNoteId, refreshPendingCount]);

  // ── Save note (auto-save) ─────────────────────────────

  const saveNote = useCallback(async (noteId: number, text: string, translation: string) => {
    // Update local state immediately
    setCurrentNote(prev => prev ? { ...prev, text, translation } : null);

    // Update cache optimistically
    const cached = await getCachedNote(noteId);
    if (cached) {
      await cacheNote({ ...cached, text, translation });
    }

    const online = await checkOnline();

    if (online) {
      try {
        await apiClient.patch(`/user-notes/${noteId}`, { text, translation });
        // Cache already updated above — no further action needed
      } catch {
        await enqueue({
          action: 'update',
          noteId,
          payload: { text, translation },
          l2Code,
        });
        await refreshPendingCount();
        if (mountedRef.current) {
          setNotes(prev => prev.map(n =>
            n.id === noteId ? { ...n, _syncStatus: 'pending' } : n,
          ));
        }
      }
    } else {
      await enqueue({
        action: 'update',
        noteId,
        payload: { text, translation },
        l2Code,
      });
      await refreshPendingCount();
      if (mountedRef.current) {
        setNotes(prev => prev.map(n =>
          n.id === noteId ? { ...n, _syncStatus: 'pending' } : n,
        ));
      }
    }
  }, [l2Code, refreshPendingCount]);

  // ── Manual sync trigger ───────────────────────────────

  const syncNow = useCallback(async () => {
    await processSyncQueue();
    await refreshPendingCount();
    // Reload to get latest server state
    await loadNotes();
  }, [loadNotes, refreshPendingCount]);

  // ── Load notes on mount / user / language change ──────

  useEffect(() => {
    if (user) loadNotes();
  }, [user, l2Code, loadNotes]);

  // ── Restore saved active note on mount ────────────────

  const restoredRef = useRef(false);

  useEffect(() => {
    if (!user || notes.length === 0 || restoredRef.current) return;
    restoredRef.current = true;

    (async () => {
      const savedId = await getSavedActiveNote(l2Code);
      if (savedId != null && notes.some(n => n.id === savedId)) {
        await selectNote(savedId);
      }
    })();
  }, [user, notes, l2Code, selectNote]);

  return {
    notes, notesLoading, notesError,
    currentNote, currentNoteId,
    loadNotes, selectNote, createNote,
    renameNote, deleteNote, saveNote,
    setCurrentNoteId,
    syncNow,
    pendingSyncCount,
  };
}
