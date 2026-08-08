/**
 * Notes Sync — engine-backed adapter (SPEC-053 Phase 2).
 *
 * The old AsyncStorage FIFO queue is replaced by the durable `sync.db`
 * outbox + `/sync/push` engine. This module keeps the previous public API
 * (`enqueue`, `getPendingSyncMap`, `processSyncQueue`,
 * `startNotesSyncListener`, `checkOnline`) so `use-reader-notes.ts` and other
 * call sites don't change.
 */

import type { Note } from '@langplayer/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { probeOnline } from '@/lib/connectivity';
import { log } from '@/lib/logger';
import {
  enqueueSyncOp,
  getOutboxSnapshot,
  runSyncNow,
  subscribeEntity,
  subscribeRemap,
} from '@/lib/sync-engine';
import { getEntityCacheRow } from '@/lib/sync-db';
import {
  cacheNote,
  patchCachedNotesList,
  removeCachedNote,
  remapLocalNoteId,
} from '@/lib/notes-storage';

// ── Types (kept for compatibility) ─────────────────────

export type SyncAction = 'create' | 'update' | 'delete';

export interface SyncQueueEntry {
  id: string;
  action: SyncAction;
  noteId?: number;
  tempId?: number;
  payload?: Record<string, unknown>;
  timestamp: string;
  retryCount: number;
  l2Code: string;
}

export type SyncStatus = 'synced' | 'pending' | 'error';

export interface NoteListItemWithSync {
  id: number;
  title: string;
  created_on?: string;
  _syncStatus: SyncStatus;
}

// ── Network detection (delegates to connectivity) ──────

export async function checkOnline(): Promise<boolean> {
  return probeOnline();
}

// ── Public API ─────────────────────────────────────────

/** Add an operation to the durable outbox. */
export async function enqueue(
  entry: Omit<SyncQueueEntry, 'id' | 'timestamp' | 'retryCount'>,
): Promise<void> {
  const action = entry.action;
  const op = action === 'delete' ? 'delete' : 'upsert';
  const noteId = entry.noteId;
  const entityId = noteId != null ? String(noteId) : `tmp-${entry.tempId ?? Date.now()}`;
  const payload: Record<string, unknown> = {
    ...(entry.payload ?? {}),
    l2: entry.l2Code,
    noteId,
    tempId: entry.tempId,
  };
  log(`[notes-sync] enqueue ${action} note ${entityId}`);
  await enqueueSyncOp({
    entity: 'note',
    entityId,
    op,
    payload,
    updatedAt: Date.now(),
  });
}

/** Pending/error status per note id (server id or temp id as shown in UI). */
export async function getPendingSyncMap(l2Code: string): Promise<Map<number, SyncStatus>> {
  const ops = await getOutboxSnapshot();
  const map = new Map<number, SyncStatus>();
  for (const op of ops) {
    if (op.entity !== 'note') continue;
    if (op.payload?.l2 !== l2Code) continue;
    const raw = op.entity_id;
    const id = raw.startsWith('tmp-')
      ? Number(raw.slice(4))
      : Number(raw);
    if (!Number.isFinite(id)) continue;
    map.set(id, op.status === 'error' ? 'error' : 'pending');
  }
  return map;
}

/** Count pending note operations. */
export async function getPendingCount(): Promise<number> {
  const ops = await getOutboxSnapshot();
  return ops.filter((op) => op.entity === 'note' && op.status === 'pending').length;
}

/** Process the outbox via the sync engine. */
export async function processSyncQueue(): Promise<boolean> {
  const before = await getPendingCount();
  await runSyncNow();
  const after = await getPendingCount();
  return before !== after;
}

// ── Engine bridge: keep AsyncStorage caches in sync on pull/remap ──

let bridgeStarted = false;

const LEGACY_QUEUE_KEY = 'notes_sync_queue';

/** Migrate the pre-Phase-2 AsyncStorage queue into the durable outbox once. */
async function migrateLegacyQueue(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_QUEUE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as SyncQueueEntry[];
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      await enqueue({
        action: entry.action,
        noteId: entry.noteId,
        tempId: entry.tempId,
        payload: entry.payload,
        l2Code: entry.l2Code,
      });
    }
    await AsyncStorage.removeItem(LEGACY_QUEUE_KEY);
    log(`[notes-sync] migrated ${entries.length} legacy queue entries`);
  } catch {
    // Non-fatal: migration will retry next launch.
  }
}

function startNoteSyncBridge(): void {
  if (bridgeStarted) return;
  bridgeStarted = true;
  void migrateLegacyQueue();

  // Temp-ID remap after an offline create is acknowledged.
  subscribeRemap(async (entity, tempId, serverId, l2Code) => {
    if (entity !== 'note' || !l2Code) return;
    const localId = tempId.startsWith('tmp-') ? Number(tempId.slice(4)) : Number(tempId);
    const serverNumber = Number(serverId);
    if (!Number.isFinite(localId) || !Number.isFinite(serverNumber)) return;
    log(`[notes-sync] remap ${localId} → ${serverNumber}`);
    await remapLocalNoteId(l2Code, localId, serverNumber);
  });

  // Remote changes pulled from another device.
  subscribeEntity('note', async (entityId) => {
    try {
      const row = await getEntityCacheRow('note', entityId);
      if (!row) return;
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      const id = Number(payload.noteId ?? entityId);
      if (!Number.isFinite(id)) return;
      if (row.deleted_at != null) {
        await removeCachedNote(id);
        const l2 = String(payload.l2 ?? '');
        if (l2) await patchCachedNotesList(l2, 'delete', { id, title: '' });
        return;
      }
      const note: Note = {
        id,
        title: String(payload.title ?? 'Untitled'),
        text: String(payload.text ?? ''),
        translation: String(payload.translation ?? ''),
        l2: 0,
        owner: 0,
        created_on: String(payload.created_on ?? ''),
      };
      await cacheNote(note);
      const l2 = String(payload.l2 ?? '');
      if (l2) {
        await patchCachedNotesList(l2, 'update', {
          id,
          title: note.title,
          created_on: note.created_on,
        });
      }
    } catch (e) {
      log('[notes-sync] pull bridge failed:', e);
    }
  });
}

/**
 * Start the notes sync bridge. The durable outbox/retry/connectivity loops
 * live in the sync engine (started by SyncStatusProvider), so this only wires
 * cache refresh + temp-ID remapping.
 */
export function startNotesSyncListener(): void {
  startNoteSyncBridge();
}

/** No-op (engine owns the listeners now); kept for compatibility. */
export function stopNotesSyncListener(): void {
  // Intentionally empty.
}
