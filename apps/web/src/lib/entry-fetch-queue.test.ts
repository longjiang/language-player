import { describe, it, expect, beforeEach } from 'vitest';
import {
  ENTRY_FETCH_MAX_CONCURRENCY,
  getEntryFetchQueueStats,
  resetEntryFetchQueueForTests,
  withEntryFetchSlot,
} from './entry-fetch-queue';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe('withEntryFetchSlot', () => {
  beforeEach(() => resetEntryFetchQueueForTests());

  it('never runs more than the concurrency cap at once', async () => {
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: ENTRY_FETCH_MAX_CONCURRENCY * 4 }, (_, i) =>
      withEntryFetchSlot(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await tick();
        active--;
        return i;
      }),
    );

    const results = await Promise.all(tasks);

    expect(results).toHaveLength(ENTRY_FETCH_MAX_CONCURRENCY * 4);
    expect(maxActive).toBe(ENTRY_FETCH_MAX_CONCURRENCY);
    expect(getEntryFetchQueueStats()).toEqual({
      active: 0,
      queued: 0,
      maxConcurrency: ENTRY_FETCH_MAX_CONCURRENCY,
    });
  });

  it('reports queued requests while saturated', async () => {
    const running = Array.from({ length: ENTRY_FETCH_MAX_CONCURRENCY }, () =>
      withEntryFetchSlot(() => tick()),
    );
    // Let the first batch acquire their slots.
    await Promise.resolve();

    expect(getEntryFetchQueueStats().active).toBe(ENTRY_FETCH_MAX_CONCURRENCY);

    const queued = withEntryFetchSlot(() => tick());
    await Promise.resolve();

    expect(getEntryFetchQueueStats().queued).toBe(1);

    await Promise.all([...running, queued]);
    expect(getEntryFetchQueueStats().queued).toBe(0);
  });

  it('releases the slot when a task rejects', async () => {
    await expect(
      withEntryFetchSlot(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(getEntryFetchQueueStats().active).toBe(0);

    // The freed slot is usable again.
    await expect(withEntryFetchSlot(async () => 'ok')).resolves.toBe('ok');
  });

  it('runs tasks in submission order', async () => {
    const started: number[] = [];
    await Promise.all(
      Array.from({ length: ENTRY_FETCH_MAX_CONCURRENCY + 4 }, (_, i) =>
        withEntryFetchSlot(async () => {
          started.push(i);
          await tick();
        }),
      ),
    );

    expect(started).toEqual(
      Array.from({ length: ENTRY_FETCH_MAX_CONCURRENCY + 4 }, (_, i) => i),
    );
  });
});
