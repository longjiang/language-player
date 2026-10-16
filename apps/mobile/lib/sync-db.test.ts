import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A database that cannot be opened must not disable the feature for the whole
 * session.
 *
 * `openSyncDB()` memoizes its open promise so concurrent callers share one
 * connection. It used to memoize the *rejected* promise too, so a single failure
 * (a corrupt `sync.db`, a full disk, a locked file) made every later call return
 * that same rejection — sync stayed dead until the app was relaunched. These
 * tests pin: a failed open is retried, and a successful open is still shared.
 */

const openDatabaseAsync = vi.fn();
const execAsync = vi.fn();

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: (...args: unknown[]) => openDatabaseAsync(...args),
}));

// The root vitest config aliases `@` to apps/web/src and the mobile config to
// apps/mobile, so this mock must satisfy BOTH logger shapes (the modules
// destructure category loggers such as `syncLogger`).
vi.mock('@/lib/logger', () => {
  const noop = () => {};
  const logger = { log: noop, logwarn: noop, logerr: noop };
  return { ...logger, syncLogger: logger, dictDbLogger: logger };
});

beforeEach(() => {
  vi.resetModules();
  openDatabaseAsync.mockReset();
  execAsync.mockReset();
  execAsync.mockResolvedValue(undefined);
});

/** Fresh module per test (the connection memo is module-level state). */
async function loadSyncDb() {
  return import('./sync-db');
}

describe('openSyncDB failure handling', () => {
  it('retries after a failed open instead of replaying the rejection forever', async () => {
    const { openSyncDB } = await loadSyncDb();
    openDatabaseAsync.mockRejectedValueOnce(new Error('sync.db is corrupt'));
    openDatabaseAsync.mockResolvedValueOnce({ execAsync });

    await expect(openSyncDB()).rejects.toThrow('sync.db is corrupt');

    // Before the fix this returned the same rejected promise again.
    const db = await openSyncDB();
    expect(db).toBeDefined();
    expect(openDatabaseAsync).toHaveBeenCalledTimes(2);
  });

  it('retries after a failed schema setup, not just a failed open', async () => {
    const { openSyncDB } = await loadSyncDb();
    openDatabaseAsync.mockResolvedValueOnce({ execAsync });
    execAsync.mockRejectedValueOnce(new Error('disk I/O error'));
    openDatabaseAsync.mockResolvedValueOnce({ execAsync });

    await expect(openSyncDB()).rejects.toThrow('disk I/O error');
    await expect(openSyncDB()).resolves.toBeDefined();
    expect(openDatabaseAsync).toHaveBeenCalledTimes(2);
  });

  it('still shares one connection between concurrent and later callers', async () => {
    const { openSyncDB } = await loadSyncDb();
    openDatabaseAsync.mockResolvedValue({ execAsync });

    const [a, b] = await Promise.all([openSyncDB(), openSyncDB()]);
    const c = await openSyncDB();
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(openDatabaseAsync).toHaveBeenCalledTimes(1);
  });
});
