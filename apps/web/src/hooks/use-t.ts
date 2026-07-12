'use client';

import { useTranslations } from 'next-intl';

/** Type-safe translation hook. Keys autocomplete from messages/en.json. */
export function useT() {
  return useTranslations();
}
