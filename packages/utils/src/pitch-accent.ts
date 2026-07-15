/**
 * Japanese pitch accent utilities.
 *
 * Ported from Classic's lib/utils/japanese.js.
 * Handles mora splitting and accent pattern application for kana strings.
 *
 * The pitch accent number follows the standard Japanese dictionary convention:
 *   0 = 平板型 (heiban) — low-high, no drop
 *   1 = 頭高型 (atamadaka) — high-low, drops after first mora
 *   N = 中高型 (nakadaka) — low-high...-low, drops after N-th mora
 *
 * Example:
 *   はし (hashi) with pattern 0: は↑し  (bridge, heiban)
 *   はし (hashi) with pattern 1: は↓し  (chopsticks, atamadaka)
 *   はし (hashi) with pattern 2: は↑し↓ (edge, nakadaka)
 *
 * Usage:
 *   import { splitIntoMoras, applyPitchAccent } from '@langplayer/utils';
 *   const moras = splitIntoMoras('たべる');
 *   const marked = applyPitchAccent(moras, 2); // 'た↑べ↓る'
 */

/** Small kana that attach to the preceding mora. */
const SMALL_KANA = new Set([
  'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ',
  'ゃ', 'ゅ', 'ょ',
  'ゎ', 'ゕ', 'ゖ',
]);

/**
 * Split a hiragana string into individual moras.
 * Small kana (ゃ, ゅ, ょ, etc.) attach to the preceding character.
 *
 *   たべる  → ['た', 'べ', 'る']
 *   きょう → ['きょ', 'う']
 */
export function splitIntoMoras(hiragana: string): string[] {
  const moras: string[] = [];
  let current = '';
  for (let i = 0; i < hiragana.length; i++) {
    const c = hiragana.charAt(i);  // .charAt() returns '' for OOB, avoiding undefined
    if (SMALL_KANA.has(c)) {
      current += c;
    } else {
      if (current) moras.push(current);
      current = c;
    }
  }
  if (current) moras.push(current);
  return moras;
}

/** Marker characters for pitch accent display. */
export const PITCH_UP = '\u2191';   // ↑ — pitch rises here
export const PITCH_DOWN = '\ua71c'; // ꜜ — pitch drops here (modifier letter)

/** Circled numbers ①–⑨ for pattern display. */
const CIRCLED: Record<number, string> = {
  0: '\u24ea', 1: '\u2460', 2: '\u2461', 3: '\u2462', 4: '\u2463',
  5: '\u2464', 6: '\u2465', 7: '\u2466', 8: '\u2467', 9: '\u2468',
};

/** Get a circled digit for a pattern number. Numbers > 9 shown as-is. */
export function circledPattern(pattern: number): string {
  return CIRCLED[pattern] ?? String(pattern);
}

/**
 * Apply a pitch accent pattern to an array of moras.
 *
 * Pattern convention:
 *   0 = heiban — low-high, never drops (first mora marked with ↑)
 *   1 = atamadaka — high-low, drops after first mora (first mora marked with ↓)
 *   N ≥ 2 = nakadaka — low-high...-low, drops after N-th mora
 *            (first mora ↑, N-th mora gets ↓)
 *
 * Returns a single string with ↑↓ markers inserted.
 */
export function applyPitchAccent(moras: string[], pattern: number): string {
  let result = '';
  for (let i = 0; i < moras.length; i++) {
    result += moras[i];
    if (pattern === 0 && i === 0) {
      result += PITCH_UP;
    } else if (pattern === 1 && i === 0) {
      result += PITCH_DOWN;
    } else if (pattern >= 2) {
      if (i === 0) {
        result += PITCH_UP;
      }
      if (i === pattern - 1) {
        result += PITCH_DOWN;
      }
    }
  }
  return result;
}

/**
 * Apply pitch accent patterns to kana and return all variants.
 *
 * @param kana — the word in hiragana
 * @param patterns — array of accent pattern numbers (e.g., [0, 3])
 * @returns array of marked strings, one per pattern
 */
export function addPitchAccent(kana: string, patterns: number[]): string[] {
  const moras = splitIntoMoras(kana);
  return patterns.map((p) => applyPitchAccent(moras, p));
}

/**
 * Apply a pitch accent pattern showing ONLY the downstep (↓).
 * For compact display where ↑ rise markers are omitted.
 * Pattern 0 (heiban): no marker.
 */
export function applyDownstepOnly(moras: string[], pattern: number): string {
  if (pattern === 0) return moras.join('');
  let result = '';
  for (let i = 0; i < moras.length; i++) {
    result += moras[i];
    if (i === pattern - 1) {
      result += PITCH_DOWN;
    }
  }
  return result;
}

/** Build compact kana+romaji pronunciation string for Japanese.
 *  Pattern 0 (heiban): 'kana, romaji'
 *  Pattern ≥1:        'kana↓, romají'
 *
 *  The outer [...] brackets are added by formatPronunciation().
 */
export function formatJapanesePron(
  kana: string,
  romaji: string,
  pattern: number,
): string {
  const moras = splitIntoMoras(kana);
  const kanaPart = applyDownstepOnly(moras, pattern);
  const romaPart = applyRomajiAccent(kana, romaji, pattern);
  return `${kanaPart}, ${romaPart}`;
}

// ── Romaji accent mark ────────────────────────────────────────

/** Acute accent mapping for romaji vowels at the downstep position. */
const ACCENTED_VOWELS: Record<string, string> = {
  'a': 'á', 'e': 'é', 'i': 'í', 'o': 'ó', 'u': 'ú',
  'A': 'Á', 'E': 'É', 'I': 'Í', 'O': 'Ó', 'U': 'Ù',
};

/**
 * Apply a pitch accent mark (acute accent) to the romaji at the downstep.
 *
 * Pattern 0 (heiban): no accent — returns romaji unchanged.
 * Pattern 1 (atamadaka): accent on first syllable.
 * Pattern N ≥ 2 (nakadaka): accent on N-th syllable.
 *
 * Syllable boundaries are estimated proportionally from kana mora count.
 */
export function applyRomajiAccent(kana: string, romaji: string, pattern: number): string {
  if (pattern === 0) return romaji;

  const moras = splitIntoMoras(kana);
  const moraCount = moras.length;
  const accentedMoraIndex = pattern - 1;

  if (accentedMoraIndex < 0 || accentedMoraIndex >= moraCount) return romaji;

  // Estimate syllable boundaries proportionally
  const syllableStarts: number[] = [0];
  for (let i = 1; i < moraCount; i++) {
    syllableStarts.push(Math.round((i / moraCount) * romaji.length));
  }
  syllableStarts.push(romaji.length);

  const start = syllableStarts[accentedMoraIndex] ?? 0;
  const end = syllableStarts[accentedMoraIndex + 1] ?? romaji.length;

  // Find first vowel in the syllable and accent it
  for (let i = start; i < end; i++) {
    const ch = romaji.charAt(i);
    if (ACCENTED_VOWELS[ch]) {
      return romaji.slice(0, i) + ACCENTED_VOWELS[ch] + romaji.slice(i + 1);
    }
  }

  return romaji;
}
