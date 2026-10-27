'use client';

import { BookOpen } from 'lucide-react';
import { useT } from '@/hooks/use-t';

export function DocPageHeading() {
  const t = useT();
  return (
    <div className="mb-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <BookOpen className="h-7 w-7 text-primary" />
      </div>
      <h1 className="text-2xl font-bold">{t('title.documentation')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('docs.guides_reference')}
      </p>
    </div>
  );
}
