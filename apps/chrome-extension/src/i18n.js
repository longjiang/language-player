/**
 * i18n helper — thin wrapper around chrome.i18n.getMessage().
 * Handles placeholder substitution by spreading array args.
 *
 * Supports runtime locale switching: when L1 changes, messages for the new
 * locale are loaded from _locales/{locale}/messages.json into a cache so
 * all subsequent t() calls use the selected language.
 */

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
    console.warn(`[LanguagePlayer] Failed to load locale "${chromeLocale}":`, err?.message);
    runtimeMessages = null;
  }
  _localeVersion++;
}

/**
 * Get a translated message by key.
 * Checks the runtime cache first (set by setLocale), falls back to
 * chrome.i18n.getMessage() which uses the browser's UI language.
 */
export function t(key, substitutions) {
  // Check runtime cache first
  if (runtimeMessages && runtimeMessages[key]) {
    let msg = runtimeMessages[key].message;
    // Replace $1$, $2$ etc. placeholders
    if (substitutions && substitutions.length > 0) {
      substitutions.forEach((val, i) => {
        msg = msg.replace(`$${i + 1}$`, val);
      });
    }
    if (msg) return msg;
  }

  // Fallback to Chrome's built-in i18n
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    const msg = substitutions && substitutions.length
      ? chrome.i18n.getMessage(key, ...substitutions)
      : chrome.i18n.getMessage(key);
    if (msg) return msg;
  }

  // Final fallback
  return key;
}
