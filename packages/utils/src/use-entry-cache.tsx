/**
 * React hook that reactively subscribes to the shared dictionary entry cache.
 *
 * When TokenizedText's bulkLookupWords populates the cache for the given
 * (l2Code, text) key, this hook triggers a re-render so the component
 * gets the fresh data without polling or manual state management.
 *
 * Usage:
 * ```tsx
 * const entries = useEntryCache(l2Code, wordForm);
 * const entry = entries?.find(e => e.id === targetId) ?? null;
 * ```
 */

import { useSyncExternalStore } from 'react';
import { getCachedEntries, subscribeToCache } from './dictionary-cache';
import type { DictionaryEntry } from '@langplayer/shared';

export function useEntryCache(l2Code: string, text: string): DictionaryEntry[] | undefined {
  return useSyncExternalStore(
    subscribeToCache,
    () => getCachedEntries(l2Code, text),
  );
}
