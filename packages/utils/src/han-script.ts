/**
 * Byeonggi resolution — the hanja (ko) / hán tự (vi) annotation shown after a
 * word in tokenized text (setting: `l2[code].display.byeonggi`).
 *
 * Both platforms share this module so the rules cannot drift (ADR-0003: logic
 * is shared, views are not).
 *
 * Rules (2026-09-09, ADR-0042-adjacent — see ARCH-017 "Byeonggi source"):
 *
 *   1. Per-language field, never the generic `alternate` string:
 *        ko → `han_script.hanja`   (kengdic stores the hanja column there)
 *        vi → `han_script.han`     (`hantu` is the same string; fallback only)
 *      `alternate` is deliberately NOT used: for Japanese it holds the kana
 *      reading and for Chinese the other script form.
 *   2. Only exact matches count. If a word has several exact matches whose raw
 *      hanja values differ — including matches with no hanja at all — we are
 *      not confident which one is right, so nothing is shown. (e.g. kengdic
 *      `가` → 家 on 1 of 3 rows, `고` → 犒 on 2 of 3.)
 *   3. A saved word wins over rule 2: the entry the user actually saved carries
 *      the sense they chose, so its hanja is authoritative.
 *   4. A comma-separated value is a kengdic homograph list (848 rows, up to 10
 *      alternatives, e.g. `시사` → `時事,示唆,試寫,詩史`). It overrides rules 2
 *      and 3 — the token gets no hanja at all.
 *   5. The value must actually be Han script. kengdic's column also carries
 *      hangul synonyms (`애` → `아이`), romanizations (`버스` → `bus`) and
 *      mixed forms (`식전술` → `食前술`); those are not hanja.
 */

import type { DictionaryEntry } from '@langplayer/shared';

/** Han ideographs (incl. CJK Ext-A / compatibility) plus the iteration mark 々. */
const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3005]/;
/** Hangul syllables / jamo / compatibility jamo. */
const HANGUL_RE = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF]/;
const LATIN_RE = /[A-Za-z]/;
/**
 * Characters kengdic legitimately mixes with hanja: hyphens used as "unknown
 * character" placeholders (`당좌 예금` → `當座-預金`), spaces, and CJK
 * punctuation. Anything else (digits, `~`, `*`, …) makes the value suspect.
 */
const HAN_ALLOWED_RE = /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3005\s\u3000\-\u2010-\u2015、。，・·]+$/;

/** Languages whose byeonggi field this module resolves. */
export type ByeonggiBase = 'ko' | 'vi';

/**
 * The raw per-language byeonggi field of an entry, before validation.
 * Returns null for languages without a byeonggi annotation or entries that
 * carry no value.
 */
export function rawByeonggi(entry: DictionaryEntry, base: string): string | null {
  const hs = entry.han_script;
  if (!hs) return null;
  if (base === 'ko') return hs.hanja ?? null;
  if (base === 'vi') return hs.han ?? hs.hantu ?? null;
  return null;
}

/**
 * Validate a raw byeonggi value for display, or null when it must not be shown.
 * `base` selects the language-specific rules (the kengdic comma list is
 * Korean-only — Vietnamese hán tự can legitimately contain `，`).
 */
export function normalizeByeonggi(
  raw: string | null | undefined,
  base: ByeonggiBase,
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  // Rule 4 — kengdic homograph list: we cannot tell which hanja applies.
  if (base === 'ko' && value.includes(',')) return null;
  // Rule 5 — must be Han script (no hangul synonyms, romanizations, mixed forms).
  if (!HAN_RE.test(value)) return null;
  if (HANGUL_RE.test(value) || LATIN_RE.test(value)) return null;
  if (!HAN_ALLOWED_RE.test(value)) return null;
  return value;
}

/**
 * Resolve the byeonggi string for one token from its dictionary matches.
 *
 * @param base       L2 base code (`l2Code.split('-')[0]`)
 * @param entries    Every dictionary entry cached for the token's lookup key
 *                   (lemma or surface form), in match order
 * @param savedEntry The entry the user saved for this token, when resolvable
 * @returns The hanja / hán tự to display, or null when nothing is confident
 */
export function resolveByeonggi({
  base,
  entries,
  savedEntry,
}: {
  base: string;
  entries: DictionaryEntry[] | null | undefined;
  savedEntry?: DictionaryEntry | null;
}): string | null {
  if (base !== 'ko' && base !== 'vi') return null;

  // Rule 3 — the saved word's entry is authoritative (its own comma list /
  // non-hanja value still suppresses the annotation via normalizeByeonggi).
  if (savedEntry) {
    return normalizeByeonggi(rawByeonggi(savedEntry, base), base);
  }

  if (!entries || entries.length === 0) return null;

  // Rule 2 — compare the raw values of every exact match. Successful batch
  // lookups mark their entries `exact`; single-word lookups may return fuzzy
  // matches only, in which case those are the best available evidence.
  const exact = entries.filter((e) => e.match_type === 'exact');
  const candidates = exact.length > 0 ? exact : entries;

  const values = new Set<string>();
  for (const entry of candidates) {
    values.add(rawByeonggi(entry, base) ?? '');
  }
  // More than one distinct raw value (a missing value counts as one) means we
  // cannot pick a hanja for this word.
  if (values.size !== 1) return null;

  return normalizeByeonggi([...values][0], base);
}
