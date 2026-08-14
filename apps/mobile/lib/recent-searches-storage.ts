/**
 * Recent dictionary-search storage (per-L2), shared by DictionaryContext and
 * the logout wipe.
 *
 * Backed by AsyncStorage so recents survive app restarts (including iOS
 * simulators, where SecureStore can be unavailable). Keys are namespaced per
 * L2 so each language keeps its own list.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENT_STORAGE_PREFIX = 'zthRecentSearches:';

export async function recentStorageGet(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function recentStorageSet(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function recentStorageRemove(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

/** Remove every recent-searches key across all L2s (logout wipe). */
export async function clearRecentSearchesStorage(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const recentKeys = keys.filter((k) => k.startsWith(RECENT_STORAGE_PREFIX));
  if (recentKeys.length > 0) {
    await AsyncStorage.multiRemove(recentKeys);
  }
}
