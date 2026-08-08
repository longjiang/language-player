/**
 * Logout user-data wipe.
 *
 * Removes every account-scoped local store (notes, saved words, progress,
 * SRS, settings, recent searches, sync.db) so switching users never leaks
 * the previous user's data. Deliberately KEEPS device-level state: Offline
 * Mode toggle, language preference, offline dictionaries, tokenizer packs,
 * and tokenizer caches.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { log } from '@/lib/logger';
import { openSyncDB } from '@/lib/sync-db';
import { resetSyncEngineForLogout } from '@/lib/sync-engine';
import { clearRecentSearchesStorage } from '@/lib/recent-searches-storage';

const SECURE_KEYS = [
  'lp_settings',               // SettingsV2
  'zthProgress',               // learning progress
  'zthSrsProgress',            // SRS cards + daily limit
  'zthSavedWords',             // saved words
  'zthSavedWordsPendingOps',   // legacy saved-word queue
  'zthSpeechSettings',         // speech settings
];

const ASYNC_EXACT_KEYS = [
  'notes_active_note',         // last-open note
  'notes_sync_queue',          // legacy notes queue (pre-sync.db)
  'lp_epub_library_v1',        // bookshelf metadata (book files stay on disk)
];

const ASYNC_PREFIXES = [
  'notes_list_',               // note list cache per L2
  'note_',                     // note body cache per id
  'reader_anchor_note_',       // notes reader page anchors
  'reader_anchor_url_',        // web reader page anchors
];

/** Remove all account-scoped local user data. */
export async function wipeUserData(): Promise<void> {
  const started = Date.now();

  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(
      (k) =>
        ASYNC_EXACT_KEYS.includes(k) ||
        ASYNC_PREFIXES.some((p) => k.startsWith(p)),
    );
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
    log(`[LP Mobile] logout wipe — removed ${toRemove.length} AsyncStorage keys`);
  } catch (e) {
    log('[LP Mobile] logout wipe — AsyncStorage cleanup failed:', (e as Error)?.message ?? e);
  }

  for (const key of SECURE_KEYS) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // best effort
    }
  }
  await clearRecentSearchesStorage();

  try {
    const db = await openSyncDB();
    await db.execAsync(
      'DELETE FROM entity_cache; DELETE FROM outbox; DELETE FROM sync_meta;',
    );
  } catch (e) {
    log('[LP Mobile] logout wipe — sync.db cleanup failed:', (e as Error)?.message ?? e);
  }

  await resetSyncEngineForLogout();
  log(`[LP Mobile] logout wipe — done in ${Date.now() - started}ms`);
}
