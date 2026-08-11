/**
 * SPEC-053 Phase 2 — durable outbox sync engine.
 *
 * Write path: local SQLite (entity_cache + outbox in one transaction), then a
 * debounced flush. Sync loop: pull → merge (LWW + tombstones) → push FIFO →
 * ack → advance cursor. Never runs two syncs at once, never drops a row that
 * the server hasn't acknowledged, and retries with exponential backoff.
 */

import { AppState } from 'react-native';
import { repairSyncPayload } from '@langplayer/utils';
import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { isOfflineModeEnabled } from '@/lib/offline-mode';
import {
  getConnectivity,
  subscribeConnectivity,
  startConnectivity,
} from '@/lib/connectivity';
import { syncLogger } from '@/lib/logger';
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
  deleteOutboxRowsIfUnchanged,
  resetOutboxErrors,
  type OutboxOp,
} from '@/lib/sync-db';

const { log, logwarn } = syncLogger;

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
/** Outbox rows captured in the current push batch — never coalesce into them. */
const inFlightOutboxIds = new Set<string>();

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
    skipCoalesceIds: inFlightOutboxIds.size > 0 ? inFlightOutboxIds : undefined,
  });
  log(`[sync] enqueued ${op} ${entity}:${entityId}`);
  await refreshPendingCount();
  scheduleFlush();
  log(`[sync] outbox now pending=${status.pendingCount} error=${status.errorCount}`);
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
  let totalApplied = 0;
  let totalSkipped = 0;

  for (let page = 0; page < 20; page++) {
    log(`[sync] pull page ${page} user=${userId} cursor=${next} limit=500`);
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

    let applied = 0;
    let skipped = 0;
    for (const change of data.changes) {
      const outcome = await mergeChange(change);
      if (outcome === 'applied') applied++;
      else skipped++;
    }
    next = data.cursor;
    await setSyncMeta(cursorKey, String(next));
    totalApplied += applied;
    totalSkipped += skipped;
    log(`[sync] pull page ${page} done changes=${data.changes.length} applied=${applied} skipped=${skipped} cursor→${next} has_more=${data.has_more}`);
    if (!data.has_more || data.changes.length === 0) break;
  }
  log(`[sync] pull complete user=${userId} applied=${totalApplied} skipped=${totalSkipped} cursor=${next}`);
}

async function mergeChange(change: {
  entity: string;
  entity_id: string;
  op: string;
  payload: Record<string, unknown>;
  updated_at: number;
  deleted: boolean;
}): Promise<'applied' | 'skipped'> {
  const { entity, entity_id: entityId, updated_at: updatedAt, deleted } = change;
  const existing = await getEntityCacheRow(entity, entityId);

  if (deleted) {
    if (!existing || (existing.deleted_at ?? 0) < updatedAt) {
      await setEntityCacheDeleted(entity, entityId, updatedAt);
      notifyEntity(entity, entityId);
      return 'applied';
    }
    return 'skipped';
  }
  // Local tombstone wins over an older remote upsert.
  if (existing?.deleted_at != null && existing.deleted_at >= updatedAt) return 'skipped';
  // Local newer write wins (it is still in the outbox and will be pushed).
  if (existing && existing.updated_at > updatedAt) return 'skipped';

  await upsertEntityCache(
    entity,
    entityId,
    JSON.stringify(change.payload ?? {}),
    updatedAt,
    null,
  );
  notifyEntity(entity, entityId);
  return 'applied';
}

async function pushOutbox(): Promise<number> {
  const rows = await listPendingOutbox();
  if (rows.length === 0) {
    log('[sync] push skip — outbox empty');
    return 0;
  }
  log(`[sync] push start ops=${rows.length}`);

  // Mark this batch as in-flight so concurrent edits can't coalesce into the
  // rows being sent (which would let a stale ack delete the newer edit).
  inFlightOutboxIds.clear();
  for (const r of rows) inFlightOutboxIds.add(r.id);

  try {
    const res = await authenticatedFetch(`${PYTHON_API_URL}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ops: await Promise.all(rows.map(async (r) => {
          let payload = JSON.parse(r.payload) as Record<string, unknown>;
          // Self-heal legacy partial payloads (queued before the whole-row
          // contract) so strict server validation can't strand them forever.
          if (r.op === 'upsert') {
            try {
              const cached = await getEntityCacheRow(r.entity, r.entity_id);
              const source = cached && cached.deleted_at == null
                ? JSON.parse(cached.payload) as Record<string, unknown>
                : null;
              const repaired = repairSyncPayload(r.entity, payload, source);
              if (JSON.stringify(repaired) !== JSON.stringify(payload)) {
                log(`[sync] repaired ${r.entity}:${r.entity_id} legacy payload — ${Object.keys(repaired).join(',')}`);
              }
              payload = repaired;
            } catch {
              // Unrepairable — leave as-is; the server will reject loudly.
            }
          }
          return {
            idempotency_key: r.idempotency_key,
            entity: r.entity,
            entity_id: r.entity_id,
            op: r.op,
            payload,
            updated_at: r.updated_at,
          };
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
        dropped?: boolean;
      }>;
    };

    const acked: string[] = [];
    const byKey = new Map(rows.map((r) => [r.idempotency_key, r]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    let okCount = 0;
    let failedCount = 0;
    for (const result of data.results) {
      const row = byKey.get(result.idempotency_key);
      if (!row) continue;
      if (result.ok) {
        okCount++;
        if (result.dropped) {
          log(`[sync] push dropped ${row.entity}:${row.entity_id} idem=${row.idempotency_key} — no-op`);
        } else {
          log(`[sync] push ok ${row.entity}:${row.entity_id} idem=${row.idempotency_key}`);
        }
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
        failedCount++;
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
      // Version-checked ack: only delete rows that still match the snapshot
      // (idempotency key + updated_at). A row edited mid-flight keeps a
      // separate newer row and must survive this ack.
      const ackEntries = acked
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => ({ id: r.id, idempotencyKey: r.idempotency_key, updatedAt: r.updated_at }));
      await deleteOutboxRowsIfUnchanged(ackEntries);
      log(`[sync] ✅ push done ok=${okCount} failed=${failedCount} acked=${acked.length}`);
    }
    return acked.length;
  } finally {
    inFlightOutboxIds.clear();
  }
}

/**
 * Run one sync cycle (pull → merge → push → ack). Never runs concurrently.
 * Safe to call from any trigger; it no-ops when offline, signed out, or busy.
 */
export async function runSyncNow(): Promise<void> {
  if (syncing) {
    log('[sync] runSyncNow skipped — already running');
    return;
  }
  const { userId } = authProvider();
  if (!userId || isOfflineModeEnabled() || getConnectivity() === 'offline') {
    log(`[sync] runSyncNow skipped — userId=${userId} offlineMode=${isOfflineModeEnabled()} connectivity=${getConnectivity()}`);
    await refreshPendingCount();
    return;
  }

  syncing = true;
  status.syncing = true;
  publishStatus();
  log(`[sync] ▶ cycle start user=${userId} pending=${status.pendingCount}`);
  try {
    await pullChanges(userId);
    const pushed = await pushOutbox();
    if (pushed > 0) await refreshPendingCount();
    status.lastSyncAt = Date.now();
    status.lastError = null;
    status.syncing = false;
    await setSyncMeta('last_sync_at', String(status.lastSyncAt));
    if (status.pendingCount === 0 && status.errorCount === 0) {
      log('[sync] ✅ outbox empty — all changes synced');
    }
    log(`[sync] ✅ cycle done pushed=${pushed} lastSyncAt=${status.lastSyncAt}`);
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
  log('[sync] engine started');

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
    log('[sync] engine stopped');
  };
}

/**
 * Reset in-memory sync state after a logout wipe (the outbox/entity_cache
 * rows are deleted by the caller). Pending counts go to zero and listeners
 * are notified so the header icon clears immediately.
 */
export async function resetSyncEngineForLogout(): Promise<void> {
  inFlightOutboxIds.clear();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  syncing = false;
  status.syncing = false;
  status.pendingCount = 0;
  status.errorCount = 0;
  status.lastSyncAt = null;
  status.lastError = null;
  await refreshPendingCount();
  publishStatus();
  log('[sync] engine reset for logout');
}

/** Keep the manual Offline Mode toggle in sync with the status snapshot. */
export function setEngineOfflineMode(enabled: boolean): void {
  offlineMode = enabled;
  status.offlineMode = enabled;
  status.effectiveOffline = enabled || connectivity === 'offline';
  publishStatus();
  if (!enabled) void runSyncNow();
}
