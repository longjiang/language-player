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
  'en': 'en', 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', 'ar': 'ar', 'de': 'de',
  'es': 'es', 'fr': 'fr', 'id': 'id', 'it': 'it', 'ja': 'ja', 'ko': 'ko',
  'nl': 'nl', 'pl': 'pl', 'pt': 'pt', 'ru': 'ru', 'th': 'th', 'tr': 'tr',
  'vi': 'vi',
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
 *
 * Priority:
 *   1. runtimeMessages cache — loaded by setLocale() for the user-selected
 *      extension language. This is the CORRECT language to show.
 *   2. chrome.i18n.getMessage() — fallback using the browser's UI language.
 *      Only used when runtimeMessages hasn't been loaded yet (e.g., before
 *      setLocale() completes) or when a key is missing from the loaded locale.
 *
 * Placeholder substitution:
 *   - Named placeholders ($word$, $lang$, etc.) are resolved using the
 *     placeholders config from the message entry (generated from en template).
 *   - Positional $1$, $2$ are used as fallback when no placeholders config exists.
 */
export function t(key, substitutions) {
  // 1. Runtime cache first — has the user-selected locale, NOT the browser's UI language.
  //    chrome.i18n.getMessage() only knows about the browser UI language and
  //    default_locale ("en"), so it must NOT take priority over runtimeMessages.
  if (runtimeMessages && runtimeMessages[key]) {
    const entry = runtimeMessages[key];
    let msg = entry.message;
    if (substitutions && substitutions.length > 0) {
      const placeholders = entry.placeholders;
      if (placeholders) {
        // Named placeholders: { word: { content: "$1" } } — map names to substitution indices
        for (const [name, config] of Object.entries(placeholders)) {
          const match = config.content?.match(/^\$(\d+)$/);
          if (match) {
            const idx = parseInt(match[1], 10) - 1; // "$1" → index 0
            if (idx >= 0 && idx < substitutions.length) {
              msg = msg.replace(`$${name}$`, substitutions[idx]);
            }
          }
        }
      } else {
        // Positional fallback: $1$, $2$, etc. (for messages without placeholders config)
        substitutions.forEach((val, i) => {
          msg = msg.replace(`$${i + 1}$`, val);
        });
      }
    }
    if (msg) return msg;
  }

  // 2. Fallback to Chrome's built-in i18n — uses browser UI language, not user-selected.
  //    Only reached when runtimeMessages hasn't been loaded or key is missing.
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    const msg = substitutions && substitutions.length
      ? chrome.i18n.getMessage(key, ...substitutions)
      : chrome.i18n.getMessage(key);
    if (msg) return msg;
  }

  // 3. Final fallback
  return key;
}
