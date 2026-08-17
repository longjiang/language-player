/**
 * Highlight-form derivation for TokenizedText (mobile): saved multi-token
 * phrase candidates + kana/alternate surfaces of the highlight terms'
 * dictionary entries. Extracted from components/TokenizedText.tsx
 * (file-size refactor).
 */

import { useMemo } from 'react';
import type { SavedWordMeta } from '@/contexts/SavedWordsContext';
import { kanaFormsForEntries, baseCode } from '@langplayer/utils';
import { getCachedEntries } from '@/lib/dictionary-cache';

/**
 * Every saved form (head + inflections + per-instance surface) that could
 * span multiple tokens. The merge in TokenizedText collapses exact
 * token-boundary matches into one atomic token so multi-token phrases (e.g.
 * "got even with me" saved under "to get even with someone") highlight as
 * saved in the review context.
 */
export function useSavedPhraseCandidates(
  savedWords: Record<string, SavedWordMeta[]>,
  l2Code: string,
): string[] {
  return useMemo(() => {
    const words = savedWords[l2Code] ?? [];
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (form: unknown) => {
      if (typeof form !== 'string' || !form.trim()) return;
      const key = form.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(form);
    };
    for (const w of words) {
      if (w.head) add(w.head);
      if (w.forms) for (const f of w.forms) add(f);
      if (w.context?.form) add(w.context.form);
      for (const inst of w.instances ?? []) if (inst.form) add(inst.form);
    }
    return out;
  }, [savedWords, l2Code]);
}

/**
 * Kana/alternate surfaces of the highlight terms' dictionary entries (e.g.
 * 然るべき → alternate しかるべき): the bridge between a kanji headword and
 * a kana surface in the context sentence. Populated once the term lookups
 * resolve into the shared cache (cacheVersion bump).
 */
export function useHighlightKanaForms(
  highlightTerms: string[] | undefined,
  l2Code: string,
  cacheVersion: number,
): string[] {
  return useMemo(() => {
    const base = baseCode(l2Code);
    const out: string[] = [];
    for (const term of highlightTerms ?? []) {
      for (const form of kanaFormsForEntries(getCachedEntries(base, term))) {
        if (!out.includes(form)) out.push(form);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightTerms, l2Code, cacheVersion]);
}

/** highlightTerms + the kana/alternate forms of their entries. */
export function useEffectiveHighlightTerms(
  highlightTerms: string[] | undefined,
  highlightKanaForms: string[],
): string[] | undefined {
  return useMemo(() => {
    if (highlightKanaForms.length === 0) return highlightTerms;
    return [...new Set([...(highlightTerms ?? []), ...highlightKanaForms])];
  }, [highlightTerms, highlightKanaForms]);
}
