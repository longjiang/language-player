'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';

/**
 * Language dashboard — immediately redirects to Explore.
 * This page serves as a redirect target for language selection.
 */
export default function LanguageDashboard() {
  const { l1, l2 } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${l1.code}/${l2.code}/explore`);
  }, [l1.code, l2.code, router]);

  return null;
}
