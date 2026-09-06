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
import { log, logwarn } from '@/lib/logger';

const SRS_PENDING_OPS_KEY = 'zthSrsProgressPendingOps';
const RETRY_DELAY_MS = 10_000;
/** Upper bound on consecutive flush passes; a pathological burst falls back
 *  to the retry timer instead of hot-looping. */
const MAX_FLUSH_PASSES = 10;
/** Cap on how many pending ops one flush drains per pass. A large stale
 *  orphan/delete backlog (cards whose words were unsaved across many
 *  sessions/languages) would otherwise be flushed one-request-per-card,
 *  firing hundreds of sequential DELETE /srs/cards on a single page load and
 *  freezing the review page on a slow dev server. Bounded batches drain the
 *  backlog incrementally via the 10s retry instead. */
const MAX_FLUSH_BATCH = 25;
/** Delete ops per bulk-delete request, kept under the server's batch cap. */
const MAX_BATCH_DELETE = 500;

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
  /** Optional bulk delete — used to drain a large stale orphan backlog in ONE
   *  request instead of N sequential DELETEs. When absent, per-op deletes are
   *  used. */
  deleteSrsCardsBatch?: (items: { l2: string; wordId: string; updatedAt?: number }[]) => Promise<unknown>;
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
  const deleteOps = ops.filter((o) => o.type === 'delete');
  const upsertOps = ops.filter((o) => o.type === 'upsert');

  // ── Deletes: drain in a single batch request when the endpoint is available.
  // A large stale orphan backlog (cards whose words were unsaved across many
  // sessions/languages) must not fire one DELETE per card — each with a CORS
  // preflight that freezes a slow dev server. Chunked into a few requests so
  // a pathological backlog stays under the server's batch cap. ──
  if (deleteOps.length > 0) {
    if (api.deleteSrsCardsBatch) {
      for (let i = 0; i < deleteOps.length; i += MAX_BATCH_DELETE) {
        const group = deleteOps.slice(i, i + MAX_BATCH_DELETE);
        try {
          await api.deleteSrsCardsBatch(
            group.map((o) => ({ l2: o.l2, wordId: o.wordId, updatedAt: o.updatedAt })),
          );
        } catch (err) {
          const status =
            (err as { response?: { status?: number } })?.response?.status
            ?? (Number((err as { code?: string })?.code) || undefined);
          if (status !== 403) {
            // Batch failed (network/5xx): keep EVERYTHING queued and stop this
            // pass — a partial flush risks dropping ops.
            remaining.push(...ops);
            return remaining;
          }
          // 403 on a bulk delete is unexpected; the deletes are dropped to
          // avoid a cap loop, and the upserts are still attempted below.
        }
      }
    } else {
      // No bulk endpoint (older server): per-op delete, bounded by the batch
      // cap so a huge backlog can't fire an unbounded sequential stream.
      for (const op of deleteOps.slice(0, MAX_FLUSH_BATCH)) {
        try {
          await api.deleteSrsCard(op.l2, op.wordId, op.updatedAt);
        } catch (err) {
          const status =
            (err as { response?: { status?: number } })?.response?.status
            ?? (Number((err as { code?: string })?.code) || undefined);
          if (status === 403) continue;
          // Failed: hold this delete + the tail (order semantics).
          const idx = ops.indexOf(op);
          remaining.push(...ops.slice(idx));
          return remaining;
        }
      }
      // Hold deletes beyond the per-op batch for the next pass/retry.
      if (deleteOps.length > MAX_FLUSH_BATCH) {
        const held = deleteOps.slice(MAX_FLUSH_BATCH);
        const heldUpserts = upsertOps.filter((o) => !remaining.includes(o));
        remaining.push(...held, ...heldUpserts);
        return remaining;
      }
    }
  }

  // ── Upserts: per-op (they carry full state payloads). ──
  for (let i = 0; i < upsertOps.length; i++) {
    const op = upsertOps[i]!;
    try {
      const hasMeta = !!op.timezone || typeof op.dayStartHour === 'number';
      if (hasMeta) {
        await api.putSrsCard(op.l2, op.wordId, op.state!, {
          timezone: op.timezone,
          dayStartHour: op.dayStartHour,
        });
      } else {
        await api.putSrsCard(op.l2, op.wordId, op.state!);
      }
    } catch (err) {
      const status =
        (err as { response?: { status?: number } })?.response?.status
        ?? (Number((err as { code?: string })?.code) || undefined);
      if (status === 403) {
        // Free-cap rejection: final for this op. Drop it (the rating stays
        // local-only) and keep flushing the rest — retrying a capped op all
        // day would block every other write behind it.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('lp:srs-cap-reached'));
        }
        continue;
      }
      // Failed: hold this upsert + the tail (order semantics).
      remaining.push(...upsertOps.slice(i));
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
      const deletes = ops.filter((o) => o.type === 'delete').length;
      const deleteWords = ops.filter((o) => o.type === 'delete').map((o) => o.wordId);
      log('[SRS] pending flush pass=%d ops=%d deletes=%d words(first 12)=%s',
        pass, ops.length, deletes,
        deleteWords.slice(0, 12).join(',') + (deleteWords.length > 12 ? ` (+${deleteWords.length - 12} more)` : ''));
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
