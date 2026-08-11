/**
 * Mobile app logger — thin wrapper around the shared logger in
 * @langplayer/utils (packages/utils/src/logger.ts). Binds the `[LP Mobile]`
 * prefix; the single app-wide switch (LOG_LEVEL) lives in the shared module.
 *
 * Control it with EXPO_PUBLIC_LOG_LEVEL=0|1|2|3, or at runtime from the JS
 * debugger console via setLogLevel(0|1|2|3).
 */

import { createLogger, getLogLevel, setLogLevel } from '@langplayer/utils';

const mobileLogger = createLogger('[LP Mobile]');

export const { log, logwarn, logerr } = mobileLogger;

/**
 * Per-aspect loggers — each can be leveled independently so one area (e.g.
 * translation) can stay verbose while everything else is quiet:
 *
 *   setLogLevel(1)                 // global: errors only
 *   setLogLevel(3, 'translation')  // translation: full detail
 *
 * Env equivalents (build time): EXPO_PUBLIC_LOG_LEVEL=1
 * plus EXPO_PUBLIC_LOG_LEVEL_TRANSLATION=3, etc.
 */
export const translationLogger = createLogger('[LP Mobile]', 'translation');
export const tokenizerLogger = createLogger('[LP Mobile]', 'tokenizer');
export const readerLogger = createLogger('[LP Mobile]', 'reader');
export const popupLogger = createLogger('[LP Mobile]', 'popup');
export const syncLogger = createLogger('[LP Mobile]', 'sync');

// Sync chatter is off by default — re-enable with setLogLevel(3, 'sync') or
// EXPO_PUBLIC_LOG_LEVEL_SYNC=3. The env override wins when explicitly set.
let syncLevelRaw: string | undefined;
try {
  syncLevelRaw = process.env.EXPO_PUBLIC_LOG_LEVEL_SYNC ?? process.env.NEXT_PUBLIC_LOG_LEVEL_SYNC;
} catch {
  syncLevelRaw = undefined;
}
if (syncLevelRaw === undefined || syncLevelRaw === '') {
  setLogLevel(0, 'sync');
}

export { getLogLevel, setLogLevel };
