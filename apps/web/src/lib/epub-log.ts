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
