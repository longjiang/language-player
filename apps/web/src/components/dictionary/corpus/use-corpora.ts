'use client';

import { useEffect, useState } from 'react';
import type { SketchCorporaResponse, SketchCorpus } from '@langplayer/shared';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { logwarn } from '@/lib/logger';

export interface CorpusOption {
  corpname: string;
  /** Human-readable display name. */
  name: string;
  wordcount: number;
  featured: boolean;
}

/** Port of Classic CorpusSelect.getCorpora(): match the language (exact code
 *  or `<code>-<region>` prefix), drop learner corpora, sort by wordcount desc. */
function matchesLanguage(corpus: SketchCorpus, l2: string): boolean {
  const lang = (corpus.language_id || '').toLowerCase();
  return lang === l2 || lang.startsWith(l2 + '-');
}

/**
 * Loads the Sketch Engine corpus list for a language (GET /sketch-engine/corpora,
 * cached ~monthly server-side) and filters it down to the corpora that apply to
 * `l2Code`. Used to populate the corpus picker in the Corpus tab (ARCH-020 §3, §6).
 */
export function useCorpora(l2Code: string) {
  const l2 = baseCode(l2Code);
  const [corpora, setCorpora] = useState<CorpusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCorpora([]);

    (async () => {
      try {
        const res = await fetch(`${PYTHON_API_URL}/sketch-engine/corpora`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SketchCorporaResponse;
        if (cancelled) return;
        const options = (json.data || [])
          .filter((c) => matchesLanguage(c, l2) && !(c.tags ?? []).includes('learner'))
          .sort((a, b) => (b.sizes?.wordcount ?? 0) - (a.sizes?.wordcount ?? 0))
          .map((c) => ({
            corpname: c.corpname,
            name: c.name,
            wordcount: c.sizes?.wordcount ?? 0,
            featured: !!c.is_featured,
          }));
        setCorpora(options);
      } catch (err) {
        if (cancelled) return;
        logwarn('[LP Web] Corpus list fetch failed', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [l2]);

  return { corpora, loading, error };
}
