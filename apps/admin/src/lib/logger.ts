/**
 * App-wide logging switch for the admin console. Logs are gated by
 * NEXT_PUBLIC_LOG_LEVEL (0=off, 1=errors, 2=warnings, 3=verbose) and every
 * call identifies the app with the `[LP Admin]` prefix.
 */
const LOG_LEVEL = Number(process.env.NEXT_PUBLIC_LOG_LEVEL ?? 3);

export function log(...args: unknown[]): void {
  if (LOG_LEVEL >= 3) console.log('[LP Admin]', ...args);
}

export function logwarn(...args: unknown[]): void {
  if (LOG_LEVEL >= 2) console.warn('[LP Admin]', ...args);
}

export function logerr(...args: unknown[]): void {
  if (LOG_LEVEL >= 1) console.error('[LP Admin]', ...args);
}
