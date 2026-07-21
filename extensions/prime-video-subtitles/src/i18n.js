/**
 * i18n helper — thin wrapper around chrome.i18n.getMessage().
 * Handles placeholder substitution by spreading array args.
 */
export function t(key, substitutions) {
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    const msg = substitutions && substitutions.length
      ? chrome.i18n.getMessage(key, ...substitutions)
      : chrome.i18n.getMessage(key);
    if (msg) return msg;
  }
  // Fallback for dev without i18n context
  return key;
}
