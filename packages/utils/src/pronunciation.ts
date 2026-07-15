/**
 * Centralized pronunciation formatting for dictionary entries.
 *
 * All output uses [...] bracket notation.
 *
 * Language-specific priorities:
 *   ja      → kana > romanization > pronunciation (romaji)
 *   zh, yue → pinyin > pronunciation
 *   ko      → romanization > pronunciation
 *   other   → ipa > romanization > pronunciation
 */
import type { DictionaryEntry } from '@langplayer/shared';

/**
 * Compile a pronunciation string from a dictionary entry.
 * Returns e.g. "[ní hǎo]" for Chinese, "[たべる]" for Japanese,
 * or "[romanization]" / "[ipa]" for other languages.
 * Returns null if no pronunciation data is available.
 */
export function formatPronunciation(
  entry: DictionaryEntry | null | undefined,
  l2Code: string,
): string | null {
  if (!entry) return null;

  const pd = entry.phonetic_detail;
  const pron = entry.pronunciation && entry.pronunciation !== entry.head
    ? entry.pronunciation
    : null;

  // ── Japanese: prefer kana (hiragana/katakana) ──
  if (l2Code === 'ja') {
    if (pd?.kana) return `[${pd.kana}]`;
    if (pd?.romanization) return `[${pd.romanization}]`;
    if (pd?.romaji) return `[${pd.romaji}]`;
    if (pron) return `[${pron}]`;
  }

  // ── Chinese (Mandarin & Cantonese): prefer pinyin ──
  if (l2Code === 'zh' || l2Code === 'yue') {
    if (pd?.pinyin) return `[${pd.pinyin}]`;
    // jyutping for Cantonese
    if (l2Code === 'yue' && pd?.jyutping) return `[${pd.jyutping}]`;
    if (pron) return `[${pron}]`;
  }

  // ── Korean: prefer romanization ──
  if (l2Code === 'ko') {
    if (pd?.romanization) return `[${pd.romanization}]`;
    if (pron) return `[${pron}]`;
  }

  // ── Other languages: IPA > romanization > pronunciation ──
  if (pd?.ipa) return `[${pd.ipa}]`;
  if (pd?.romanization) return `[${pd.romanization}]`;
  if (pron) return `[${pron}]`;

  return null;
}
