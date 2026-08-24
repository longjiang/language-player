'use client';

import { pushSettingsDiag } from '@langplayer/utils';
import type { KeyValueStorage } from '@langplayer/utils';

/** Nuke all user-specific localStorage keys on logout / account deletion. */
const USER_LOCAL_KEYS = [
  'lp_settings',               // SettingsV2
  'zthSrsProgress',            // SRS cards + daily limit
  'zthSpeechSettings',         // speech settings
  'zthSavedWords',             // saved words
  'zthSavedWordsPendingOps',   // legacy saved-word queue
  'lpSavedWordsAnonMerged',    // anonymous → account merge flag
  // Legacy Classic settings keys (migrated into lp_settings):
  'lp_show_translation',
  'lp_show_phonetics',
  'lp_use_traditional',
];

// `lp_settings_diag` (settings diagnostics ring buffer) is deliberately NOT in
// the wipe list — when settings reset to default, the ring buffer survives the
// wipe so the cause (logout wipe, dead-refresh-token auto sign-out, etc.) is
// still visible in the next boot's "[settings] recent diagnostics" log.
const diagStorage: KeyValueStorage = {
  getItem: (key) => Promise.resolve(localStorage.getItem(key)),
  setItem: (key, value) => {
    localStorage.setItem(key, value);
    return Promise.resolve();
  },
};

export function clearUserData(): void {
  const wipedAt = new Date().toISOString();
  for (const key of USER_LOCAL_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage unavailable (privacy mode, etc.) — best effort
    }
  }
  // Per-user anonymous-merge flags (SPEC-062): lpSavedWordsAnonMerged:<userId>
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('lpSavedWordsAnonMerged')) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // best effort
  }
  // Record the wipe in the settings diagnostics ring buffer so a settings
  // reset caused by this wipe is explainable after the fact.
  void pushSettingsDiag(diagStorage, 'clearUserData — user data wiped (logout / account deletion / dead session)', {
    wipedAt,
    keys: USER_LOCAL_KEYS,
  });
}
