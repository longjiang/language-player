'use client';

import { useState, useEffect } from 'react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { baseCode } from '@/lib/language-data';
import { dedupeSearchTerms } from '@/lib/mutually-exclusive';

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

/**
 * Given a dictionary entry, collect all searchable forms:
 * script variants + inflected/conjugated forms.
 *
 * The response from /inflect-* is an array of { table, field, form } objects.
 * We extract the `form` field from each and deduplicate with script variants.
 */
export function useInflectedSearchTerms(
  entry: {
    head: string;
    alternate?: string | null;
    pronunciation?: string;
    han_script?: {
      simplified?: string;
      traditional?: string;
      kanji?: string | null;
      hanja?: string | null;
      hangul?: string;
    } | null;
    phonetic_detail?: {
      pinyin?: string;
      kana?: string;
      romaji?: string;
      jyutping?: string;
      hangul?: string;
      romanization?: string;
    } | null;
  } | null,
  l2Code: string,
): UseInflectedSearchTermsResult {
  const [allTerms, setAllTerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const base = baseCode(l2Code);

  const headTerm = entry?.head ?? '';

  useEffect(() => {
    if (!entry) return;

    const e = entry; // capture non-null for the closure below
    let cancelled = false;

    async function expand() {
      setLoading(true);

      // 1. Script variants from the entry itself
      const variants: string[] = [e.head];
      if (e.alternate && e.alternate !== e.head) {
        variants.push(e.alternate);
      }
      if (e.pronunciation) {
        variants.push(e.pronunciation);
      }

      const hs = e.han_script;
      if (hs) {
        if (hs.simplified && hs.simplified !== e.head) variants.push(hs.simplified);
        if (hs.traditional && hs.traditional !== e.head) variants.push(hs.traditional);
        if (hs.hangul) variants.push(hs.hangul);
      }

      const pd = e.phonetic_detail;
      if (pd) {
        if (pd.kana) variants.push(pd.kana);
        if (pd.romaji) variants.push(pd.romaji);
        if (pd.pinyin) variants.push(pd.pinyin);
        if (pd.jyutping) variants.push(pd.jyutping);
        if (pd.hangul) variants.push(pd.hangul);
        if (pd.romanization) variants.push(pd.romanization);
      }

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
            // Response shape: [{ table, field, form }, ...] or just string[]
            inflected = (Array.isArray(data) ? data : [])
              .map((f: any) => (typeof f === 'string' ? f : (f.form as string)))
              .filter((f: string) => f && f.length > 1 && f !== e.head);
          }
        } catch {
          // Inflection unavailable — use variants only
        }
      }

      if (cancelled) return;

      // 3. Deduplicate and remove redundant (substring) terms
      const all = dedupeSearchTerms(
        [...variants, ...inflected],
        e.head.length - 1,
      );

      setAllTerms(all);
      setLoading(false);
    }

    expand();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.head, entry?.alternate, entry?.pronunciation, base]);

  return {
    allTerms: allTerms.length > 0 ? allTerms : headTerm ? [headTerm] : [],
    headTerm,
    loading,
    formCount: allTerms.length,
  };
}
