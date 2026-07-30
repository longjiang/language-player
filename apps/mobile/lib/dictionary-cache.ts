/**
 * Mobile re-exports from the shared dictionary cache in @langplayer/utils.
 *
 * Kept as a file so existing imports from '@/lib/dictionary-cache' still work
 * without updating every consumer.
 *
 * Note: useEntryCache should be imported directly from '@langplayer/utils'.
 */

export {
  getCachedEntries,
  setCachedEntries,
  getCacheVersion,
  subscribeToCache,
  bulkLookupWords,
  getCachedEntryById,
  setCachedEntryById,
} from '@langplayer/utils';
