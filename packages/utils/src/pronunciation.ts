/**
 * Centralized pronunciation formatting for dictionary entries.
 *
 * All output uses [...] bracket notation.
 *
 * Language-specific priorities:
 *   ja  → pitch-accented kana + accented romaji if pitch data available,
 *          else kana > romanization > pronunciation
 *   zh, yue → pinyin (tone-marked) > pronunciation
 *   ko  → romanization > pronunciation
 *   other → ipa > romanization > pronunciation
 */
import type { DictionaryEntry } from '@langplayer/shared';
import { formatJapanesePron, circledPattern } from './pitch-accent';

/**
 * Compile a pronunciation string from a dictionary entry.
 *
 * Returns e.g.:
 *   "[なごり↓ nagorí]"  — Japanese with pitch accent
 *   "[なごり]"           — Japanese without pitch (kana only)
 *   "[nǐ hǎo]"          — Chinese pinyin (tone-marked)
 *   "[nagori]"          — fallback romaji
 *   "[ipa]" / "[rom]"   — other languages
 *
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

  // ── Japanese: pitch-accented kana + romaji, or kana, or romaji ──
  if (l2Code === 'ja') {
    // Pitch accent available → [かꜜつ, kátsu]③
    if (pd?.kana && pd?.pitch_accent?.length) {
      const p = pd.pitch_accent[0]!;
      const romaji = entry.pronunciation || '';
      return `[${formatJapanesePron(pd.kana, romaji, p)}]${circledPattern(p)}`;
    }
    // Kana without pitch
    if (pd?.kana) return `[${pd.kana}]`;
    // Fallbacks
    if (pd?.romanization) return `[${pd.romanization}]`;
    if (pd?.romaji) return `[${pd.romaji}]`;
    if (pron) return `[${pron}]`;
  }

  // ── Chinese (Mandarin & Cantonese): pinyin (tone-marked from API) ──
  if (l2Code === 'zh' || l2Code === 'yue') {
    if (pd?.pinyin) return `[${pd.pinyin}]`;
    if (l2Code === 'yue' && pd?.jyutping) return `[${pd.jyutping}]`;
    if (pron) return `[${pron}]`;
  }

  // ── Korean: romanization ──
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
