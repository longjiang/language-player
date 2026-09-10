/**
 * Centralized pronunciation formatting for dictionary entries.
 *
 * All output uses [...] bracket notation.
 *
 * Language-specific priorities:
 *   ja  → kana ALWAYS paired with romaji. With pitch-accent data the kana
 *          carries the ↓ downstep, the romaji takes the accented vowel, and the
 *          circled pattern number is appended; without pitch data the same pair
 *          is shown plainly. Kana-less entries fall back to
 *          romanization > pronunciation > ipa.
 *   zh, yue → pinyin (tone-marked) > pronunciation
 *   ko  → romanization > pronunciation
 *   th  → Paiboon+ romanization (tone-marked) > pronunciation > IPA
 *   other → ipa > romanization > pronunciation
 */
import type { DictionaryEntry } from '@langplayer/shared';
import { formatJapanesePron, circledPattern } from './pitch-accent';

/**
 * Grammatical labels Wiktionary sometimes prepends to a pronunciation field
 * ("bound form, pra˨˩.tʰeːt̚˥˩, ..." → "pra˨˩.tʰeːt̚˥˩, ..."). They are not
 * part of the reading and must never be shown in ruby or the popup.
 */
const PRON_LABEL_RE = /^(?:bound form|classifier|prefix|suffix|particle|determiner|interjection|conjunction|preposition|pronoun|numeral|adverb|adjective|verb|noun|formal|informal|colloquial|slang|archaic|obsolete|rare|literary|poetic|UK|US)\s*,\s*/i;

/**
 * Strip trailing pronunciation source labels that some dictionary exports
 * embed in the pronunciation field ("t͡ɕaːk̚˨˩, wiki.local" → "t͡ɕaːk̚˨˩")
 * and leading grammatical labels ("bound form, ..." → "...").
 */
export function cleanPronunciation(
  pron: string | null | undefined,
): string | null {
  if (!pron) return null;
  let cleaned = pron.trim().replace(PRON_LABEL_RE, '');
  cleaned = cleaned.replace(/,?\s*wiki\.local\s*$/i, '').trim();
  // Trailing periods are artifacts of Wiktionary list markup ("...sa˨˩.").
  cleaned = cleaned.replace(/[.\s]+$/, '');
  return cleaned || null;
}

/**
 * Compile a pronunciation string from a dictionary entry.
 *
 * Returns e.g.:
 *   "[のこりꜜ, nokorí]③" — Japanese with pitch accent
 *   "[おべっか, obekka]" — Japanese without pitch data (kana + romaji)
 *   "[おべっか]" — Japanese kana with no romaji anywhere
 *   "[nǐ hǎo]" — Chinese pinyin (tone-marked)
 *   "[nagori]" — fallback romaji
 *   "[sà-wàt-dii]" — Thai Paiboon+ (tone-marked romanization)
 *   "[ipa]" / "[rom]" — other languages
 *
 * Returns null if no pronunciation data is available.
 */
export function formatPronunciation(
  entry: DictionaryEntry | null | undefined,
  l2Code: string,
): string | null {
  if (!entry) return null;

  const pd = entry.phonetic_detail;
  const pron = cleanPronunciation(
    entry.pronunciation && entry.pronunciation !== entry.head
      ? entry.pronunciation
      : null,
  );

  // ── Japanese: kana always shown together with romaji ──
  // Both halves carry information the other cannot: the kana is where the
  // pitch markers sit, the romaji is what a learner can actually read before
  // kana is fluent — so romaji is NOT gated on pitch-accent data.
  // Romaji source: `pronunciation` (EDICT's romaji column, which the API also
  // mirrors into `phonetic_detail.romaji`), then the phonetic_detail copies.
  if (l2Code === 'ja') {
    const kana = cleanPronunciation(pd?.kana);
    if (kana) {
      const romaji =
        pron ?? cleanPronunciation(pd?.romaji) ?? cleanPronunciation(pd?.romanization);
      // Pitch accent available → [かꜜつ, kátsu]③
      const pitch = pd?.pitch_accent?.[0];
      if (pitch != null) {
        return `[${formatJapanesePron(kana, romaji ?? '', pitch)}]${circledPattern(pitch)}`;
      }
      // No pitch data → [おべっか, obekka] (kana alone when no romaji exists)
      return romaji ? `[${kana}, ${romaji}]` : `[${kana}]`;
    }
    // Kana-less entries keep the historical fallback order and fall through to
    // the shared ipa/romanization tail below when nothing matches.
    if (pd?.romanization) return `[${cleanPronunciation(pd.romanization)}]`;
    if (pd?.romaji) return `[${cleanPronunciation(pd.romaji)}]`;
    if (pron) return `[${pron}]`;
  }

  // ── Chinese (Mandarin & Cantonese) ──
  // The dictionary's own pronunciation field is already the right reading:
  // cedict stores tone-marked pinyin, cccanto stores jyutping. Prefer it
  // over phonetic_detail so Cantonese never shows Mandarin pinyin by
  // default (phonetic_detail variants remain as fallbacks for sparse rows).
  if (l2Code === 'zh' || l2Code === 'yue') {
    if (pron) return `[${pron}]`;
    if (pd?.pinyin) return `[${cleanPronunciation(pd.pinyin)}]`;
    if (pd?.jyutping) return `[${cleanPronunciation(pd.jyutping)}]`;
  }

  // ── Korean: romanization ──
  if (l2Code === 'ko') {
    if (pd?.romanization) return `[${cleanPronunciation(pd.romanization)}]`;
    if (pron) return `[${pron}]`;
  }

  // ── Thai: learner romanization with tone marks, IPA as fallback ──
  if (l2Code === 'th') {
    if (pd?.romanization) return `[${cleanPronunciation(pd.romanization)}]`;
    if (pron) return `[${pron}]`;
    if (pd?.ipa) return `[${cleanPronunciation(pd.ipa)}]`;
  }

  // ── Other languages: IPA > romanization > pronunciation ──
  if (pd?.ipa) return `[${cleanPronunciation(pd.ipa)}]`;
  if (pd?.romanization) return `[${cleanPronunciation(pd.romanization)}]`;
  if (pron) return `[${pron}]`;

  return null;
}

// ── Raw readings (ruby) ──────────────────────────────────────────

/** Hiragana / katakana / prolonged sound mark — a Japanese kana reading. */
const KANA_RE = /^[\u3040-\u309F\u30A0-\u30FF\u30FC]+$/;

/**
 * The bare phonetic reading of an entry — what belongs in ruby, with no
 * brackets, pitch formatting, or word-replace decoration.
 *
 * Same per-language field priority as `formatPronunciation`, but returns the
 * raw string so `buildRuby()` can segment it:
 *
 *   ja → phonetic_detail.kana (or a kana-only `alternate`); romaji is not ruby
 *   zh, yue → pronunciation (CEDICT pinyin / CC-Canto jyutping) > phonetic_detail
 *   ko, th → phonetic_detail.romanization > pronunciation
 *   other → phonetic_detail.romanization > pronunciation > phonetic_detail.ipa
 *
 * Returns null when the entry carries no usable reading.
 */
export function entryReading(
  entry: DictionaryEntry | null | undefined,
  l2Code: string,
): string | null {
  if (!entry) return null;
  const base = l2Code.split('-')[0]!;
  const pd = entry.phonetic_detail;
  const pron = cleanPronunciation(
    entry.pronunciation && entry.pronunciation !== entry.head
      ? entry.pronunciation
      : null,
  );

  if (base === 'ja') {
    if (pd?.kana) return cleanPronunciation(pd.kana);
    // EDICT puts the kana reading of kana-only heads in `alternate`.
    if (entry.alternate && KANA_RE.test(entry.alternate)) {
      return cleanPronunciation(entry.alternate);
    }
    return null;
  }
  if (base === 'zh' || base === 'yue') {
    return pron ?? cleanPronunciation(pd?.pinyin) ?? cleanPronunciation(pd?.jyutping);
  }
  if (base === 'ko' || base === 'th') {
    return cleanPronunciation(pd?.romanization) ?? pron;
  }
  return cleanPronunciation(pd?.romanization) ?? pron ?? cleanPronunciation(pd?.ipa);
}

/**
 * Does the entry's head word match the token's surface form exactly?
 *
 * Exact match is the whole point of the saved-word reading override: it steers
 * clear of inflected languages, where a token's lemma and its surface form have
 * different readings (the dictionary head would be the wrong word to annotate).
 *
 * Chinese additionally matches either script form, because the head word may be
 * stored simplified while the text is traditional (or vice versa) — the reading
 * is the same either way.
 */
export function entryMatchesSurface(
  entry: DictionaryEntry | null | undefined,
  surface: string,
  l2Code: string,
): boolean {
  if (!entry || !surface) return false;
  if (entry.head === surface) return true;
  if (l2Code.split('-')[0] === 'zh') {
    const hs = entry.han_script;
    return (
      hs?.traditional === surface ||
      hs?.simplified === surface ||
      entry.alternate === surface
    );
  }
  return false;
}

/**
 * Reading to use for a saved word's ruby, or null to keep the lemmatizer's
 * pronunciation.
 *
 * The user saved a specific entry for this surface form, so when that entry's
 * head word IS the surface form its dictionary reading is more reliable than
 * the lemmatizer's — especially for homographs, where the user's choice pins
 * the sense (and therefore the reading).
 */
export function savedEntryReading({
  savedEntry,
  surface,
  l2Code,
}: {
  savedEntry: DictionaryEntry | null | undefined;
  surface: string;
  l2Code: string;
}): string | null {
  if (!savedEntry || !surface) return null;
  if (!entryMatchesSurface(savedEntry, surface, l2Code)) return null;
  const reading = entryReading(savedEntry, l2Code);
  // A reading identical to the surface needs no ruby (same rule the renderers
  // already apply to the lemmatizer pronunciation).
  if (!reading || reading === surface) return null;
  return reading;
}
