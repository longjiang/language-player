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
  getCachedNote,
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
  // Offline creates use negative temp ids; updates/deletes on a temp note must
  // coalesce into the SAME outbox row as the create (or the server would try
  // to update a negative id and drop it).
  const isTemp = noteId != null && noteId < 0;
  const entityId =
    noteId != null && !isTemp
      ? String(noteId)
      : `tmp-${noteId ?? entry.tempId ?? Date.now()}`;

  // Whole-row contract: every queued note op carries the FULL note
  // (l2/title/text/translation). The caller sends a partial patch (rename
  // only sends title, autosave only sends text), so merge it over the cached
  // body — otherwise the final coalesced payload could drop fields and the
  // server would create/update an empty note.
  let cached: Note | null = null;
  const cachedId = noteId ?? entry.tempId ?? null;
  if (cachedId != null) {
    try {
      cached = await getCachedNote(cachedId);
    } catch {
      cached = null;
    }
  }
  // entity_cache fallback — covers notes pulled from another device but never
  // opened (no AsyncStorage body yet) and legacy partial rows.
  let cachedPayload: Record<string, unknown> | null = null;
  try {
    const row = await getEntityCacheRow('note', entityId);
    if (row && row.deleted_at == null) {
      cachedPayload = JSON.parse(row.payload) as Record<string, unknown>;
    }
  } catch {
    cachedPayload = null;
  }
  const pick = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const patch = entry.payload ?? {};
  const title = pick(patch.title) ?? cached?.title ?? pick(cachedPayload?.title) ?? 'Untitled';
  const text = pick(patch.text) ?? cached?.text ?? pick(cachedPayload?.text) ?? '';
  const translation =
    pick(patch.translation) ?? cached?.translation ?? pick(cachedPayload?.translation) ?? '';
  const payload: Record<string, unknown> = {
    l2: entry.l2Code,
    ...(isTemp ? { tempId: noteId } : { noteId }),
    ...(entry.noteId == null && entry.tempId != null ? { tempId: entry.tempId } : {}),
    title,
    text,
    translation,
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
  log('[notes-sync] engine bridge started (pull refresh + temp-ID remap)');
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
      // MERGE the change-log payload over the existing cached body — a
      // partial log entry (e.g. a rename that only carries title) must never
      // overwrite a fuller local body with empty text.
      const existing = await getCachedNote(id);
      const note: Note = {
        id,
        title: typeof payload.title === 'string' ? payload.title : (existing?.title ?? 'Untitled'),
        text: typeof payload.text === 'string' ? payload.text : (existing?.text ?? ''),
        translation: typeof payload.translation === 'string' ? payload.translation : (existing?.translation ?? ''),
        l2: existing?.l2 ?? 0,
        owner: existing?.owner ?? 0,
        created_on: typeof payload.created_on === 'string' ? payload.created_on : (existing?.created_on ?? ''),
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
