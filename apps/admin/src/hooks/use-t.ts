'use client';

import { useTranslations } from 'next-intl';

/** Type-safe translation hook (same API as apps/web). */
export function useT() {
  return useTranslations();
}
