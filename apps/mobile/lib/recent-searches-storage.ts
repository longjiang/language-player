/**
 * Recent dictionary-search storage (per-L2), shared by DictionaryContext and
 * the logout wipe.
 *
 * Backed by AsyncStorage so recents survive app restarts (including iOS
 * simulators, where SecureStore can be unavailable). Keys are namespaced per
 * L2 so each language keeps its own list.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, logwarn } from '@/lib/logger';

export const RECENT_STORAGE_PREFIX = 'zthRecentSearches:';

export async function recentStorageGet(key: string): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(key);
    log('[recent-storage] get', {
      key,
      found: value !== null,
      chars: value?.length ?? 0,
    });
    return value;
  } catch (e) {
    logwarn('[recent-storage] get failed', {
      key,
      error: (e as Error)?.message ?? String(e),
    });
    return null;
  }
}

export async function recentStorageSet(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
    log('[recent-storage] set ok', { key, chars: value.length });
  } catch (e) {
    logwarn('[recent-storage] set failed', {
      key,
      error: (e as Error)?.message ?? String(e),
    });
    throw e;
  }
}

export async function recentStorageRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
    log('[recent-storage] remove ok', { key });
  } catch (e) {
    logwarn('[recent-storage] remove failed', {
      key,
      error: (e as Error)?.message ?? String(e),
    });
    throw e;
  }
}

/** Remove every recent-searches key across all L2s (logout wipe). */
export async function clearRecentSearchesStorage(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const recentKeys = keys.filter((k) => k.startsWith(RECENT_STORAGE_PREFIX));
    if (recentKeys.length > 0) {
      await AsyncStorage.multiRemove(recentKeys);
    }
    log('[recent-storage] clear', {
      removed: recentKeys.length,
      totalKeys: keys.length,
    });
  } catch (e) {
    logwarn('[recent-storage] clear failed', {
      error: (e as Error)?.message ?? String(e),
    });
  }
}
