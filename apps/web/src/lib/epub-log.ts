/**
 * EPUB reader logging — gated behind a single temporary switch so the
 * `[LP Web] EPUB …` logs can be silenced without touching call sites.
 *
 * Flip `EPUB_LOGS_ENABLED` back to `true` to restore them. When enabled,
 * they still respect the app-wide LOG_LEVEL in `@/lib/logger`.
 */

import { log, logwarn, logerr } from '@/lib/logger';

const EPUB_LOGS_ENABLED = false;

export function epubLog(msg: string, ...args: unknown[]): void {
  if (EPUB_LOGS_ENABLED) log(`EPUB ${msg}`, ...args);
}

export function epubWarn(msg: string, ...args: unknown[]): void {
  if (EPUB_LOGS_ENABLED) logwarn(`EPUB ${msg}`, ...args);
}

export function epubErr(msg: string, ...args: unknown[]): void {
  if (EPUB_LOGS_ENABLED) logerr(`EPUB ${msg}`, ...args);
}

/**
 * Storage-failure logging. Deliberately NOT gated by `EPUB_LOGS_ENABLED`.
 *
 * A stored book/image/media record that can no longer be read is a real error
 * (an IndexedDB request fails with a DOMException) and it presents to the user
 * as "the reader hangs" or "my book vanished", so it must be diagnosable
 * without flipping the reader's verbose switch: it goes to the app-wide error
 * channel, which prints at the default log level (1 in production, 2 in web
 * dev). A stack trace is genuinely required here — it is the only way to see
 * which request/record failed and why.
 */
export function epubStorageErr(msg: string, ...args: unknown[]): void {
  logerr(`EPUB storage: ${msg}`, ...args);
}
