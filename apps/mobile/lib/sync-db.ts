/**
 * SPEC-053 Phase 2 — local sync database.
 *
 * One SQLite database (`sync.db`) for all syncable user data:
 *   entity_cache — local source of truth for rendering (with tombstones)
 *   outbox       — durable mutation queue (one row per queued operation)
 *   sync_meta    — per-user sync position (pull cursor, last sync time)
 *
 * expo-sqlite is already used by the dictionary/tokenizer layers, so no new
 * native dependency is introduced.
 */

import * as SQLite from 'expo-sqlite';
import { canCoalesceOps, coalesceSyncPayload, validateSyncPayload } from '@langplayer/utils';
import { log } from '@/lib/logger';

const DB_NAME = 'sync.db';

export type OutboxOp = 'upsert' | 'delete';
export type OutboxStatus = 'pending' | 'error';

export interface EntityCacheRow {
  entity: string;
  entity_id: string;
  payload: string;
  updated_at: number;
  deleted_at: number | null;
}

export interface OutboxRow {
  id: string;
  entity: string;
  entity_id: string;
  op: OutboxOp;
  payload: string;
  idempotency_key: string;
  created_at: number;
  updated_at: number;
  attempts: number;
  last_error: string | null;
  status: OutboxStatus;
}

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let enqueueChain: Promise<void> = Promise.resolve();

/** Stable random id (Hermes-safe; crypto.randomUUID is not guaranteed). */
export function makeSyncId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function openSyncDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (_dbPromise) return _dbPromise;

  _dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync('PRAGMA journal_mode=WAL');
    await db.execAsync('PRAGMA synchronous=NORMAL');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS entity_cache (
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        PRIMARY KEY (entity, entity_id)
      );

      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        op TEXT NOT NULL,
        payload TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_status_created
        ON outbox (status, created_at);

      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    _db = db;
    return db;
  })();
  return _dbPromise;
}

export async function getEntityCache(
  entity: string,
): Promise<EntityCacheRow[]> {
  const db = await openSyncDB();
  return db.getAllAsync<EntityCacheRow>(
    'SELECT entity, entity_id, payload, updated_at, deleted_at FROM entity_cache WHERE entity = ?',
    [entity],
  );
}

export async function getEntityCacheRow(
  entity: string,
  entityId: string,
): Promise<EntityCacheRow | null> {
  const db = await openSyncDB();
  return db.getFirstAsync<EntityCacheRow>(
    'SELECT entity, entity_id, payload, updated_at, deleted_at FROM entity_cache WHERE entity = ? AND entity_id = ?',
    [entity, entityId],
  );
}

export async function upsertEntityCache(
  entity: string,
  entityId: string,
  payload: string,
  updatedAt: number,
  deletedAt: number | null = null,
): Promise<void> {
  const db = await openSyncDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO entity_cache (entity, entity_id, payload, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?)`,
    [entity, entityId, payload, updatedAt, deletedAt],
  );
}

export async function setEntityCacheDeleted(
  entity: string,
  entityId: string,
  updatedAt: number,
): Promise<void> {
  const db = await openSyncDB();
  await db.runAsync(
    `UPDATE entity_cache SET deleted_at = ?, updated_at = ? WHERE entity = ? AND entity_id = ?`,
    [updatedAt, updatedAt, entity, entityId],
  );
}

/**
 * Insert or coalesce one outbox row + mirror it into entity_cache (same tx).
 *
 * expo-sqlite's withTransactionAsync is BEGIN/COMMIT under the hood, so
 * concurrent enqueues (e.g. rapid note autosave + rename) can collide with
 * "cannot start a transaction within a transaction". All enqueues are
 * serialized through a promise chain to keep one transaction at a time.
 */
export function enqueueOutboxOp(input: {
  entity: string;
  entityId: string;
  op: OutboxOp;
  payload: Record<string, unknown>;
  updatedAt: number;
  /** Rows currently in an in-flight push batch — never coalesce into these. */
  skipCoalesceIds?: Set<string>;
}): Promise<void> {
  const run = async () => {
    const db = await openSyncDB();
    const { entity, entityId, op, payload, updatedAt, skipCoalesceIds } = input;
    // Whole-row contract: upsert payloads must match the entity schema.
    // (Delete payloads are intentionally minimal and skip validation.)
    if (op === 'upsert') {
      validateSyncPayload(entity, payload);
    }
    const payloadJson = JSON.stringify(payload);

    await db.withTransactionAsync(async () => {
      const existing = await db.getFirstAsync<OutboxRow>(
        `SELECT id, entity, entity_id, op, payload, idempotency_key, created_at,
                updated_at, attempts, last_error, status
         FROM outbox WHERE entity = ? AND entity_id = ? AND status IN ('pending', 'error')`,
        [entity, entityId],
      );
      // A row currently in an in-flight push batch must not be coalesced:
      // the snapshot is already on the wire, and mutating it would let a
      // stale ack delete the newer edit. Insert a fresh row instead.
      const inFlight = !!(existing && skipCoalesceIds?.has(existing.id));

      if (existing && !inFlight) {
        // Same op type → coalesce in place, keeping the idempotency key so an
        // already-applied server op is never replayed. Different op type →
        // fresh key (the server may have already applied the old op).
        const keyChanged = !canCoalesceOps(existing.op, op);
        log(`[sync-db] outbox coalesce ${entity}:${entityId} ${existing.op}→${op} keyChanged=${keyChanged}`);
        // Domain-owned composition: the entity decides merge vs. replace.
        let mergedPayloadJson = payloadJson;
        if (!keyChanged) {
          try {
            const existingPayload = JSON.parse(existing.payload) as Record<string, unknown>;
            mergedPayloadJson = JSON.stringify(
              coalesceSyncPayload(entity, existingPayload, payload),
            );
          } catch {
            // Corrupt existing payload — fall back to the new one.
          }
        }
        await db.runAsync(
          `UPDATE outbox
           SET op = ?, payload = ?, updated_at = ?, attempts = 0, last_error = NULL,
               status = 'pending', idempotency_key = ?
           WHERE id = ?`,
          [
            op,
            mergedPayloadJson,
            updatedAt,
            keyChanged ? makeSyncId() : existing.idempotency_key,
            existing.id,
          ],
        );
        await db.runAsync(
          `UPDATE entity_cache SET payload = ?, updated_at = ?, deleted_at = ?
           WHERE entity = ? AND entity_id = ?`,
          [mergedPayloadJson, updatedAt, op === 'delete' ? updatedAt : null, entity, entityId],
        );
      } else {
        log(`[sync-db] outbox insert ${entity}:${entityId} ${op}`);
        await db.runAsync(
          `INSERT INTO outbox (id, entity, entity_id, op, payload, idempotency_key,
                               created_at, updated_at, attempts, last_error, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'pending')`,
          [makeSyncId(), entity, entityId, op, payloadJson, makeSyncId(), Date.now(), updatedAt],
        );
      }

      if (!existing || inFlight) {
        await db.runAsync(
          `INSERT OR REPLACE INTO entity_cache (entity, entity_id, payload, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?)`,
          [entity, entityId, payloadJson, updatedAt, op === 'delete' ? updatedAt : null],
        );
      }
    });
    log(`[sync-db] entity_cache updated ${entity}:${entityId} ${op} @${updatedAt}`);
  };

  const next = enqueueChain.then(run, run);
  enqueueChain = next.catch(() => {});
  return next;
}

export async function listOutbox(): Promise<OutboxRow[]> {
  const db = await openSyncDB();
  return db.getAllAsync<OutboxRow>(
    `SELECT id, entity, entity_id, op, payload, idempotency_key, created_at,
            updated_at, attempts, last_error, status
     FROM outbox ORDER BY status = 'error', created_at ASC`,
  );
}

export async function listPendingOutbox(): Promise<OutboxRow[]> {
  const db = await openSyncDB();
  return db.getAllAsync<OutboxRow>(
    `SELECT id, entity, entity_id, op, payload, idempotency_key, created_at,
            updated_at, attempts, last_error, status
     FROM outbox WHERE status = 'pending' ORDER BY created_at ASC`,
  );
}

export async function markOutboxError(
  id: string,
  error: string,
  attempts: number,
  status: OutboxStatus,
): Promise<void> {
  const db = await openSyncDB();
  await db.runAsync(
    `UPDATE outbox SET attempts = ?, last_error = ?, status = ? WHERE id = ?`,
    [attempts, error, status, id],
  );
  log(`[sync-db] outbox error ${id} attempts=${attempts} status=${status} err=${error}`);
}

export async function resetOutboxErrors(): Promise<number> {
  const db = await openSyncDB();
  const result = await db.runAsync(
    `UPDATE outbox SET status = 'pending', attempts = 0, last_error = NULL
     WHERE status = 'error'`,
  );
  return result.changes;
}

export async function deleteOutboxRows(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openSyncDB();
  const placeholders = ids.map(() => '?').join(', ');
  const result = await db.runAsync(`DELETE FROM outbox WHERE id IN (${placeholders})`, ids);
  log(`[sync-db] outbox ack-delete rows=${result.changes}`);
}

/**
 * Ack-delete ONLY rows whose idempotency key + updated_at still match what
 * was actually sent. If the row was coalesced/edited after the push snapshot
 * (or a stale ack arrives for a replaced row), the delete is skipped so the
 * newer op survives and is pushed in the next cycle.
 */
export async function deleteOutboxRowsIfUnchanged(
  entries: Array<{ id: string; idempotencyKey: string; updatedAt: number }>,
): Promise<number> {
  if (entries.length === 0) return 0;
  const db = await openSyncDB();
  let deleted = 0;
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      const result = await db.runAsync(
        `DELETE FROM outbox WHERE id = ? AND idempotency_key = ? AND updated_at = ?`,
        [entry.id, entry.idempotencyKey, entry.updatedAt],
      );
      deleted += result.changes;
    }
  });
  if (deleted !== entries.length) {
    log(`[sync-db] outbox ack-delete skipped ${entries.length - deleted} row(s) — changed mid-flight`);
  } else {
    log(`[sync-db] outbox ack-delete rows=${deleted}`);
  }
  return deleted;
}

export async function getPendingOutboxCount(): Promise<number> {
  const db = await openSyncDB();
  const row = await db.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM outbox WHERE status = 'pending'",
  );
  return row?.cnt ?? 0;
}

export async function getOutboxStats(): Promise<{
  pending: number;
  error: number;
}> {
  const db = await openSyncDB();
  const rows = await db.getAllAsync<{ status: string; cnt: number }>(
    'SELECT status, COUNT(*) AS cnt FROM outbox GROUP BY status',
  );
  return {
    pending: rows.find((r) => r.status === 'pending')?.cnt ?? 0,
    error: rows.find((r) => r.status === 'error')?.cnt ?? 0,
  };
}

export async function getSyncMeta(key: string): Promise<string | null> {
  const db = await openSyncDB();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  const db = await openSyncDB();
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
    [key, value],
  );
}
