/**
 * Durable pending-op queue for textbook task state (web, SPEC-111).
 *
 * Text answers and attempts are written locally first and queued here, so a task
 * works offline and a failed request never loses an answer. The rules are the
 * ones ADR-0040 extracted from the SRS queue:
 *
 * - a flush never drops ops enqueued while it is in flight: after a successful
 *   push the queue is re-read and only the pushed entries are removed, so a
 *   newer op for the same entity survives;
 * - a 401 stops the flush (the session is mid-refresh); anything else keeps the
 *   queue and retries on the next trigger;
 * - ops are coalesced per entity, because a student types into one blank again
 *   and again and only its newest value matters.
 *
 * Keyed per user: one account's undrained ops must never be sent under another
 * account's token after a logout/login on the same browser.
 */

import { log, logwarn } from '@/lib/logger';

const QUEUE_PREFIX = 'lp:task-sync:';
const MAX_BATCH = 200;
const MAX_PASSES = 10;

export interface TaskSyncOp {
  entity: 'task_response' | 'task_attempt';
  entity_id: string;
  op: 'upsert';
  payload: Record<string, unknown>;
  /** Stable per op, so a replay of the same op is a no-op on the server. */
  idempotency_key: string;
  updated_at: number;
}

export function taskSyncQueueKey(userId: string): string {
  return `${QUEUE_PREFIX}${userId}`;
}

export function loadTaskSyncOps(userId: string): TaskSyncOp[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(taskSyncQueueKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed.filter(isOp) as TaskSyncOp[]) : [];
  } catch (err) {
    log('[LP Web] Task sync: could not read the queue', err);
    return [];
  }
}

export function saveTaskSyncOps(userId: string, ops: TaskSyncOp[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (ops.length === 0) {
      window.localStorage.removeItem(taskSyncQueueKey(userId));
      return;
    }
    window.localStorage.setItem(taskSyncQueueKey(userId), JSON.stringify(ops));
  } catch (err) {
    // A quota failure must not break the task; the op stays in memory and is
    // re-enqueued on the next save.
    logwarn('[LP Web] Task sync: could not persist the queue', err); // non-info-level: quota failure loses durability, needs a stack
  }
}

/** Coalesce by entity id: the newest op for an entity replaces an older one. */
export function enqueueTaskSyncOps(userId: string, incoming: TaskSyncOp[]): TaskSyncOp[] {
  if (incoming.length === 0) return loadTaskSyncOps(userId);
  const current = loadTaskSyncOps(userId);
  const byKey = new Map(current.map((op) => [opKey(op), op]));
  for (const op of incoming) byKey.set(opKey(op), op);
  const next = [...byKey.values()].sort((a, b) => a.updated_at - b.updated_at);
  saveTaskSyncOps(userId, next);
  return next;
}

export function clearTaskSyncOps(userId: string): void {
  saveTaskSyncOps(userId, []);
}

export type PushOutcome =
  | { ok: true }
  | { ok: false; status: number };

export type TaskSyncPush = (ops: TaskSyncOp[]) => Promise<PushOutcome>;

export type FlushResult = 'ok' | 'empty' | 'auth' | 'failed';

/**
 * Drain the queue. Serialised per module: two triggers (a write and a focus)
 * must not send the same batch twice; the server would drop the replay, but the
 * queue bookkeeping would race.
 */
export function flushTaskSyncOps(userId: string, push: TaskSyncPush): Promise<FlushResult> {
  const previous = flushChain.get(userId) ?? Promise.resolve<FlushResult>('empty');
  const next = previous.then(() => flushOnce(userId, push));
  flushChain.set(userId, next);
  return next.finally(() => {
    if (flushChain.get(userId) === next) flushChain.delete(userId);
  });
}

const flushChain = new Map<string, Promise<FlushResult>>();

async function flushOnce(userId: string, push: TaskSyncPush): Promise<FlushResult> {
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const snapshot = loadTaskSyncOps(userId);
    if (snapshot.length === 0) return pass === 0 ? 'empty' : 'ok';
    const batch = snapshot.slice(0, MAX_BATCH);
    const outcome = await push(batch);
    if (!outcome.ok) {
      if (outcome.status === 401) return 'auth';
      log('[LP Web] Task sync: push failed with', outcome.status);
      return 'failed';
    }
    // Remove only what was pushed. Re-reading first keeps an op that was
    // replaced (same entity, newer timestamp) while the request was in flight.
    const now = loadTaskSyncOps(userId);
    const pushed = new Set(batch.map(opKey));
    const remaining = now.filter((op) => {
      if (!pushed.has(opKey(op))) return true;
      const original = batch.find((b) => opKey(b) === opKey(op));
      // A different idempotency key means the op was replaced; keep the newer one.
      return original ? op.idempotency_key !== original.idempotency_key : true;
    });
    saveTaskSyncOps(userId, remaining);
  }
  return 'ok';
}

function opKey(op: TaskSyncOp): string {
  return `${op.entity}\u0000${op.entity_id}`;
}

function isOp(value: unknown): value is TaskSyncOp {
  if (!value || typeof value !== 'object') return false;
  const op = value as Partial<TaskSyncOp>;
  return (
    (op.entity === 'task_response' || op.entity === 'task_attempt') &&
    typeof op.entity_id === 'string' &&
    op.op === 'upsert' &&
    typeof op.payload === 'object' &&
    typeof op.idempotency_key === 'string' &&
    typeof op.updated_at === 'number'
  );
}

let opSeq = 0;

/** A client-side idempotency key: unique per enqueue, stable once queued. */
export function newIdempotencyKey(prefix: string): string {
  opSeq += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${opSeq}-${random}`;
}
