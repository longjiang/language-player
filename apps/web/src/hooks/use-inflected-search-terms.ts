'use client';

import { useState, useEffect, useMemo } from 'react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { baseCode } from '@/lib/language-data';
import {
  reduceSearchTerms,
  writtenFormVariants,
  type WrittenFormEntry,
} from '@langplayer/utils';

export interface UseInflectedSearchTermsResult {
  /** All non-redundant search terms (head + variants + inflected forms) */
  allTerms: string[];
  /** The dictionary head form alone (for exact-mode search) */
  headTerm: string;
  /** Whether the inflection API is still loading */
  loading: boolean;
  /** How many distinct forms are being searched (for UI indicator). 0 before load. */
  formCount: number;
}

/** Languages that have a Python inflection endpoint. */
const INFLECTABLE_LANGS: Record<string, string> = {
  ja: '/inflect-japanese',
  ko: '/inflect-korean',
  ru: '/inflect-pymorphy',
  uk: '/inflect-pymorphy',
  en: '/inflect-pattern',
  fr: '/inflect-pattern',
  de: '/inflect-pattern',
  es: '/inflect-pattern',
  it: '/inflect-pattern',
  nl: '/inflect-pattern',
};

function inflectionEndpoint(l2Code: string): string | null {
  return INFLECTABLE_LANGS[l2Code] ?? null;
}

// ── Corpus-discovered forms store (category "other") ──────────────────
// TokenizedText reports the surface form of every token that resolves to a
// dictionary entry (after the batch lookup). Keyed by `${l2Code}:${entryId}`,
// deduped per key; this hook subscribes and folds the forms for its own entry
// into the term list, so forms the inflector missed still get highlighted
// (and searched).

const extraFormsByEntry = new Map<string, Set<string>>();
const extraFormListeners = new Set<() => void>();

function extraKey(l2Code: string, entryId: string): string {
  return `${l2Code}:${entryId}`;
}

/** All corpus-discovered surface forms for an entry (insertion order). */
export function getExtraForms(l2Code: string, entryId: string): string[] {
  return Array.from(extraFormsByEntry.get(extraKey(l2Code, entryId)) ?? []);
}

/**
 * Record a corpus-discovered surface form for an entry. Returns true when
 * newly added; false when it already existed (no-op).
 */
export function addExtraForm(l2Code: string, entryId: string, form: string): boolean {
  const trimmed = form?.trim();
  if (!trimmed) return false;
  const k = extraKey(l2Code, entryId);
  let set = extraFormsByEntry.get(k);
  if (!set) {
    set = new Set();
    extraFormsByEntry.set(k, set);
  }
  if (set.has(trimmed)) return false;
  set.add(trimmed);
  for (const fn of extraFormListeners) fn();
  return true;
}

/** Subscribe to store changes; returns an unsubscribe function. */
export function subscribeExtraForms(fn: () => void): () => void {
  extraFormListeners.add(fn);
  return () => {
    extraFormListeners.delete(fn);
  };
}

/**
 * Given a dictionary entry, collect all searchable forms:
 * script variants + inflected/conjugated forms.
 *
 * The response from /inflect-* is an array of { table, field, form } objects.
 * We extract the `form` field from each and deduplicate with script variants.
 */
export function useInflectedSearchTerms(
  entry: WrittenFormEntry | null,
  l2Code: string,
): UseInflectedSearchTermsResult {
  const [allTerms, setAllTerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const base = baseCode(l2Code);

  const headTerm = entry?.head ?? '';
  const entryId = entry?.id ?? '';

  // Corpus-discovered forms (category "other") — see the store above. Live
  // subscription so newly reported forms re-render and join the term list.
  const [extraForms, setExtraForms] = useState<string[]>(() => getExtraForms(base, entryId));
  useEffect(() => {
    setExtraForms(getExtraForms(base, entryId));
    return subscribeExtraForms(() => setExtraForms(getExtraForms(base, entryId)));
  }, [base, entryId]);

  useEffect(() => {
    if (!entry) return;

    const e = entry; // capture non-null for the closure below
    let cancelled = false;

    async function expand() {
      setLoading(true);

      // 1. Written forms only (head, alternate script, ja kana, zh scripts).
      //    Never pronunciation/phonetic guides — IPA doesn't appear in subs.
      const variants = writtenFormVariants(e, base);

      // 2. Inflected forms from Python backend
      let inflected: string[] = [];
      const endpoint = inflectionEndpoint(base);
      if (endpoint) {
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
        } catch {
          // Inflection unavailable — use variants only
        }
      }

      if (cancelled) return;

      // 3. Always search the exact head; drop forms the head already captures
      //    ("running" → "run") and keep the rest ("made" from "make",
      //    食べた from 食べる). Never search a partial like "ma" or 食.
      const all = reduceSearchTerms(e.head, { variants, inflected });

      setAllTerms(all);
      setLoading(false);
    }

    expand();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.head, entry?.alternate, entry?.han_script, entry?.phonetic_detail?.kana, base]);

  // Merge corpus-discovered "other" forms (deduped) into the final list.
  const mergedTerms = useMemo(() => {
    const seen = new Set(allTerms);
    const out = [...allTerms];
    for (const f of extraForms) {
      if (!f || f.length <= 1 || seen.has(f) || f === headTerm) continue;
      seen.add(f);
      out.push(f);
    }
    return out;
  }, [allTerms, extraForms, headTerm]);

  return {
    allTerms: mergedTerms.length > 0 ? mergedTerms : headTerm ? [headTerm] : [],
    headTerm,
    loading,
    formCount: mergedTerms.length,
  };
}
