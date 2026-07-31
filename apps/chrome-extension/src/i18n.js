/**
 * i18n helper — thin wrapper around chrome.i18n.getMessage().
 * Handles placeholder substitution by spreading array args.
 *
 * Supports runtime locale switching: when L1 changes, messages for the new
 * locale are loaded from _locales/{locale}/messages.json into a cache so
 * all subsequent t() calls use the selected language.
 *
 * Logging: exports log() / logwarn() / logerr() helpers gated by LOG_LEVEL.
 * Set LOG_LEVEL = 0 to disable all extension logs, 1 for errors only,
 * 2 for warnings+errors, 3 for everything (default).
 */

// ── Logging ────────────────────────────────────────────────────────────────

/** Log level: 0=off, 1=errors, 2=warnings, 3=verbose (default). */
const LOG_LEVEL = 3;

const PREFIX = '[LP Extension]';

/** Verbose trace log — only shown at LOG_LEVEL >= 3 */
export function log(...args) {
  if (LOG_LEVEL >= 3) console.log(PREFIX, ...args);
}

/** Warning — shown at LOG_LEVEL >= 2 */
export function logwarn(...args) {
  if (LOG_LEVEL >= 2) console.warn(PREFIX, ...args);
}

/** Error — shown at LOG_LEVEL >= 1 */
export function logerr(...args) {
  if (LOG_LEVEL >= 1) console.error(PREFIX, ...args);
}

// ── i18n ───────────────────────────────────────────────────────────────────

/** Cache of messages loaded from _locales/{locale}/messages.json */
let runtimeMessages = null;

/** Monotonic counter bumped on every setLocale() call.
 *  React components use this to force re-render when the UI language changes. */
let _localeVersion = 0;

export function getLocaleVersion() {
  return _localeVersion;
}

/** Mapping from CSV-style locale codes to Chrome _locales/ directory names */
const CSV_TO_CHROME = {
  'en': 'en', 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', 'af': 'af', 'ar': 'ar',
  'ca': 'ca', 'de': 'de', 'el': 'el', 'es': 'es', 'fi': 'fi', 'fr': 'fr',
  'ga': 'ga', 'hi': 'hi', 'hr': 'hr', 'hu': 'hu', 'id': 'id', 'it': 'it',
  'ja': 'ja', 'ko': 'ko', 'nl': 'nl', 'no': 'no', 'pl': 'pl', 'pt': 'pt',
  'ro': 'ro', 'ru': 'ru', 'sr': 'sr', 'sv': 'sv', 'sw': 'sw', 'th': 'th',
  'tr': 'tr', 'vi': 'vi',
};

/**
 * Load messages for a given CSV-style locale code into the runtime cache.
 * @param {string} localeCode - CSV-style code (e.g. 'zh-Hans', 'fr')
 */
export async function setLocale(localeCode) {
  const chromeLocale = CSV_TO_CHROME[localeCode] || localeCode;
  try {
    const url = chrome.runtime.getURL(`_locales/${chromeLocale}/messages.json`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const messages = await res.json();
    runtimeMessages = messages;
  } catch (err) {
    logwarn(`Failed to load locale "${chromeLocale}":`, err?.message);
    runtimeMessages = null;
  }
  _localeVersion++;
}

/**
 * Get a translated message by key.
 * Uses chrome.i18n.getMessage() for proper placeholder resolution
 * (handles both named $word$ and positional $1$ placeholders).
 * Caches runtime-loaded messages but delegates to Chrome for substitution.
 */
export function t(key, substitutions) {
  // Always prefer Chrome's built-in i18n which handles all placeholder types
  // ($word$, $1$, etc.) and placeholders config correctly.
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    const msg = substitutions && substitutions.length
      ? chrome.i18n.getMessage(key, ...substitutions)
      : chrome.i18n.getMessage(key);
    if (msg) return msg;
  }

  // Fallback to runtime cache if Chrome i18n is unavailable
  if (runtimeMessages && runtimeMessages[key]) {
    let msg = runtimeMessages[key].message;
    if (substitutions && substitutions.length > 0) {
      substitutions.forEach((val, i) => {
        msg = msg.replace(`$${i + 1}$`, val);
      });
    }
    if (msg) return msg;
  }

  // Final fallback
  return key;
}
