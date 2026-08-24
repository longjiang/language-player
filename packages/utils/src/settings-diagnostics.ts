/**
 * Durable ring buffer for settings-reset diagnostics (SPEC-039 5.2 / ARCH-011).
 *
 * The settings hooks (web + mobile) record every interesting settings event —
 * local load, cloud hydrate apply/skip, persist-skip, cloud PUT, user wipe —
 * into a small JSON ring buffer under a single storage key. The key is
 * deliberately NOT included in the logout wipe lists, so the history survives
 * reloads and wipes: when the user next notices "settings reset to default",
 * the events recorded in previous sessions explain what happened.
 *
 * Platform-agnostic: the caller supplies an async key-value storage adapter
 * (localStorage on web, SecureStore on mobile). Never throws — diagnostics
 * must not break settings.
 */

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const SETTINGS_DIAG_KEY = 'lp_settings_diag';
const MAX_EVENTS = 60;

export interface SettingsDiagEvent {
  /** ISO timestamp of the event. */
  t: string;
  msg: string;
  data?: Record<string, unknown>;
}

export async function pushSettingsDiag(
  storage: KeyValueStorage,
  msg: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    let events: SettingsDiagEvent[] = [];
    try {
      const raw = await storage.getItem(SETTINGS_DIAG_KEY);
      if (raw) events = JSON.parse(raw) as SettingsDiagEvent[];
    } catch {
      events = []; // corrupt history — start fresh
    }
    events.push({ t: new Date().toISOString(), msg, data });
    await storage.setItem(SETTINGS_DIAG_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // diagnostics must never break settings
  }
}

export async function readSettingsDiag(storage: KeyValueStorage): Promise<SettingsDiagEvent[]> {
  try {
    const raw = await storage.getItem(SETTINGS_DIAG_KEY);
    return raw ? (JSON.parse(raw) as SettingsDiagEvent[]) : [];
  } catch {
    return [];
  }
}
