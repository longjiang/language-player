'use client';

/**
 * Small pure helpers for TokenizedText (web). Extracted from
 * components/tokenized-text.tsx (file-size refactor).
 */

/** True when a token is whitespace-only or punctuation-only — used to decide
 *  whether a quick gloss needs a trailing space to separate it from the next word. */
export function isSeparatorToken(text: string): boolean {
  const t = text.trim();
  return t === '' || /^[\p{P}]+$/u.test(t);
}

/**
 * Rough speaking-time weight for karaoke pacing, used when we have no
 * per-word timing data. CJK words: one unit per character (each hanzi/kana/
 * hangul ≈ one syllable/mora). Latin/Cyrillic/Greek: one unit per vowel
 * group. Everything else (Thai, Arabic, Hebrew, …): character count.
 * Long words keep the highlight longer; short words flip quickly.
 */
export function karaokeWordWeight(text: string): number {
  const t = text.trim();
  if (!t) return 0;

  // CJK: character count is a near-exact syllable/mora proxy.
  const cjk = t.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu);
  if (cjk && cjk.length >= t.length * 0.5) return cjk.length;

  // Latin/Cyrillic/Greek: vowel groups are a decent syllable proxy.
  const vowelGroups = t.match(/[aeiouyà-öø-ÿаеёиоуыэюяіїєæœαεηιουωάέήίόύώϊϋΐΰ]+/giu);
  if (vowelGroups && vowelGroups.length > 0) return Math.max(1, vowelGroups.length);

  // Vowel-less scripts: fall back to character count.
  const significant = t.replace(/[\s\p{P}]/gu, '');
  return significant ? Math.max(1, significant.length) : 0;
}
