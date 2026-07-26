'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useT } from '@/hooks/use-t';

export default function LanguageNotFound() {
  const t = useT();
  const params = useParams<{ l1: string; l2: string }>();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-muted-foreground/30">404</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        {t('msg.not_found_in_pair')}
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href={`/${params.l1}/${params.l2}/explore`}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t('title.explore')}
        </Link>
        <Link
          href="/language-select"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          {t('action.change_language')}
        </Link>
      </div>
    </div>
  );
}
