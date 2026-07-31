/**
 * Shared app-wide logging (platform-agnostic — no React/Next/RN imports).
 *
 * Each app wraps this with its own bracketed prefix via createLogger():
 *   - Web:    apps/web/src/lib/logger.ts    → `[LP Web]`
 *   - Mobile: apps/mobile/lib/logger.ts     → `[LP Mobile]`
 *
 * All logging is gated by a single app-wide switch, LOG_LEVEL
 * (same convention as the Chrome extension):
 *
 *   0 = off         — no output at all
 *   1 = errors      — logerr() only
 *   2 = warnings    — logerr() + logwarn()
 *   3 = verbose     — logerr() + logwarn() + log()
 *
 * How to control it:
 *   - Build/deploy env:  NEXT_PUBLIC_LOG_LEVEL=0|1|2|3  (Next.js)
 *                        EXPO_PUBLIC_LOG_LEVEL=0|1|2|3  (Expo/Metro)
 *   - Runtime in development, from the devtools / JS console:
 *                        setLogLevel(0|1|2|3)  (also callable from code)
 *
 * Defaults: 3 in development, 1 in production.
 */

// Minimal ambient type so this module typechecks without @types/node.
declare const process: { env: Record<string, string | undefined> };

const MIN_LEVEL = 0;
const MAX_LEVEL = 3;

function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));
}

function envLogLevel(): number | undefined {
  // Direct member access keeps Next.js/Expo build-time inlining working
  // (NEXT_PUBLIC_* for web, EXPO_PUBLIC_* for Metro). The try/catch guards
  // runtimes where `process` itself is absent — e.g. a webpack client bundle
  // with no process polyfill — where the read falls back to the default level
  // instead of crashing at module load.
  try {
    const raw = process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.EXPO_PUBLIC_LOG_LEVEL;
    if (raw === undefined || raw === '') return undefined;
    const n = Number(raw);
    return Number.isInteger(n) ? clampLevel(n) : undefined;
  } catch {
    return undefined;
  }
}

function defaultLogLevel(): number {
  try {
    return process.env.NODE_ENV === 'production' ? 1 : 3;
  } catch {
    return 3;
  }
}

let logLevel = envLogLevel() ?? defaultLogLevel();

/** Current log level: 0 = off, 1 = errors, 2 = warnings, 3 = verbose. */
export function getLogLevel(): number {
  return logLevel;
}

/**
 * Set the log level at runtime, e.g. from the devtools / JS console:
 *   setLogLevel(0)  // silence everything
 *   setLogLevel(3)  // show everything
 * Values are clamped to the valid 0–3 range.
 */
export function setLogLevel(level: number): void {
  const n = Number(level);
  if (Number.isFinite(n)) {
    logLevel = clampLevel(Math.trunc(n));
  }
}

// In development, expose the setter globally so it can be flipped live from
// the browser devtools (web) or the JS debugger (React Native).
if (typeof globalThis !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (globalThis as { setLogLevel?: typeof setLogLevel }).setLogLevel = setLogLevel;
}

export interface Logger {
  /** Verbose debug log — shown at LOG_LEVEL >= 3. */
  log(msg: string, ...args: unknown[]): void;
  /** Warning — shown at LOG_LEVEL >= 2. */
  logwarn(msg: string, ...args: unknown[]): void;
  /** Error — shown at LOG_LEVEL >= 1. */
  logerr(msg: string, ...args: unknown[]): void;
}

/**
 * Create a logger bound to an app prefix (e.g. `[LP Web]`). The prefix is
 * always prepended first so logs can be filtered by app in a shared console.
 */
export function createLogger(appPrefix: string): Logger {
  const prefixed = (msg: string): string =>
    msg.startsWith(appPrefix) ? msg : `${appPrefix} ${msg}`;

  return {
    log(msg: string, ...args: unknown[]): void {
      if (logLevel >= 3) console.log(prefixed(msg), ...args);
    },
    logwarn(msg: string, ...args: unknown[]): void {
      if (logLevel >= 2) console.warn(prefixed(msg), ...args);
    },
    logerr(msg: string, ...args: unknown[]): void {
      if (logLevel >= 1) console.error(prefixed(msg), ...args);
    },
  };
}
