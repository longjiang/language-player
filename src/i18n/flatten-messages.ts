// @/src/i18n/flatten-messages.ts
// Flattens nested locale JSON (i18n-js format) to flat key-value pairs (react-intl format).
//
// i18n-js nested:   { "action": { "cancel": "Cancel" } }
// react-intl flat:  { "action.cancel": "Cancel" }

export function flattenMessages(
  nested: Record<string, unknown>,
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(nested)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      result[fullKey] = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenMessages(value as Record<string, unknown>, fullKey));
    }
    // Skip arrays, numbers, booleans, null — not valid message values
  }

  return result;
}
