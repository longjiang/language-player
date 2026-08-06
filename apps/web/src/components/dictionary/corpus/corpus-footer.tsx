'use client';

import { useT } from '@/hooks/use-t';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CorpusOption } from './use-corpora';

/** Sentinel value for the "Auto (best available)" option — a corpus
 *  `corpname` is always `preloaded/...`, so this never collides. */
const AUTO_CORPUS = '__auto__';

interface CorpusFooterProps {
  /** Corpora available for the current language (from useCorpora). */
  corpora: CorpusOption[];
  /** Selected corpus (null = auto/best available). */
  corpname: string | null;
  onCorpnameChange: (corpname: string | null) => void;
}

/**
 * Shared footer of the Corpus tab: Sketch Engine attribution plus a dropdown
 * to pick which corpus to search. Choosing a corpus re-queries all four pills
 * with `&corpname=` (the backend auto-resolves a default when omitted).
 */
export function CorpusFooter({ corpora, corpname, onCorpnameChange }: CorpusFooterProps) {
  const t = useT();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
      <span>{t('corpus.provided_by')}</span>
      <Select
        value={corpname ?? AUTO_CORPUS}
        onValueChange={(value) => onCorpnameChange(value === AUTO_CORPUS ? null : value)}
      >
        <SelectTrigger size="sm" className="h-7 max-w-64 bg-muted/50 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO_CORPUS}>{t('label.auto_best_available')}</SelectItem>
          {corpora.map((corpus) => (
            <SelectItem key={corpus.corpname} value={corpus.corpname}>
              {corpus.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
