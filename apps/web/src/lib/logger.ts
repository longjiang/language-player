/**
 * Web app logger — thin wrapper around the shared logger in
 * @langplayer/utils (packages/utils/src/logger.ts). Binds the `[LP Web]`
 * prefix; the single app-wide switch (LOG_LEVEL) lives in the shared module.
 *
 * Control it with NEXT_PUBLIC_LOG_LEVEL=0|1|2|3, or at runtime from the
 * devtools console via setLogLevel(0|1|2|3).
 */

import { createLogger, getLogLevel, setLogLevel } from '@langplayer/utils';

/**
 * TEMPORARY (2026-08-14): quiet the verbose [LP Web] logs in development.
 *
 * Defaults the web app to level 2 (warnings + errors) instead of the shared
 * default 3 (verbose) so the session / savedWords / dictionary debug spam
 * stops. An explicit NEXT_PUBLIC_LOG_LEVEL (or EXPO_PUBLIC_LOG_LEVEL) still
 * wins, and setLogLevel(3) from the devtools console re-enables verbose
 * output at runtime. Remove this block to restore the shared default.
 */
const TEMP_WEB_DEV_LOG_LEVEL = 2;

try {
  const envLevel =
    process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.EXPO_PUBLIC_LOG_LEVEL;
  if (process.env.NODE_ENV !== 'production' && envLevel === undefined) {
    setLogLevel(TEMP_WEB_DEV_LOG_LEVEL);
  }
} catch {
  // Runtime without a process polyfill — leave the shared default.
}

export const { log, logwarn, logerr } = createLogger('[LP Web]');
export { getLogLevel, setLogLevel };
