/**
 * Notes Sync Queue — offline mutation queue with retry logic.
 *
 * When the device is offline, note operations (create/update/delete)
 * are stored in a local queue. When connectivity returns, the queue
 * is processed in FIFO order.
 *
 * Network detection:
 *   - Try a lightweight HEAD request to the API health endpoint.
 *   - Also triggered by AppState changes (app returning to foreground).
 *   - Periodic retry every 30 seconds when there are pending items.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { apiClient } from '@langplayer/api-client';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { Note } from '@langplayer/shared';
import {
  cacheNotesList,
  cacheNote,
  removeCachedNote,
  patchCachedNotesList,
  remapLocalNoteId,
  getCachedNotesList,
  getCachedNote,
} from '@/lib/notes-storage';

// ── Types ─────────────────────────────────────────────────

export type SyncAction = 'create' | 'update' | 'delete';

export interface SyncQueueEntry {
  /** Unique ID for this queue item (crypto.randomUUID or Date.now-based). */
  id: string;
  /** Operation type. */
  action: SyncAction;
  /** Server note ID (undefined for creates that haven't been synced yet). */
  noteId?: number;
  /** Temp local ID used for offline creates (negative number). */
  tempId?: number;
  /** Payload sent to the API. */
  payload?: Record<string, unknown>;
  /** ISO timestamp when this entry was queued. */
  timestamp: string;
  /** Number of failed attempts. */
  retryCount: number;
  /** L2 language code for cache management. */
  l2Code: string;
}

export type SyncStatus = 'synced' | 'pending' | 'error';

export interface NoteListItemWithSync {
  id: number;
  title: string;
  created_on?: string;
  _syncStatus: SyncStatus;
}

const QUEUE_KEY = 'notes_sync_queue';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // ms — exponential-ish

// ── Network detection ────────────────────────────────────

let _isOnline = true;
let _lastCheck = 0;
const CHECK_COOLDOWN = 5000; // don't hammer the server

/**
 * Check connectivity by making a lightweight request to the API.
 * Caches the result for CHECK_COOLDOWN ms to avoid flooding the server.
 */
export async function checkOnline(): Promise<boolean> {
  const now = Date.now();
  if (now - _lastCheck < CHECK_COOLDOWN) return _isOnline;
  _lastCheck = now;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch(`${PYTHON_API_URL}/`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    _isOnline = true;
  } catch {
    _isOnline = false;
  }
  return _isOnline;
}

// ── Queue storage ─────────────────────────────────────────

async function getQueue(): Promise<SyncQueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: SyncQueueEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // non-critical
  }
}

// ── Public API ────────────────────────────────────────────

/** Add an operation to the sync queue. */
export async function enqueue(entry: Omit<SyncQueueEntry, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
  const queue = await getQueue();
  queue.push({
    ...entry,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    retryCount: 0,
  });
  await saveQueue(queue);
}

/** Check how many pending operations exist for a set of note IDs. */
export async function getPendingSyncMap(l2Code: string): Promise<Map<number, SyncStatus>> {
  const queue = await getQueue();
  const map = new Map<number, SyncStatus>();

  for (const entry of queue) {
    if (entry.l2Code !== l2Code) continue;
    const id = entry.noteId ?? entry.tempId;
    if (id == null) continue;
    map.set(id, entry.retryCount >= MAX_RETRIES ? 'error' : 'pending');
  }

  return map;
}

/** Count total pending operations. */
export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.filter(e => e.retryCount < MAX_RETRIES).length;
}

/** Process the sync queue — call this when online. Returns true if any entries were processed. */
export async function processSyncQueue(): Promise<boolean> {
  const online = await checkOnline();
  if (!online) return false;

  const queue = await getQueue();
  if (queue.length === 0) return false;

  let dirty = false;
  const remaining: SyncQueueEntry[] = [];

  for (const entry of queue) {
    if (entry.retryCount >= MAX_RETRIES) {
      // Keep failed entries for visibility but don't retry
      remaining.push(entry);
      continue;
    }

    try {
      switch (entry.action) {
        case 'create':
          await _syncCreate(entry);
          break;
        case 'update':
          await _syncUpdate(entry);
          break;
        case 'delete':
          await _syncDelete(entry);
          break;
      }
      dirty = true; // successfully processed at least one
      // Don't push to remaining — it's done
    } catch {
      entry.retryCount++;
      if (entry.retryCount < MAX_RETRIES) {
        // wait before retrying next entry
        await _sleep(RETRY_DELAYS[Math.min(entry.retryCount - 1, RETRY_DELAYS.length - 1)]);
      }
      remaining.push(entry);
    }
  }

  await saveQueue(remaining);
  return dirty;
}

// ── Per-action sync handlers ─────────────────────────────

async function _syncCreate(entry: SyncQueueEntry): Promise<void> {
  const payload = entry.payload ?? {};
  const created = await apiClient.post<Note>('/user-notes', payload);

  // Update cache: replace temp ID with real server ID
  if (entry.tempId != null) {
    await remapLocalNoteId(entry.l2Code, entry.tempId, created.id);
  }
  await cacheNote(created);
}

async function _syncUpdate(entry: SyncQueueEntry): Promise<void> {
  if (entry.noteId == null) throw new Error('Missing noteId for update');
  const payload = entry.payload ?? {};
  const updated = await apiClient.patch<Note>(`/user-notes/${entry.noteId}`, payload);

  // Update cache
  await cacheNote(updated);
  await patchCachedNotesList(entry.l2Code, 'update', {
    id: updated.id,
    title: updated.title,
    created_on: updated.created_on,
  });
}

async function _syncDelete(entry: SyncQueueEntry): Promise<void> {
  if (entry.noteId == null) throw new Error('Missing noteId for delete');
  await apiClient.delete(`/user-notes/${entry.noteId}`);

  // Remove from cache
  await removeCachedNote(entry.noteId);
  await patchCachedNotesList(entry.l2Code, 'delete', {
    id: entry.noteId,
    title: '',
  });
}

function _sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── AppState listener ─────────────────────────────────────

let _appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;
let _syncInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start listening for app foreground events and set up periodic sync.
 * Call once at app startup (or first use of notes).
 */
export function startNotesSyncListener(): void {
  if (_appStateSub) return; // already listening

  _appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      processSyncQueue();
    }
  });

  // Periodic retry for pending items
  _syncInterval = setInterval(() => {
    processSyncQueue();
  }, 30000);
}

/** Stop the sync listener (call on cleanup if needed). */
export function stopNotesSyncListener(): void {
  if (_appStateSub) {
    _appStateSub.remove();
    _appStateSub = null;
  }
  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }
}
