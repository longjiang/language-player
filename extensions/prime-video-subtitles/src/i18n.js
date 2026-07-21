/**
 * i18n helper — thin wrapper around chrome.i18n.getMessage().
 * Handles placeholder substitution.
 */
export function t(key, substitutions) {
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    const msg = chrome.i18n.getMessage(key, substitutions);
    if (msg) return msg;
  }
  // Fallback for dev without i18n context
  return key;
}
