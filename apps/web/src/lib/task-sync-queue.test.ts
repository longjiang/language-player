// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTaskSyncOps,
  enqueueTaskSyncOps,
  flushTaskSyncOps,
  loadTaskSyncOps,
  newIdempotencyKey,
  taskSyncQueueKey,
  type TaskSyncOp,
} from './task-sync-queue';

const USER = 'user-1';
const OTHER = 'user-2';

const op = (blankId: string, value: string, at: number): TaskSyncOp => ({
  entity: 'task_response',
  entity_id: `task#${blankId}`,
  op: 'upsert',
  payload: { taskId: 'task', blankId, contentVersion: 1, value, updatedAt: at },
  idempotency_key: newIdempotencyKey('task_response'),
  updated_at: at,
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('queue storage', () => {
  it('keeps one op per entity, newest wins', () => {
    enqueueTaskSyncOps(USER, [op('b1', 'a', 1)]);
    enqueueTaskSyncOps(USER, [op('b1', 'b', 2)]);
    const queue = loadTaskSyncOps(USER);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.payload.value).toBe('b');
  });

  it('keeps two different blanks apart', () => {
    enqueueTaskSyncOps(USER, [op('b1', 'a', 1), op('b2', 'b', 2)]);
    expect(loadTaskSyncOps(USER)).toHaveLength(2);
  });

  it('is per user, so one account never sends another account’s ops', () => {
    enqueueTaskSyncOps(USER, [op('b1', 'a', 1)]);
    expect(taskSyncQueueKey(USER)).not.toBe(taskSyncQueueKey(OTHER));
    expect(loadTaskSyncOps(OTHER)).toHaveLength(0);
  });

  it('ignores a corrupt queue instead of throwing', () => {
    window.localStorage.setItem(taskSyncQueueKey(USER), '{not json');
    expect(loadTaskSyncOps(USER)).toEqual([]);
  });
});

describe('flushTaskSyncOps', () => {
  it('pushes the queue and clears it', async () => {
    enqueueTaskSyncOps(USER, [op('b1', 'a', 1), op('b2', 'b', 2)]);
    const push = vi.fn(async (_ops: TaskSyncOp[]) => ({ ok: true as const }));
    expect(await flushTaskSyncOps(USER, push)).toBe('ok');
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![0]).toHaveLength(2);
    expect(loadTaskSyncOps(USER)).toHaveLength(0);
  });

  it('is a no-op when empty', async () => {
    const push = vi.fn(async (_ops: TaskSyncOp[]) => ({ ok: true as const }));
    expect(await flushTaskSyncOps(USER, push)).toBe('empty');
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps an op that replaced a pushed one while the request was in flight', async () => {
    enqueueTaskSyncOps(USER, [op('b1', 'old', 1)]);
    const push = vi.fn(async (_ops: TaskSyncOp[]) => {
      // The student keeps typing before the response lands.
      enqueueTaskSyncOps(USER, [op('b1', 'new', 5)]);
      return { ok: true as const };
    });
    await flushTaskSyncOps(USER, push);
    const queue = loadTaskSyncOps(USER);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.payload.value).toBe('new');
  });

  it('keeps the queue and reports auth on 401 (session mid-refresh)', async () => {
    enqueueTaskSyncOps(USER, [op('b1', 'a', 1)]);
    const push = vi.fn(async (_ops: TaskSyncOp[]) => ({ ok: false as const, status: 401 }));
    expect(await flushTaskSyncOps(USER, push)).toBe('auth');
    expect(loadTaskSyncOps(USER)).toHaveLength(1);
  });

  it('keeps the queue and reports failure on 500', async () => {
    enqueueTaskSyncOps(USER, [op('b1', 'a', 1)]);
    const push = vi.fn(async (_ops: TaskSyncOp[]) => ({ ok: false as const, status: 500 }));
    expect(await flushTaskSyncOps(USER, push)).toBe('failed');
    expect(loadTaskSyncOps(USER)).toHaveLength(1);
  });

  it('batches at 200 ops', async () => {
    const ops = Array.from({ length: 250 }, (_, i) => op(`b${i}`, 'x', i));
    enqueueTaskSyncOps(USER, ops);
    const sizes: number[] = [];
    const push = vi.fn(async (batch: TaskSyncOp[]) => {
      sizes.push(batch.length);
      return { ok: true as const };
    });
    await flushTaskSyncOps(USER, push);
    expect(sizes[0]).toBe(200);
    expect(loadTaskSyncOps(USER)).toHaveLength(0);
  });

  it('clears a user’s queue explicitly (logout wipe)', () => {
    enqueueTaskSyncOps(USER, [op('b1', 'a', 1)]);
    clearTaskSyncOps(USER);
    expect(loadTaskSyncOps(USER)).toHaveLength(0);
  });
});
