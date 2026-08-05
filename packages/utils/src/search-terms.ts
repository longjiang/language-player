/**
 * Search-term generation for the /subs-search endpoint.
 *
 * Terms are matched as substrings against subtitle lines (`subs_l2 ILIKE
 * '%term%'`), so a shorter term matches every line a longer one would — as
 * long as it stays specific enough. These helpers turn a dictionary entry
 * into the minimal term set that still matches the same subtitle lines.
 */

/** The entry fields we care about when building written search terms. */
export interface WrittenFormEntry {
  head: string;
  alternate?: string | null;
  han_script?: {
    simplified?: string;
    traditional?: string;
    kanji?: string | null;
    hanja?: string | null;
    hangul?: string;
    han?: string;
    hantu?: string;
  } | null;
  phonetic_detail?: {
    kana?: string;
  } | null;
}

/**
 * Collect the written forms of a dictionary entry that can actually appear
 * in subtitle text:
 * - the head form
 * - alternate script(s): traditional Chinese, kana reading, hanja, …
 * - `han_script` variants
 * - the kana reading for Japanese (hiragana/katakana IS written in subs)
 *
 * Explicitly excludes phonetic guides (IPA, romaji, pinyin, jyutping, …) —
 * those never appear in subtitle text and would pollute the search.
 */
export function writtenFormVariants(
  entry: WrittenFormEntry,
  l2Code: string,
): string[] {
  const base = (l2Code.split('-')[0] ?? l2Code).toLowerCase();
  const out: string[] = entry.head ? [entry.head] : [];
  const push = (value?: string | null) => {
    if (!value || value === entry.head || out.includes(value)) return;
    out.push(value);
  };

  push(entry.alternate);

  const hs = entry.han_script;
  if (hs) {
    push(hs.simplified);
    push(hs.traditional);
    push(hs.kanji);
    push(hs.hanja);
    push(hs.hangul);
    push(hs.han);
    push(hs.hantu);
  }

  // Japanese: the kana reading is the native script of the subtitles.
  if (base === 'ja' && entry.phonetic_detail?.kana) {
    push(entry.phonetic_detail.kana);
  }

  return out.length ? out : [entry.head];
}

/**
 * Drop terms that contain another term. Under substring search the shorter
 * term already matches every line the longer one would, so the longer one is
 * redundant (e.g. "running" → "run").
 */
export function minimalSearchTerms(terms: string[]): string[] {
  const unique = [...new Set(terms)].filter((t) => t.length > 0);
  return unique.filter(
    (term) => !unique.some((other) => other !== term && term.includes(other)),
  );
}

export interface ReduceSearchTermsOptions {
  /** Written variants (kana, traditional script, …) — always kept separately. */
  variants?: string[];
  /** Inflected/conjugated forms from the backend. */
  inflected?: string[];
}

/**
 * Build the minimal substring-search term set for a headword:
 *
 * 1. The exact head word is always searched. Searching it is a substring
 *    match (`subs_l2 ILIKE '%term%'`), so any inflected form that CONTAINS
 *    the head (e.g. "running" contains "run") is already captured and is
 *    dropped — we never shorten the head to a looser partial like "ma" or
 *    食.
 * 2. Forms the head cannot capture (e.g. "made" from "make", "ran" from
 *    "run", 食べた from 食べる) stay as their own terms, so nothing is lost.
 * 3. Written variants (kana, traditional script, …) are merged in and
 *    redundant substrings are removed.
 */
export function reduceSearchTerms(
  head: string,
  options: ReduceSearchTermsOptions = {},
): string[] {
  const { variants = [], inflected = [] } = options;
  const pruned = minimalSearchTerms([head, ...inflected, ...variants]);
  // Never drop the exact head word, even if some form is a substring of it.
  return pruned.includes(head) ? pruned : [head, ...pruned];
}
