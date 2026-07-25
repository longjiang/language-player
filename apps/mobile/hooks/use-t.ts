import { useIntl } from 'react-intl';
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
 * directly; only complex ICU (plural, select) goes through intl.formatMessage().
 */
export function useT() {
  const intl = useIntl();
  const { l1Lang } = useLanguage();
  const locale = l1Lang?.code ?? 'en';

  return (id: string, values?: Record<string, string | number>) => {
    // Resolve from the static import map, not intl.messages (which is empty)
    const messages = getLocaleMessages(locale);
    const message = resolveNested(messages, id);
    if (!message) return id; // fallback to key name (visible in dev, easy to spot)
    // No values → return resolved string directly (avoids flat-key validation)
    if (!values) return message;
    // Simple {key} placeholders (no ICU plural/select) → string replace directly
    // This avoids react-intl's MISSING_TRANSLATION error for nested keys.
    // ICU keywords to detect: plural, select, selectordinal, number, date, time
    if (!/\{(?:plural|select|selectordinal|number|date|time)\b/.test(message)) {
      let result = message;
      for (const [k, v] of Object.entries(values)) {
        result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
      return result;
    }
    // Complex ICU (plural, select, etc.) → use intl.formatMessage for proper formatting
    return intl.formatMessage({ id, defaultMessage: message }, values);
  };
}
