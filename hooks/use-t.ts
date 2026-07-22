// @/hooks/use-t.ts
// Thin wrapper around react-intl's useIntl().formatMessage.
// Same call signature as i18n-js's t() — mechanical drop-in replacement.
//
// Resolves dot-path keys (e.g., 'action.cancel') against nested JSON,
// then delegates to react-intl for ICU MessageFormat processing.
//
// Usage:
//   const t = useT();
//   t('action.cancel')           → "Cancel"
//   t('msg.saved_count', { count: 5 }) → "5 words saved"

import { useCallback } from 'react';
import { useIntl } from 'react-intl';
import { useLanguage } from '@/contexts/LanguageContext';

/** Walk a nested object by dot-separated key path. */
function resolveNested(
  messages: Record<string, unknown>,
  id: string
): string | undefined {
  let current: unknown = messages;
  for (const part of id.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

export function useT() {
  const intl = useIntl();
  const { i18n } = useLanguage();

  // useCallback ensures stable reference — critical for components that
  // include t() in useEffect dependency arrays (e.g., DictionaryContext).
  return useCallback(
    (id: string, values?: Record<string, string | number>) => {
      const locale = i18n.locale;
      const messages = i18n.translations[locale] as Record<string, unknown>;
      const message = resolveNested(messages, id);

      if (!message) return id; // fallback to showing the key name

      // react-intl handles ICU formatting ({count, plural, ...})
      return intl.formatMessage({ id, defaultMessage: message }, values);
    },
    [intl, i18n],
  );
}
