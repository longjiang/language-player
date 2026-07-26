import { useLanguage } from '@/contexts/LanguageContext';
import { getLocaleMessages } from '@/contexts/IntlProvider';

/**
 * Resolve a dot-path key against a nested messages object.
 * e.g., resolveNested(messages, 'action.cancel') → messages.action.cancel
 */
function resolveNested(
  messages: Record<string, unknown>,
  id: string,
): string | undefined {
  let current: unknown = messages;
  for (const part of id.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? (current as string) : undefined;
}

/**
 * Resolve a simple ICU plural message like:
 *   "{count, plural, one {# word} other {# words}}"
 * or (Chinese-style, no singular):
 *   "{count, plural, other {# 个词}}"
 *
 * Returns the formatted string without needing Intl.PluralRules.
 * Falls back to the raw string if parsing fails.
 */
function resolvePlural(message: string, values: Record<string, string | number>): string {
  // Match: {varName, plural, one {...} other {...}} or just {varName, plural, other {...}}
  // Supports optional =0, =1 exact matches and the standard "one", "other" keywords
  const match = message.match(
    /^\s*\{\s*(\w+)\s*,\s*plural\s*,\s*(.+?)\s*\}\s*$/,
  );
  if (!match) return message; // not a simple plural, return as-is

  const varName = match[1];
  const rawValue = values[varName];
  const n = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (isNaN(n)) {
    // Replace {varName} and return
    let result = message;
    for (const [k, v] of Object.entries(values)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return result;
  }

  const body = match[2];

  // Parse categories: "one {# word} other {# words}"
  // Support: =0, =1, zero, one, two, few, many, other
  const catRegex = /\s*(=\d+|zero|one|two|few|many|other)\s*\{\s*(.*?)\s*\}\s*/g;
  let catMatch: RegExpExecArray | null;
  const categories: Record<string, string> = {};

  while ((catMatch = catRegex.exec(body)) !== null) {
    categories[catMatch[1]] = catMatch[2];
  }

  // Pick the right category
  let template: string | undefined;

  // Exact match (=0, =1, etc.)
  template = categories[`=${n}`];
  // English-style: one for 1, other for rest
  if (!template) {
    if (n === 1) {
      template = categories['one'] ?? categories['other'];
    } else {
      template = categories['other'] ?? categories['one'];
    }
  }

  if (!template) return message; // shouldn't happen

  // Replace # with the number
  return template.replace(/#/g, String(n));
}

/**
 * Translation hook with ICU MessageFormat support via react-intl.
 *
 * Usage: const t = useT(); → <Text>{t('action.cancel')}</Text>
 *
 * Resolves dot-path keys against nested locale JSON (same format as web's next-intl).
 * Falls back to the key name if the message is not found.
 *
 * Resolves from the static import map (getLocaleMessages), NOT from IntlProvider's
 * messages prop. IntlProvider receives empty messages to suppress react-intl's
 * flat-key validation. For simple {key} placeholders we do string replacement
 * directly. For ICU plural we use a custom resolver that doesn't need
 * Intl.PluralRules (unavailable in Hermes).
 */
export function useT() {
  const { l1Lang } = useLanguage();
  const locale = l1Lang?.code ?? 'en';

  return (id: string, values?: Record<string, string | number>) => {
    // Resolve from the static import map, not intl.messages (which is empty)
    const messages = getLocaleMessages(locale);
    const message = resolveNested(messages, id);
    if (!message) return id; // fallback to key name (visible in dev, easy to spot)
    // No values → return resolved string directly (avoids flat-key validation)
    if (!values) return message;
    // ICU plural → use custom resolver (avoids Intl.PluralRules dependency)
    // ICU MessageFormat syntax: {varName, plural, ...}
    if (/^\s*\{\s*\w+\s*,\s*plural\s*,/.test(message)) {
      return resolvePlural(message, values);
    }
    // Simple {key} placeholders → string replace directly
    let result = message;
    for (const [k, v] of Object.entries(values)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return result;
  };
}
