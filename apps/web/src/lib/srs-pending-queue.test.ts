// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enqueuePendingSrsOp,
  flushAllPendingSrsOps,
  loadPendingSrsOps,
  savePendingSrsOps,
  type PendingSrsOp,
  type SrsRowApi,
} from '@/lib/srs-pending-queue';
import type { SrsFields } from '@langplayer/shared';

function mkOp(
  type: 'upsert' | 'delete',
  wordId: string,
  updatedAt: number,
  reps = 1,
): PendingSrsOp {
  return {
    type,
    l2: 'ja',
    wordId,
    updatedAt,
    ...(type === 'upsert'
      ? { state: { v: 2, state: 1, due: updatedAt, reps } as unknown as SrsFields }
      : {}),
  };
}

const noopDelete: SrsRowApi['deleteSrsCard'] = async () => ({});

describe('srs-pending-queue (ADR-0040)', () => {
  beforeEach(() => {
    localStorage.clear();
    savePendingSrsOps([]);
  });

  it('flushes ops enqueued while a flush is in flight (no clobber)', async () => {
    const sent: string[] = [];
    const api: SrsRowApi = {
      putSrsCard: async (_l2, wordId) => {
        sent.push(wordId);
        await new Promise((r) => setTimeout(r, 20)); // keep the PUT in flight
      },
      deleteSrsCard: noopDelete,
    };

    // Synchronous burst — the review-page deck auto-init pattern: the first
    // flush starts while the rest of the ops are still being enqueued.
    const flushes: Array<Promise<void>> = [];
    for (let i = 1; i <= 5; i++) {
      savePendingSrsOps(enqueuePendingSrsOp(loadPendingSrsOps(), mkOp('upsert', `w${i}`, i)));
      flushes.push(flushAllPendingSrsOps(api));
    }
    await Promise.all(flushes);

    expect(sent.sort()).toEqual(['w1', 'w2', 'w3', 'w4', 'w5']);
    expect(loadPendingSrsOps()).toEqual([]);
  });

  it('flushes a newer op for a card updated mid-flush (undo → re-rate)', async () => {
    const sentReps: number[] = [];
    const api: SrsRowApi = {
      putSrsCard: async (_l2, _wordId, state) => {
        sentReps.push((state as { reps?: number }).reps ?? 0);
        await new Promise((r) => setTimeout(r, 10));
      },
      deleteSrsCard: noopDelete,
    };

    const first = mkOp('upsert', 'w1', 1, 1);
    savePendingSrsOps([first]);

    const flush = flushAllPendingSrsOps(api);
    // While the first PUT is in flight, the same card gets a newer op.
    savePendingSrsOps([mkOp('upsert', 'w1', 2, 2)]);
    await flush;

    expect(sentReps).toEqual([1, 2]); // both versions sent; newest last
    expect(loadPendingSrsOps()).toEqual([]);
  });

  it('drops a 403-capped op, dispatches the event, and keeps flushing the rest', async () => {
    const sent: string[] = [];
    const listener = vi.fn();
    window.addEventListener('lp:srs-cap-reached', listener);
    const api: SrsRowApi = {
      putSrsCard: async (_l2, wordId) => {
        sent.push(wordId);
        if (wordId === 'w1') throw { code: '403' }; // normalized ApiError
      },
      deleteSrsCard: noopDelete,
    };

    savePendingSrsOps([mkOp('upsert', 'w1', 1), mkOp('upsert', 'w2', 2)]);
    await flushAllPendingSrsOps(api);

    expect(sent).toEqual(['w1', 'w2']); // w2 not blocked behind the 403
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loadPendingSrsOps()).toEqual([]); // dropped, not retried forever
    window.removeEventListener('lp:srs-cap-reached', listener);
  });

  it('re-queues ops after a transient failure and retries on the timer', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const api: SrsRowApi = {
        putSrsCard: async () => {
          calls++;
          throw { code: 'NETWORK_ERROR' };
        },
        deleteSrsCard: noopDelete,
      };
      savePendingSrsOps([mkOp('upsert', 'w1', 1)]);

      await flushAllPendingSrsOps(api);
      expect(calls).toBe(1);
      expect(loadPendingSrsOps()).toHaveLength(1); // still queued, nothing lost

      await vi.advanceTimersByTimeAsync(10_000);
      expect(calls).toBe(2); // retry timer fired
    } finally {
      vi.useRealTimers();
    }
    savePendingSrsOps([]);
  });

  it('passes the op timestamp to deleteSrsCard for the stale-delete guard', async () => {
    const deletes: Array<[string, string, number | undefined]> = [];
    const api: SrsRowApi = {
      putSrsCard: async () => ({}),
      deleteSrsCard: async (l2, wordId, updatedAt) => {
        deletes.push([l2, wordId, updatedAt]);
      },
    };
    savePendingSrsOps([mkOp('delete', 'w1', 123)]);
    await flushAllPendingSrsOps(api);
    expect(deletes).toEqual([['ja', 'w1', 123]]);
  });

  it('bounds a large delete backlog to a batch per flush and drains the rest on retry', async () => {
    const sent: string[] = [];
    const api: SrsRowApi = {
      putSrsCard: async () => ({}),
      deleteSrsCard: async (_l2, wordId) => {
        sent.push(wordId);
      },
    };
    // 30 deletes > MAX_FLUSH_BATCH (25): a stale orphan backlog must not be
    // fired as one unbounded sequential stream on a single load.
    const ops = Array.from({ length: 30 }, (_, i) => mkOp('delete', `d${i}`, i + 1));
    savePendingSrsOps(ops);
    await flushAllPendingSrsOps(api);

    expect(sent).toHaveLength(25); // first batch only this pass
    expect(sent[0]).toBe('d0');
    expect(sent[24]).toBe('d24');
    expect(loadPendingSrsOps()).toHaveLength(5); // the rest queued for retry

    // The retry timer re-runs the flush, draining the next batch.
    await flushAllPendingSrsOps(api);
    expect(sent).toHaveLength(30);
    expect(loadPendingSrsOps()).toEqual([]);
    savePendingSrsOps([]);
  });

  it('sends ALL deletes in one bulk request when the endpoint is available', async () => {
    const batchCalls: Array<Array<{ l2: string; wordId: string; updatedAt?: number }>> = [];
    const perOpDeletes: string[] = [];
    const api: SrsRowApi = {
      putSrsCard: async () => ({}),
      deleteSrsCard: async (_l2, wordId) => { perOpDeletes.push(wordId); },
      deleteSrsCardsBatch: async (items) => { batchCalls.push(items); },
    };
    const ids = Array.from({ length: 30 }, (_, i) => `d${i}`);
    savePendingSrsOps(ids.map((id, i) => mkOp('delete', id, i + 1)));
    await flushAllPendingSrsOps(api);

    // A 30-orphan backlog drains in ONE request, not 30 per-card DELETEs.
    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]!.map((o) => o.wordId).sort()).toEqual(ids.sort());
    expect(perOpDeletes).toEqual([]);
    expect(loadPendingSrsOps()).toEqual([]);
    savePendingSrsOps([]);
  });

  it('falls back to per-op deletes and still flushes upserts when the batch endpoint is missing', async () => {
    const perOpDeletes: string[] = [];
    const upserts: string[] = [];
    let batchCalled = false;
    const api: SrsRowApi = {
      putSrsCard: async (_l2, wordId) => { upserts.push(wordId); },
      deleteSrsCard: async (_l2, wordId) => { perOpDeletes.push(wordId); },
      deleteSrsCardsBatch: async () => {
        batchCalled = true;
        throw { response: { status: 404 } }; // endpoint not yet deployed
      },
    };
    savePendingSrsOps([mkOp('delete', 'd1', 1), mkOp('upsert', 'u1', 2, 1)]);
    await flushAllPendingSrsOps(api);

    // The batch was attempted, then fell back to per-op — and upserts still flow.
    expect(batchCalled).toBe(true);
    expect(perOpDeletes).toEqual(['d1']);
    expect(upserts).toEqual(['u1']);
    expect(loadPendingSrsOps()).toEqual([]);
    savePendingSrsOps([]);
  });
});
