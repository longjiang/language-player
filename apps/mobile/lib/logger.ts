/**
 * Mobile app logger — thin wrapper around the shared logger in
 * @langplayer/utils (packages/utils/src/logger.ts). Binds the `[LP Mobile]`
 * prefix; the single app-wide switch (LOG_LEVEL) lives in the shared module.
 *
 * Control it with EXPO_PUBLIC_LOG_LEVEL=0|1|2|3, or at runtime from the JS
 * debugger console via setLogLevel(0|1|2|3).
 */

import { createLogger, getLogLevel, setLogLevel } from '@langplayer/utils';

export const { log, logwarn, logerr } = createLogger('[LP Mobile]');
export { getLogLevel, setLogLevel };
