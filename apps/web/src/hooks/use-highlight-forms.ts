'use client';

/**
 * Highlight-form derivation for TokenizedText (web): saved multi-token
 * phrase candidates + kana/alternate surfaces of the highlight terms'
 * dictionary entries. Extracted from components/tokenized-text.tsx
 * (file-size refactor).
 */

import { useMemo } from 'react';
import type { SavedLexicalItemRecord } from '@langplayer/shared';
import { kanaFormsForEntries } from '@langplayer/utils';
import { baseCode } from '@/lib/language-data';
import { getCachedEntries } from '@/lib/dictionary-cache';

/**
 * Every saved form (head + inflections + per-instance surface) that could
 * span multiple tokens. The merge in TokenizedText collapses exact
 * token-boundary matches into one atomic token so multi-token phrases (e.g.
 * "got even with me" saved under "to get even with someone") highlight as
 * saved in the review context.
 */
export function useSavedPhraseCandidates(
  savedWords: Record<string, SavedLexicalItemRecord[]>,
  l2Code: string,
): string[] {
  return useMemo(() => {
    const words = savedWords[l2Code] ?? [];
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (form: string) => {
      const key = form.toLowerCase();
      if (!form.trim() || seen.has(key)) return;
      seen.add(key);
      out.push(form);
    };
    for (const w of words) {
      for (const f of w.forms) add(f);
      if (w.context?.form) add(w.context.form);
      for (const inst of w.instances ?? []) if (inst.form) add(inst.form);
    }
    return out;
  }, [savedWords, l2Code]);
}

/**
 * Kana/alternate surfaces of the highlight terms' dictionary entries (e.g.
 * 然るべき → しかるべき): the bridge between a kanji headword and a kana
 * surface in the context sentence. Recomputes when the enqueued term
 * lookups resolve (cacheVersion).
 */
export function useHighlightKanaForms(
  highlightForm: string | undefined,
  highlightForms: string[] | undefined,
  l2Code: string,
  cacheVersion: number,
): string[] {
  return useMemo(() => {
    const base = baseCode(l2Code);
    const terms = [
      ...(highlightForm ? [highlightForm] : []),
      ...(highlightForms ?? []),
    ];
    const out: string[] = [];
    for (const term of terms) {
      for (const form of kanaFormsForEntries(getCachedEntries(base, term))) {
        if (!out.includes(form)) out.push(form);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightForm, highlightForms, l2Code, cacheVersion]);
}
