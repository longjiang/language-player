import { isOfflineModeError } from './offline-mode';

type Translate = (key: string) => string;

/**
 * Convert a caught error into a localized, user-safe message.
 * Known app errors (e.g. Offline Mode) map to translation keys; unknown
 * errors keep their message only when one exists, otherwise fall back to a
 * generic localized error.
 */
export function localizedError(
  t: Translate,
  e: unknown,
  fallbackKey = 'error.general',
): string {
  if (isOfflineModeError(e)) return t('error.offline_mode_blocked');
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return t(fallbackKey);
}
