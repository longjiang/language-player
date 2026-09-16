import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The subscription cache is what keeps a paid plan alive when the check can't
 * run (offline, Offline Mode, backend down). These tests pin the two
 * properties that matter: the last confirmed record survives, and it can never
 * be read by a different account.
 */

const store = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    store.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    store.delete(key);
  },
}));

vi.mock('@/lib/logger', () => ({
  log: () => {},
  logwarn: () => {},
  logerr: () => {},
}));

import {
  readCachedSubscription,
  writeCachedSubscription,
  SUBSCRIPTION_CACHE_KEY,
} from './subscription-cache';

const LIFETIME = { id: 1, type: 'lifetime', expires_on: null } as never;
const MONTHLY = { id: 2, type: 'monthly', expires_on: '2027-01-01 00:00:00' } as never;

describe('subscription cache (SPEC-053)', () => {
  beforeEach(() => {
    store.clear();
  });

  it('returns the last confirmed record for the same user', async () => {
    await writeCachedSubscription('user-a', LIFETIME);
    expect(await readCachedSubscription('user-a')).toMatchObject({ id: 1, type: 'lifetime' });
  });

  it('keeps the record across reads (a failed check has nothing to write)', async () => {
    await writeCachedSubscription('user-a', MONTHLY);
    expect(await readCachedSubscription('user-a')).toMatchObject({ type: 'monthly' });
    // No write happens when a check fails, so the record is still there.
    expect(await readCachedSubscription('user-a')).toMatchObject({ type: 'monthly' });
  });

  it('never serves one account’s plan to another', async () => {
    await writeCachedSubscription('user-a', LIFETIME);
    expect(await readCachedSubscription('user-b')).toBeNull();
    // An unknown user is also ignored.
    expect(await readCachedSubscription(undefined)).toBeNull();
  });

  it('clears the record when the server says there is no subscription', async () => {
    await writeCachedSubscription('user-a', LIFETIME);
    await writeCachedSubscription('user-a', null);
    expect(store.has(SUBSCRIPTION_CACHE_KEY)).toBe(false);
    expect(await readCachedSubscription('user-a')).toBeNull();
  });

  it('treats a corrupted record as no record instead of throwing', async () => {
    store.set(SUBSCRIPTION_CACHE_KEY, '{not json');
    expect(await readCachedSubscription('user-a')).toBeNull();
  });

  it('ignores a record without an id, which no server answer produces', async () => {
    store.set(
      SUBSCRIPTION_CACHE_KEY,
      JSON.stringify({ userId: 'user-a', sub: { type: 'lifetime' }, cachedAt: 1 }),
    );
    expect(await readCachedSubscription('user-a')).toBeNull();
  });
});
