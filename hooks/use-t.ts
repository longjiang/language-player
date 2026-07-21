// @/hooks/use-t.ts
// Thin wrapper around react-intl's useIntl().formatMessage.
// Same call signature as i18n-js's t() — mechanical drop-in replacement.
//
// Usage:
//   const t = useT();
//   t('action.cancel')           → "Cancel"
//   t('msg.saved_count', { count: 5 }) → "5 words saved"

import { useIntl } from 'react-intl';

export function useT() {
  const intl = useIntl();
  return (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id }, values);
}
