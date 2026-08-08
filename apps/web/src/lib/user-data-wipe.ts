'use client';

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

export function clearUserData(): void {
  for (const key of USER_LOCAL_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage unavailable (privacy mode, etc.) — best effort
    }
  }
}
