/**
 * Logout user-data wipe.
 *
 * Removes every account-scoped local store (notes, saved words, progress,
 * SRS, settings, recent searches, sync.db, Ask-AI transcripts) and the content
 * directories those stores describe (imported books, local media) so switching
 * users never leaks the previous user's data. Also turns OFF the device-local
 * Offline Mode toggle so the next login isn't blocked by the network gate.
 *
 * Deliberately KEEPS: language preference, offline dictionaries, tokenizer
 * packs, tokenizer caches, and the study-mode preference. Textbook exercise
 * state (`lp:textbook:*`) is also kept: it is device-local with no server copy,
 * so wiping it would destroy the returning user's answers with nothing to
 * restore them from.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { log } from '@/lib/logger';
import { LIBRARY_DIR } from '@/lib/epub-store';

/** Local media sandbox — mirrors `MEDIA_DIR` in hooks/use-local-media.ts. */
const LOCAL_MEDIA_DIR = `${FileSystem.documentDirectory}local-media/`;
import { openSyncDB } from '@/lib/sync-db';
import { resetSyncEngineForLogout } from '@/lib/sync-engine';
import { clearRecentSearchesStorage } from '@/lib/recent-searches-storage';
import { setOfflineModeEnabled } from '@/lib/offline-mode';
import { SUBSCRIPTION_CACHE_KEY } from '@/lib/subscription-cache';

const SECURE_KEYS = [
  'lp_settings',               // SettingsV2
  SUBSCRIPTION_CACHE_KEY,      // last-confirmed subscription record (SPEC-053)
  'zthProgress',               // learning progress
  'zthSrsProgress',            // SRS cards + daily limit
  'zthSavedWords',             // saved words
  'zthSavedWordsPendingOps',   // legacy saved-word queue
  'zthSpeechSettings',         // speech settings
];

const ASYNC_EXACT_KEYS = [
  'notes_active_note',         // last-open note
  'notes_sync_queue',          // legacy notes queue (pre-sync.db)
  'lp_epub_library_v1',        // bookshelf metadata
  'lp:srs-test-cache',         // per-card test results (derived from SRS cards)
];

const ASYNC_PREFIXES = [
  'notes_list_',               // note list cache per L2
  'note_',                     // note body cache per id
  'reader_anchor_note_',       // notes reader page anchors
  'reader_anchor_url_',        // web reader page anchors
  'lp-ask-ai:',                // Ask-AI transcripts (keyed by video/book/image/note)
];

/** Remove all account-scoped local user data. */
export async function wipeUserData(): Promise<void> {
  const started = Date.now();

  // Turn Offline Mode off FIRST so a crash mid-wipe can't leave the login
  // screen blocked by the network gate.
  try {
    await setOfflineModeEnabled(false);
  } catch {
    // best effort — the in-memory gate still flips via setOfflineModeEnabled
  }

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

  // Content directories. The metadata wiped above is what made these files
  // reachable, so leaving them behind leaks the previous user's content as
  // orphaned bytes — and for local media it is worse: `state.json` (a file, not
  // a key) would restore the previous user's video into the next user's player.
  // This is not a loss for the returning user: the metadata needed to use them
  // is already gone.
  for (const dir of [LIBRARY_DIR, LOCAL_MEDIA_DIR]) {
    try {
      await FileSystem.deleteAsync(dir, { idempotent: true });
      log(`[LP Mobile] logout wipe — removed ${dir}`);
    } catch (e) {
      log(`[LP Mobile] logout wipe — could not remove ${dir}: ${(e as Error)?.message ?? e}`);
    }
  }

  await resetSyncEngineForLogout();
  log(`[LP Mobile] logout wipe — done in ${Date.now() - started}ms`);
}
