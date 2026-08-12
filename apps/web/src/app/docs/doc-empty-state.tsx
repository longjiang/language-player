'use client';

import { useT } from '@/hooks/use-t';

export function DocEmptyState() {
  const t = useT();
  return (
    <p className="text-center text-sm text-muted-foreground">
      {t('docs.no_docs_yet')}
    </p>
  );
}
