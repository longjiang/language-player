'use client';

import { useT } from '@/hooks/use-t';

interface CorpusFooterProps {
  /** Raw corpus name (e.g. "preloaded/zhtenten21_simp_stf4"). The
   *  "preloaded/" prefix is stripped for display. */
  corpname?: string;
}

/** Small attribution footer shown under each corpus section. */
export function CorpusFooter({ corpname }: CorpusFooterProps) {
  const t = useT();
  const name = corpname?.replace(/^preloaded\//, '');
  return (
    <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
      <p>{t('corpus.provided_by')}</p>
      {name ? (
        <p className="mt-1">
          {t('corpus.corpus_name', { name })}
        </p>
      ) : null}
    </div>
  );
}
