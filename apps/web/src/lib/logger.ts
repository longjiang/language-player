/**
 * Web app logger — thin wrapper around the shared logger in
 * @langplayer/utils (packages/utils/src/logger.ts). Binds the `[LP Web]`
 * prefix; the single app-wide switch (LOG_LEVEL) lives in the shared module.
 *
 * Control it with NEXT_PUBLIC_LOG_LEVEL=0|1|2|3, or at runtime from the
 * devtools console via setLogLevel(0|1|2|3).
 */

import { createLogger, getLogLevel, setLogLevel } from '@langplayer/utils';

export const { log, logwarn, logerr } = createLogger('[LP Web]');
export { getLogLevel, setLogLevel };
