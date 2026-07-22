import { useIntl } from 'react-intl';

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
 */
export function useT() {
  const intl = useIntl();

  return (id: string, values?: Record<string, string | number>) => {
    // react-intl resolves flat keys; we bridge nested JSON via resolveNested + defaultMessage
    const message = resolveNested(intl.messages as Record<string, unknown>, id);
    if (!message) return id; // fallback to key name (visible in dev, easy to spot)
    return intl.formatMessage({ id, defaultMessage: message }, values);
  };
}
