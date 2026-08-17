/**
 * Durable pending-op queue for SRS card writes (web).
 *
 * Every SRS upsert/delete goes through this outbox before hitting the row API
 * (`PUT/DELETE /srs/cards`). Ops live in localStorage
 * (`zthSrsProgressPendingOps`) so writes survive reloads, are replayed before
 * SRS hydration, and retried after transient failures.
 *
 * Hardening (ADR-0040):
 * - Flushes never drop ops enqueued while a flush is in flight. The old
 *   snapshot-and-overwrite implementation erased them, so in a synchronous
 *   burst (the review page's deck auto-init loop, rapid ratings/unsaves) only
 *   the first op reached the server. Each pass now re-reads the queue and
 *   merges back anything that was added mid-flight (new keys or a newer
 *   `updatedAt` for an existing key).
 * - A 403 free-cap rejection is final for that op: the server will keep
 *   rejecting it all day, so it is dropped (the rating stays local-only and
 *   the `lp:srs-cap-reached` event still fires) instead of blocking the rest
 *   of the queue behind an infinite 10s retry.
 * - Delete ops carry their client timestamp so the server can drop stale
 *   deletes that would destroy newer writes from another device.
 * - A localStorage quota failure keeps the queue in memory for the rest of
 *   the session (with a warning) instead of silently losing ops.
 */

import type { SrsFields } from '@langplayer/shared';
import type { SrsCardMeta } from '@langplayer/api-client';
import { logwarn } from '@/lib/logger';

const SRS_PENDING_OPS_KEY = 'zthSrsProgressPendingOps';
const RETRY_DELAY_MS = 10_000;
/** Upper bound on consecutive flush passes; a pathological burst falls back
 *  to the retry timer instead of hot-looping. */
const MAX_FLUSH_PASSES = 10;

export interface PendingSrsOp {
  type: 'upsert' | 'delete';
  l2: string;
  wordId: string;
  state?: SrsFields;
  updatedAt: number;
  timezone?: string;
  dayStartHour?: number;
}

export interface SrsRowApi {
  putSrsCard: (
    l2: string,
    wordId: string,
    state: SrsFields,
    meta?: SrsCardMeta,
  ) => Promise<unknown>;
  deleteSrsCard: (l2: string, wordId: string, updatedAt?: number) => Promise<unknown>;
}

let srsFlushInFlight: Promise<void> | null = null;
let srsRetryTimer: ReturnType<typeof setTimeout> | null = null;
/** Queue copy kept when localStorage is over quota — session-only fallback. */
let pendingOpsMemoryFallback: PendingSrsOp[] | null = null;

export function pendingSrsOpKey(op: PendingSrsOp): string {
  return `${op.l2}\u0000${op.wordId}`;
}

export function loadPendingSrsOps(): PendingSrsOp[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SRS_PENDING_OPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (op): op is PendingSrsOp =>
            !!op && (op.type === 'upsert' || op.type === 'delete')
            && typeof op.l2 === 'string' && typeof op.wordId === 'string',
        );
      }
    }
  } catch { /* corrupted queue — fall through to the memory fallback */ }
  return pendingOpsMemoryFallback ? [...pendingOpsMemoryFallback] : [];
}

export function savePendingSrsOps(ops: PendingSrsOp[]): void {
  try {
    localStorage.setItem(SRS_PENDING_OPS_KEY, JSON.stringify(ops));
    pendingOpsMemoryFallback = null;
  } catch {
    // Quota exceeded — keep the queue in memory so the current session can
    // still flush it; it will be lost on reload (accepted, ADR-0040).
    logwarn('[SRS] pending-op queue exceeded localStorage quota — keeping in memory only');
    pendingOpsMemoryFallback = ops;
  }
}

export function enqueuePendingSrsOp(queue: PendingSrsOp[], op: PendingSrsOp): PendingSrsOp[] {
  const key = pendingSrsOpKey(op);
  return [...queue.filter((q) => pendingSrsOpKey(q) !== key), op];
}

export function reducePendingSrsOps(queue: PendingSrsOp[]): PendingSrsOp[] {
  const latest = new Map<string, PendingSrsOp>();
  for (const op of queue) latest.set(pendingSrsOpKey(op), op);
  return [...latest.values()].sort((a, b) => a.updatedAt - b.updatedAt);
}

async function flushPendingSrsOps(
  queue: PendingSrsOp[],
  api: SrsRowApi,
): Promise<PendingSrsOp[]> {
  const ops = reducePendingSrsOps(queue);
  const remaining: PendingSrsOp[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    try {
      if (op.type === 'upsert' && op.state) {
        const hasMeta = !!op.timezone || typeof op.dayStartHour === 'number';
        if (hasMeta) {
          await api.putSrsCard(op.l2, op.wordId, op.state, {
            timezone: op.timezone,
            dayStartHour: op.dayStartHour,
          });
        } else {
          await api.putSrsCard(op.l2, op.wordId, op.state);
        }
      } else {
        await api.deleteSrsCard(op.l2, op.wordId, op.updatedAt);
      }
    } catch (err) {
      // api-client normalizes errors to ApiError { code: '403', ... }; raw
      // axios errors surface as err.response.status.
      const status =
        (err as { response?: { status?: number } })?.response?.status
        ?? (Number((err as { code?: string })?.code) || undefined);
      if (status === 403) {
        // Free-cap rejection: final for this op. Drop it (the rating stays
        // local-only) and keep flushing the rest of the queue — retrying a
        // capped op all day would block every other write behind it.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('lp:srs-cap-reached'));
        }
        continue;
      }
      remaining.push(...ops.slice(i));
      break;
    }
  }
  return remaining;
}

function scheduleRetry(api: SrsRowApi): void {
  if (srsRetryTimer) return;
  srsRetryTimer = setTimeout(() => {
    srsRetryTimer = null;
    void flushAllPendingSrsOps(api);
  }, RETRY_DELAY_MS);
}

/** Serialize flushes so concurrent callers share one attempt and ops enqueued
 *  mid-flight are never lost. */
export async function flushAllPendingSrsOps(api: SrsRowApi): Promise<void> {
  if (srsFlushInFlight) return srsFlushInFlight;
  const run = (async () => {
    for (let pass = 0; pass < MAX_FLUSH_PASSES; pass++) {
      const ops = loadPendingSrsOps();
      if (ops.length === 0) return;
      const remaining = await flushPendingSrsOps(ops, api);
      // Re-read the queue: ops added while this flush was running were not in
      // the snapshot and must survive. The old implementation overwrote the
      // queue with `remaining` and silently dropped them (ADR-0040).
      const snapshotByKey = new Map(ops.map((op) => [pendingSrsOpKey(op), op]));
      const added = loadPendingSrsOps().filter((op) => {
        const snap = snapshotByKey.get(pendingSrsOpKey(op));
        return !snap || op.updatedAt > snap.updatedAt;
      });
      const next = reducePendingSrsOps([...remaining, ...added]);
      savePendingSrsOps(next);
      if (next.length === 0) return;
      if (added.length === 0) {
        // Only failures left — the failure is persistent for now; let the
        // retry timer try again instead of hot-looping here.
        scheduleRetry(api);
        return;
      }
      // New ops arrived mid-flush: run another pass so they are flushed too.
    }
    scheduleRetry(api); // pass cap hit — retry instead of looping forever
  })();
  srsFlushInFlight = run;
  try {
    await run;
  } finally {
    srsFlushInFlight = null;
  }
}
