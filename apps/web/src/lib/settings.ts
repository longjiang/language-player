/**
 * Simple client-side settings stored in localStorage.
 * For user preferences that don't need a server round-trip.
 */

const PREFIX = 'lp_';

function get<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function set<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage full or unavailable
  }
}

/** Whether to show translated subtitles below the original. Default: true. */
export function getShowTranslation(): boolean {
  return get<boolean>('show_translation', true);
}

export function setShowTranslation(value: boolean): void {
  set('show_translation', value);
}

/** Whether to use traditional Chinese characters (zh L2 only). Default: false (simplified). */
export function getUseTraditional(): boolean {
  return get<boolean>('use_traditional', false);
}

export function setUseTraditional(value: boolean): void {
  set('use_traditional', value);
}

/** Subscribe to changes to a setting. Returns unsubscribe function. */
export function onSettingChange(key: string, callback: (value: unknown) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === PREFIX + key) {
      try {
        callback(e.newValue ? JSON.parse(e.newValue) : null);
      } catch {
        callback(e.newValue);
      }
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
