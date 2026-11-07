import { useEffect, useMemo, useState } from 'react';
import type { DictionaryEntry } from '@langplayer/shared';
import { isInflectable } from '@langplayer/shared';
import {
  baseCode,
  entryKanaForm,
  inflectionEndpoint,
  reduceSearchTerms,
  writtenFormVariants,
} from '@langplayer/utils';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log } from '@/lib/logger';

/**
 * Generate search terms for the /subs-search endpoint from a dictionary entry.
 *
 * Written forms: head, alternate script, kana reading for Japanese, and
 * simplified/traditional for Chinese. Pronunciation and phonetic_detail fields
 * that are IPA/Latin phonetic guides don't appear in subtitle text, so they
 * never become search terms.
 *
 * Conjugated forms come from the same Python inflection endpoints web uses
 * (SPEC-109), so both clients search the same form set. The hook also exposes
 * the form groups the forms-filter dialog needs (`kanaTerm`, `inflectedTerms`).
 */
export function useInflectedSearchTerms(entry: DictionaryEntry | null, l2Code: string) {
  const base = baseCode(l2Code);
  const [inflectedForms, setInflectedForms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const headTerm = entry?.head ?? '';
  const kanaTerm = useMemo(
    () => (entry ? entryKanaForm(entry, base) : null),
    [entry, base],
  );

  const variants = useMemo(
    () => (entry ? writtenFormVariants(entry, base) : []),
    [entry, base],
  );

  useEffect(() => {
    if (!entry) {
      setInflectedForms([]);
      setLoading(false);
      return;
    }

    const e = entry;
    let cancelled = false;

    async function expand() {
      setLoading(true);
      // Clear the previous entry's conjugations immediately so a slow fetch
      // never mixes two words' forms into one search.
      setInflectedForms([]);

      let inflected: string[] = [];
      const endpoint = inflectionEndpoint(base);
      if (isInflectable(base) && endpoint) {
        try {
          const res = await fetch(
            `${PYTHON_API_URL}${endpoint}?text=${encodeURIComponent(e.head)}&lang=${base}`,
          );
          if (res.ok) {
            const data = await res.json();
            // Response shape: [{ table, field, form }, ...] or just string[].
            // Drop error rows (e.g. table === 'error' → "Unsupported language")
            // so backend failure modes never leak into the search terms.
            inflected = (Array.isArray(data) ? data : [])
              .filter((f: any) => {
                if (!f) return false;
                const form = typeof f === 'string' ? f : (f.form as string);
                if (typeof f !== 'string' && f.table === 'error') return false;
                return form !== 'Unsupported language';
              })
              .map((f: any) => (typeof f === 'string' ? f : (f.form as string)))
              .filter((f: string) => f && f.length > 1 && f !== e.head);
          }
        } catch (err) {
          // Inflection unavailable — fall back to the written forms only.
          log('[subsSearch] inflection fetch failed', {
            head: e.head,
            endpoint,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (cancelled) return;
      setInflectedForms(inflected);
      setLoading(false);
      log('[subsSearch] forms resolved', {
        head: e.head,
        base,
        variants: variants.length,
        conjugated: inflected.length,
      });
    }

    expand();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.head, entry?.alternate, entry?.han_script, entry?.phonetic_detail?.kana, base]);

  const allTerms = useMemo(() => {
    if (!entry) return [];
    return reduceSearchTerms(entry.head, { variants, inflected: inflectedForms });
  }, [entry, variants, inflectedForms]);

  const inflectedTerms = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const f of inflectedForms) {
      if (!f || f.length <= 1 || f === headTerm || f === kanaTerm || seen.has(f)) continue;
      seen.add(f);
      out.push(f);
    }
    return out;
  }, [inflectedForms, headTerm, kanaTerm]);

  return {
    allTerms,
    headTerm,
    kanaTerm,
    inflectedTerms,
    loading,
    formCount: allTerms.length,
  };
}
