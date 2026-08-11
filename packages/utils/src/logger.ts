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
 * Per-aspect overrides: a logger created with a category (e.g. "translation")
 * uses the category's level when one is set, otherwise the global level.
 * This lets you keep the console quiet globally while still following one
 * aspect in detail:
 *
 *   - Build/deploy env: EXPO_PUBLIC_LOG_LEVEL=1 EXPO_PUBLIC_LOG_LEVEL_TRANSLATION=3
 *                       NEXT_PUBLIC_LOG_LEVEL=1 NEXT_PUBLIC_LOG_LEVEL_TRANSLATION=3
 *   - Runtime (devtools / JS console):
 *                       setLogLevel(1)           // quiet everything
 *                       setLogLevel(3, 'translation')  // but keep translation
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

const categoryLevels = new Map<string, number>();
const categoryEnvCache = new Map<string, number | undefined>();

function categoryEnvKey(category: string): string {
  return category.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function envCategoryLogLevel(category: string): number | undefined {
  const key = categoryEnvKey(category);
  if (categoryEnvCache.has(key)) return categoryEnvCache.get(key);
  let raw: string | undefined;
  try {
    raw = process.env[`NEXT_PUBLIC_LOG_LEVEL_${key}`] ?? process.env[`EXPO_PUBLIC_LOG_LEVEL_${key}`];
  } catch {
    raw = undefined;
  }
  let level: number | undefined;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    level = Number.isInteger(n) ? clampLevel(n) : undefined;
  }
  categoryEnvCache.set(key, level);
  return level;
}

/**
 * Current log level: 0 = off, 1 = errors, 2 = warnings, 3 = verbose.
 * Pass a category to read that aspect's effective level (its override if
 * set, otherwise the global level).
 */
export function getLogLevel(category?: string): number {
  if (category) return categoryLevels.get(category) ?? envCategoryLogLevel(category) ?? logLevel;
  return logLevel;
}

/**
 * Set the log level at runtime, e.g. from the devtools / JS console:
 *   setLogLevel(0)  // silence everything
 *   setLogLevel(3)  // show everything
 *   setLogLevel(3, 'translation')  // only the translation aspect
 * Values are clamped to the valid 0–3 range.
 */
export function setLogLevel(level: number, category?: string): void {
  const n = Number(level);
  if (Number.isFinite(n)) {
    const clamped = clampLevel(Math.trunc(n));
    if (category) categoryLevels.set(category, clamped);
    else logLevel = clamped;
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
export function createLogger(appPrefix: string, category?: string): Logger {
  // Always emit the app prefix, then the domain tag when present:
  //   [LP Mobile] [translation] request …
  // Messages that already start with the app prefix have it stripped first
  // so it is never duplicated.
  const prefixed = (msg: string): string => {
    const withoutAppPrefix = msg.startsWith(appPrefix)
      ? msg.slice(appPrefix.length).trimStart()
      : msg;
    return category
      ? `${appPrefix} [${category}] ${withoutAppPrefix}`
      : `${appPrefix} ${withoutAppPrefix}`;
  };

  const enabled = (level: number): boolean => {
    const effective = category
      ? categoryLevels.get(category) ?? envCategoryLogLevel(category) ?? logLevel
      : logLevel;
    return effective >= level;
  };

  return {
    log(msg: string, ...args: unknown[]): void {
      if (enabled(3)) console.log(prefixed(msg), ...args);
    },
    logwarn(msg: string, ...args: unknown[]): void {
      if (enabled(2)) console.warn(prefixed(msg), ...args);
    },
    logerr(msg: string, ...args: unknown[]): void {
      if (enabled(1)) console.error(prefixed(msg), ...args);
    },
  };
}
