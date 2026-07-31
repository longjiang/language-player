'use client';

import Link from 'next/link';
import { useT } from '@/hooks/use-t';

export default function NotFound() {
  const t = useT();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-muted-foreground/30">404</h1>
      <h2 className="mt-4 text-xl font-semibold">{t('title.page_not_found')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('msg.page_not_found_desc')}
      </p>
      <Link
        href="/language-select"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t('action.go_to_language_selection')}
      </Link>
    </div>
  );
}
