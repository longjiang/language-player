/**
 * Recent dictionary-search storage (per-L2), shared by DictionaryContext and
 * the logout wipe. SecureStore can't enumerate its keys, so we track every
 * key we've written and clear exactly those on logout.
 */

import * as SecureStore from 'expo-secure-store';

export const RECENT_STORAGE_PREFIX = 'zthRecentSearches:';

// In-memory fallback — SecureStore can be unavailable on iOS simulators.
const memoryStore = new Map<string, string>();
const writtenKeys = new Set<string>();

export async function recentStorageGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

export async function recentStorageSet(key: string, value: string): Promise<void> {
  writtenKeys.add(key);
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    memoryStore.set(key, value);
  }
}

export async function recentStorageRemove(key: string): Promise<void> {
  writtenKeys.delete(key);
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    memoryStore.delete(key);
  }
}

/** Remove every recent-searches key written this session (logout wipe). */
export async function clearRecentSearchesStorage(): Promise<void> {
  for (const key of [...writtenKeys]) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // best effort
    }
  }
  writtenKeys.clear();
  memoryStore.clear();
}
