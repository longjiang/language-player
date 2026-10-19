/**
 * Concurrency limiter for dictionary-entry fetches.
 *
 * Every `/dictionary/entry` request made by a card (saved-words cards, the
 * dictionary sidebar, the Related grid) goes through this queue.
 *
 * Why: the sidebar renders one card per word in the source list, and the
 * saved-words source list is the user's ENTIRE vocabulary. Firing one request
 * per word on mount (hundreds to thousands at once) exhausts the browser's
 * network resources — Chrome fails them with ERR_INSUFFICIENT_RESOURCES — and
 * the main thread stalls rendering every resolved card, freezing the page.
 *
 * Callers should also gate the fetch on visibility (IntersectionObserver): the
 * queue caps the damage, but it should never be handed hundreds of tasks that
 * nobody is looking at.
 */

/** Maximum number of entry requests in flight at once. */
export const ENTRY_FETCH_MAX_CONCURRENCY = 6;

let activeCount = 0;
const waiters: Array<() => void> = [];

export interface EntryFetchQueueStats {
  /** Requests currently in flight. */
  active: number;
  /** Requests waiting for a slot. */
  queued: number;
  maxConcurrency: number;
}

export function getEntryFetchQueueStats(): EntryFetchQueueStats {
  return {
    active: activeCount,
    queued: waiters.length,
    maxConcurrency: ENTRY_FETCH_MAX_CONCURRENCY,
  };
}

function acquireSlot(): Promise<void> {
  if (activeCount < ENTRY_FETCH_MAX_CONCURRENCY) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiters.push(resolve);
  });
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) {
    // Hand the slot straight to the next waiter — activeCount is unchanged.
    next();
    return;
  }
  activeCount--;
}

/**
 * Run `task` once a slot is free. Rejects with whatever `task` rejects with.
 */
export async function withEntryFetchSlot<T>(task: () => Promise<T>): Promise<T> {
  await acquireSlot();
  try {
    return await task();
  } finally {
    releaseSlot();
  }
}

/** Test helper — clears in-flight state between tests. */
export function resetEntryFetchQueueForTests(): void {
  activeCount = 0;
  waiters.length = 0;
}
