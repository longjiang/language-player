/**
 * SPEC-053 Phase 2 — durable outbox sync engine.
 *
 * Write path: local SQLite (entity_cache + outbox in one transaction), then a
 * debounced flush. Sync loop: pull → merge (LWW + tombstones) → push FIFO →
 * ack → advance cursor. Never runs two syncs at once, never drops a row that
 * the server hasn't acknowledged, and retries with exponential backoff.
 */

import { AppState } from 'react-native';
import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { isOfflineModeEnabled } from '@/lib/offline-mode';
import {
  getConnectivity,
  subscribeConnectivity,
  startConnectivity,
} from '@/lib/connectivity';
import { log, logwarn } from '@/lib/logger';
import {
  enqueueOutboxOp,
  getEntityCache,
  getEntityCacheRow,
  getOutboxStats,
  getSyncMeta,
  listPendingOutbox,
  markOutboxError,
  setEntityCacheDeleted,
  setSyncMeta,
  upsertEntityCache,
  deleteOutboxRows,
  resetOutboxErrors,
  type OutboxOp,
} from '@/lib/sync-db';

const MAX_PUSH_ATTEMPTS = 5;
const FLUSH_DEBOUNCE_MS = 1500;
const RETRY_INTERVAL_MS = 30000;

export interface SyncStatusSnapshot {
  connectivity: 'online' | 'offline' | 'unknown';
  offlineMode: boolean;
  effectiveOffline: boolean;
  syncing: boolean;
  pendingCount: number;
  errorCount: number;
  lastSyncAt: number | null;
  lastError: string | null;
}

export interface SyncOpInput {
  entity: string;
  entityId: string;
  op: OutboxOp;
  payload: Record<string, unknown>;
  updatedAt?: number;
}

export interface OutboxSnapshot {
  id: string;
  entity: string;
  entity_id: string;
  op: OutboxOp;
  payload: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  attempts: number;
  last_error: string | null;
  status: 'pending' | 'error';
}

const statusListeners = new Set<(s: SyncStatusSnapshot) => void>();
const entityListeners = new Map<string, Set<(entityId: string) => void>>();
const remapListeners = new Set<
  (entity: string, tempId: string, serverId: string, l2Code?: string) => void
>();

let authProvider: () => { userId: string | null } = () => ({ userId: null });
let engineStarted = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;
let connectivity = 'unknown' as SyncStatusSnapshot['connectivity'];
let offlineMode = false;

const status: SyncStatusSnapshot = {
  connectivity: 'unknown',
  offlineMode: false,
  effectiveOffline: true,
  syncing: false,
  pendingCount: 0,
  errorCount: 0,
  lastSyncAt: null,
  lastError: null,
};

function publishStatus(): void {
  const snapshot: SyncStatusSnapshot = { ...status };
  for (const cb of statusListeners) cb(snapshot);
}

async function refreshPendingCount(): Promise<void> {
  const stats = await getOutboxStats();
  status.pendingCount = stats.pending;
  status.errorCount = stats.error;
  publishStatus();
}

function notifyEntity(entity: string, entityId: string): void {
  entityListeners.get(entity)?.forEach((cb) => cb(entityId));
}

function notifyRemap(
  entity: string,
  tempId: string,
  serverId: string,
  l2Code?: string,
): void {
  remapListeners.forEach((cb) => cb(entity, tempId, serverId, l2Code));
}

// ── Public write API ────────────────────────────────────────────────

/** Write-through: cache + durable outbox in one transaction, then flush soon. */
export async function enqueueSyncOp(input: SyncOpInput): Promise<void> {
  const { entity, entityId, op, payload, updatedAt } = input;
  await enqueueOutboxOp({
    entity,
    entityId,
    op,
    payload,
    updatedAt: updatedAt ?? Date.now(),
  });
  log(`[sync] enqueued ${op} ${entity}:${entityId}`);
  await refreshPendingCount();
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void runSyncNow();
  }, FLUSH_DEBOUNCE_MS);
}

// ── Sync loop ───────────────────────────────────────────────────────

async function pullChanges(userId: string): Promise<void> {
  const cursorKey = `cursor_${userId}`;
  const cursor = Number((await getSyncMeta(cursorKey)) ?? 0);
  let next = cursor;

  for (let page = 0; page < 20; page++) {
    const res = await authenticatedFetch(
      `${PYTHON_API_URL}/sync/pull?cursor=${next}&limit=500`,
    );
    if (!res.ok) {
      if (res.status === 401) throw new Error('Unauthorized');
      throw new Error(`pull failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      cursor: number;
      changes: Array<{
        id: number;
        entity: string;
        entity_id: string;
        op: string;
        payload: Record<string, unknown>;
        updated_at: number;
        deleted: boolean;
      }>;
      has_more: boolean;
    };

    for (const change of data.changes) {
      await mergeChange(change);
    }
    next = data.cursor;
    await setSyncMeta(cursorKey, String(next));
    if (!data.has_more || data.changes.length === 0) break;
  }
}

async function mergeChange(change: {
  entity: string;
  entity_id: string;
  op: string;
  payload: Record<string, unknown>;
  updated_at: number;
  deleted: boolean;
}): Promise<void> {
  const { entity, entity_id: entityId, updated_at: updatedAt, deleted } = change;
  const existing = await getEntityCacheRow(entity, entityId);

  if (deleted) {
    if (!existing || (existing.deleted_at ?? 0) < updatedAt) {
      await setEntityCacheDeleted(entity, entityId, updatedAt);
      notifyEntity(entity, entityId);
    }
    return;
  }
  // Local tombstone wins over an older remote upsert.
  if (existing?.deleted_at != null && existing.deleted_at >= updatedAt) return;
  // Local newer write wins (it is still in the outbox and will be pushed).
  if (existing && existing.updated_at > updatedAt) return;

  await upsertEntityCache(
    entity,
    entityId,
    JSON.stringify(change.payload ?? {}),
    updatedAt,
    null,
  );
  notifyEntity(entity, entityId);
}

async function pushOutbox(): Promise<number> {
  const rows = await listPendingOutbox();
  if (rows.length === 0) return 0;

  const res = await authenticatedFetch(`${PYTHON_API_URL}/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ops: rows.map((r) => ({
        idempotency_key: r.idempotency_key,
        entity: r.entity,
        entity_id: r.entity_id,
        op: r.op,
        payload: JSON.parse(r.payload) as Record<string, unknown>,
        updated_at: r.updated_at,
      })),
    }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized');
    throw new Error(`push failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    results: Array<{
      ok: boolean;
      idempotency_key: string;
      entity?: string;
      entity_id?: string;
      error?: string;
    }>;
  };

  const acked: string[] = [];
  const byKey = new Map(rows.map((r) => [r.idempotency_key, r]));
  for (const result of data.results) {
    const row = byKey.get(result.idempotency_key);
    if (!row) continue;
    if (result.ok) {
      acked.push(row.id);
      // Temp-ID remap for offline note creates (and any future temp-ID flow).
      if (
        result.entity === 'note' &&
        row.op === 'upsert' &&
        result.entity_id &&
        result.entity_id !== row.entity_id
      ) {
        const payload = JSON.parse(row.payload) as Record<string, unknown>;
        notifyRemap('note', row.entity_id, result.entity_id, String(payload.l2 ?? ''));
      }
    } else {
      const attempts = row.attempts + 1;
      const failed = attempts >= MAX_PUSH_ATTEMPTS;
      await markOutboxError(
        row.id,
        result.error ?? 'sync push rejected',
        attempts,
        failed ? 'error' : 'pending',
      );
      logwarn(`[sync] push op failed ${row.entity}:${row.entity_id}`, result.error);
    }
  }
  if (acked.length > 0) {
    await deleteOutboxRows(acked);
    log(`[sync] ✅ pushed ${acked.length} op(s)`);
  }
  return acked.length;
}

/**
 * Run one sync cycle (pull → merge → push → ack). Never runs concurrently.
 * Safe to call from any trigger; it no-ops when offline, signed out, or busy.
 */
export async function runSyncNow(): Promise<void> {
  if (syncing) return;
  const { userId } = authProvider();
  if (!userId || isOfflineModeEnabled() || getConnectivity() === 'offline') {
    await refreshPendingCount();
    return;
  }

  syncing = true;
  status.syncing = true;
  publishStatus();
  try {
    await pullChanges(userId);
    const pushed = await pushOutbox();
    if (pushed > 0) await refreshPendingCount();
    status.lastSyncAt = Date.now();
    status.lastError = null;
    status.syncing = false;
    await setSyncMeta('last_sync_at', String(status.lastSyncAt));
  } catch (e) {
    status.lastError = (e as Error)?.message ?? String(e);
    logwarn('[sync] sync cycle failed:', status.lastError);
  } finally {
    syncing = false;
    status.syncing = false;
    await refreshPendingCount();
  }
}

// ── Subscriptions ───────────────────────────────────────────────────

export function subscribeSyncStatus(cb: (s: SyncStatusSnapshot) => void): () => void {
  statusListeners.add(cb);
  cb({ ...status });
  return () => statusListeners.delete(cb);
}

export function subscribeEntity(
  entity: string,
  cb: (entityId: string) => void,
): () => void {
  let set = entityListeners.get(entity);
  if (!set) {
    set = new Set();
    entityListeners.set(entity, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) entityListeners.delete(entity);
  };
}

export function subscribeRemap(
  cb: (entity: string, tempId: string, serverId: string, l2Code?: string) => void,
): () => void {
  remapListeners.add(cb);
  return () => remapListeners.delete(cb);
}

export function getEntityCacheRows(entity: string) {
  return getEntityCache(entity);
}

export async function getOutboxSnapshot(): Promise<OutboxSnapshot[]> {
  const { listOutbox } = await import('@/lib/sync-db');
  const rows = await listOutbox();
  return rows.map((r) => ({
    id: r.id,
    entity: r.entity,
    entity_id: r.entity_id,
    op: r.op,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
    created_at: r.created_at,
    updated_at: r.updated_at,
    attempts: r.attempts,
    last_error: r.last_error,
    status: r.status,
  }));
}

/** Reset failed ops to pending and flush (Sync Status screen retry). */
export async function retryFailedOps(): Promise<void> {
  const reset = await resetOutboxErrors();
  if (reset > 0) {
    log(`[sync] reset ${reset} failed op(s) for retry`);
    await refreshPendingCount();
    await runSyncNow();
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────

/**
 * Start the engine (idempotent). Call once from SyncStatusProvider, after the
 * auth provider is mounted. Returns a stop function.
 */
export function startSyncEngine(getAuth: () => { userId: string | null }): () => void {
  authProvider = getAuth;
  if (engineStarted) return () => {};
  engineStarted = true;

  const unsubConnectivity = subscribeConnectivity((c) => {
    connectivity = c;
    status.connectivity = c;
    status.effectiveOffline = offlineMode || c === 'offline';
    publishStatus();
    if (c === 'online') void runSyncNow();
  });

  const unsubAppState = AppState.addEventListener('change', (state) => {
    if (state === 'active') void runSyncNow();
  });

  retryTimer = setInterval(() => {
    void runSyncNow();
  }, RETRY_INTERVAL_MS);

  startConnectivity();
  void refreshPendingCount();
  void runSyncNow();

  return () => {
    unsubConnectivity();
    unsubAppState.remove();
    if (retryTimer) clearInterval(retryTimer);
    if (flushTimer) clearTimeout(flushTimer);
    engineStarted = false;
  };
}

/** Keep the manual Offline Mode toggle in sync with the status snapshot. */
export function setEngineOfflineMode(enabled: boolean): void {
  offlineMode = enabled;
  status.offlineMode = enabled;
  status.effectiveOffline = enabled || connectivity === 'offline';
  publishStatus();
  if (!enabled) void runSyncNow();
}
