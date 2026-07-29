/**
 * Notes Local Cache — AsyncStorage helpers for offline-first notes.
 *
 * Two cache tiers:
 *   1. List cache:  `notes_list_{l2Code}` → NoteListItem[]
 *   2. Note cache:  `note_{noteId}`       → Note (full content)
 *
 * On first load, we read the list cache immediately (instant UI),
 * then fetch from the server to refresh and update the cache.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Note, NoteListItem } from '@langplayer/shared';

const LIST_PREFIX = 'notes_list_';
const NOTE_PREFIX = 'note_';

// ── List cache ────────────────────────────────────────────

export async function cacheNotesList(l2Code: string, notes: NoteListItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LIST_PREFIX + l2Code, JSON.stringify(notes));
  } catch {
    // Storage full or unavailable — non-critical
  }
}

export async function getCachedNotesList(l2Code: string): Promise<NoteListItem[]> {
  try {
    const raw = await AsyncStorage.getItem(LIST_PREFIX + l2Code);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Note cache ────────────────────────────────────────────

export async function cacheNote(note: Note): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTE_PREFIX + note.id, JSON.stringify(note));
  } catch {
    // non-critical
  }
}

export async function getCachedNote(noteId: number): Promise<Note | null> {
  try {
    const raw = await AsyncStorage.getItem(NOTE_PREFIX + noteId);
    return raw ? (JSON.parse(raw) as Note) : null;
  } catch {
    return null;
  }
}

export async function removeCachedNote(noteId: number): Promise<void> {
  try {
    await AsyncStorage.removeItem(NOTE_PREFIX + noteId);
  } catch {
    // non-critical
  }
}

// ── Bulk operations ───────────────────────────────────────

/**
 * Update the list cache after a local mutation:
 * - create: prepend the new item
 * - update: replace matching item
 * - delete: remove matching item
 */
export async function patchCachedNotesList(
  l2Code: string,
  action: 'create' | 'update' | 'delete',
  item: NoteListItem,
): Promise<void> {
  const list = await getCachedNotesList(l2Code);
  let updated: NoteListItem[];
  switch (action) {
    case 'create':
      updated = [item, ...list];
      break;
    case 'update':
      updated = list.map(n => (n.id === item.id ? { ...n, ...item } : n));
      break;
    case 'delete':
      updated = list.filter(n => n.id !== item.id);
      break;
    default:
      updated = list;
  }
  await cacheNotesList(l2Code, updated);
}

/**
 * Replace a local (negative) note ID with the real server ID
 * throughout the cache — both the list and the note entry.
 */
export async function remapLocalNoteId(
  l2Code: string,
  localId: number,
  serverId: number,
): Promise<void> {
  // Remap in list
  const list = await getCachedNotesList(l2Code);
  const updated = list.map(n => (n.id === localId ? { ...n, id: serverId } : n));
  await cacheNotesList(l2Code, updated);

  // Remap cached note
  const note = await getCachedNote(localId);
  if (note) {
    await removeCachedNote(localId);
    await cacheNote({ ...note, id: serverId });
  }
}
