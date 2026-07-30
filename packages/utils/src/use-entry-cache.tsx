/**
 * React hooks that reactively subscribe to the shared dictionary entry cache.
 *
 * Two variants:
 * - `useEntryCache(l2Code, text)` — looks up by text (returns all entries for a word).
 * - `useEntryByIdCache(l2Code, entryId)` — looks up by entry ID (returns single entry).
 *
 * Both use `useSyncExternalStore` so components re-render automatically when
 * the cache is populated (e.g. by bulkLookupWords or setCachedEntries).
 */

import { useSyncExternalStore } from 'react';
import { getCachedEntries, getCachedEntryById, subscribeToCache } from './dictionary-cache';
import type { DictionaryEntry } from '@langplayer/shared';

export function useEntryCache(l2Code: string, text: string): DictionaryEntry[] | undefined {
  return useSyncExternalStore(
    subscribeToCache,
    () => getCachedEntries(l2Code, text),
    () => undefined, // getServerSnapshot — no cached data during SSR
  );
}

export function useEntryByIdCache(l2Code: string, entryId: string): DictionaryEntry | undefined {
  return useSyncExternalStore(
    subscribeToCache,
    () => getCachedEntryById(l2Code, entryId),
    () => undefined, // getServerSnapshot — no cached data during SSR
  );
}
