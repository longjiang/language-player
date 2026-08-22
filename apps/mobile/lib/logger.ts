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
export const tokenizerWorkerLogger = createLogger('[LP Mobile]', 'tokenizer-worker');
export const readerLogger = createLogger('[LP Mobile]', 'reader');
export const popupLogger = createLogger('[LP Mobile]', 'popup');
export const lemmatizeLogger = createLogger('[LP Mobile]', 'lemmatize');
export const tokenizedTextLogger = createLogger('[LP Mobile]', 'tokenized-text');
export const bootLogger = createLogger('[LP Mobile]', 'boot');
export const dictDbLogger = createLogger('[LP Mobile]', 'dictdb');
export const syncLogger = createLogger('[LP Mobile]', 'sync');
export const srsLogger = createLogger('[LP Mobile]', 'srs');
export const dictionaryEntryLogger = createLogger('[LP Mobile]', 'dictionaryEntry');
export const tabbedPanelLogger = createLogger('[LP Mobile]', 'tabbedPanel');

/**
 * Default a domain to OFF unless its env override is explicitly set, e.g.
 * EXPO_PUBLIC_LOG_LEVEL_SYNC=3. Re-enable at runtime with
 * setLogLevel(0|1|2|3, 'sync').
 */
function defaultOff(domain: string): void {
  const key = domain.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  let raw: string | undefined;
  try {
    raw = process.env[`EXPO_PUBLIC_LOG_LEVEL_${key}`] ?? process.env[`NEXT_PUBLIC_LOG_LEVEL_${key}`];
  } catch {
    raw = undefined;
  }
  if (raw === undefined || raw === '') {
    setLogLevel(0, domain);
  }
}

defaultOff('sync');
defaultOff('lemmatize');
defaultOff('tokenized-text');
defaultOff('dictdb');
defaultOff('tokenizer');
defaultOff('tokenizer-worker');
defaultOff('popup');
defaultOff('dictionaryEntry');
defaultOff('tabbedPanel');
defaultOff('reader');
defaultOff('translation');
defaultOff('boot');

export { getLogLevel, setLogLevel };
