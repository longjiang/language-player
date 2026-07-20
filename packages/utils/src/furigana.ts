/**
 * Japanese furigana (ruby text) generation.
 *
 * Takes a mixed kanji/kana word and its reading (katakana or hiragana),
 * and segments it into kanji↔reading pairs suitable for <ruby>/<rt> rendering.
 *
 * Based on Classic's map-kana.js and GO's furigana.ts.
 */

export interface FuriganaSegment {
  /** Surface form (kanji or kana) */
  text: string;
  /** Phonetic reading in hiragana */
  pronunciation: string;
  /** Whether this segment is kanji (true) or kana (false) */
  type: 'kanji' | 'non-kanji';
}

/** Convert a katakana string to hiragana, handling chōonpu (long vowel marks).
 *
 * Basic katakana are shifted by the Unicode offset (U+30A1→U+3041).
 * The prolonged sound mark `ー` (U+30FC) is resolved by inspecting the
 * vowel of the preceding kana and mapping to the standard orthographic
 * hiragana long vowel:
 *
 *   a-dan → あ    i-dan → い    u-dan → う
 *   e-dan → い    o-dan → う
 *
 * e.g. ヘー → へい, コー → こう, カー → かあ
 */
export function katakanaToHiragana(str: string): string {
  let result = '';
  for (const ch of str) {
    if (ch === 'ー') {
      const vowel = getLastKanaVowel(result);
      result += vowel ? LONG_VOWEL_HIRAGANA[vowel]! : 'ー';
    } else if (ch >= '\u30A1' && ch <= '\u30F6') {
      result += String.fromCharCode(ch.charCodeAt(0) - 0x60);
    } else {
      result += ch;
    }
  }
  return result;
}

// ── Chōonpu → hiragana long vowel mapping ──

/** Maps a kana vowel to its orthographic hiragana long vowel.
 *  e-dan uses い (へい), o-dan uses う (こう) per standard modern orthography. */
const LONG_VOWEL_HIRAGANA: Record<string, string> = {
  a: 'あ',
  i: 'い',
  u: 'う',
  e: 'い',
  o: 'う',
};

/** Determine the vowel (a/i/u/e/o) of a kana character.
 *  Returns null for non-kana characters. */
function getKanaVowel(ch: string): string | null {
  return KANA_VOWEL_MAP[ch] ?? null;
}

/** Scan backwards through a partially-converted string to find
 *  the vowel of the most recent kana character. */
function getLastKanaVowel(str: string): string | null {
  for (let i = str.length - 1; i >= 0; i--) {
    const vowel = getKanaVowel(str[i]!);
    if (vowel !== null) return vowel;
  }
  return null;
}

// ── Kana → vowel lookup table ──
// Covers hiragana + katakana (including dakuten/handakuten and small kana).

const HIRAGANA_A = 'あかさたなはまやらわがざだばぱ';
const HIRAGANA_I = 'いきしちにひみりぎじぢびぴ';
const HIRAGANA_U = 'うくすつぬふむゆるぐずづぶぷゔ';
const HIRAGANA_E = 'えけせてねへめれげぜでべぺ';
const HIRAGANA_O = 'おこそとのほもよろをごぞどぼぽ';

const KATAKANA_A = 'アカサタナハマヤラワガザダバパ';
const KATAKANA_I = 'イキシチニヒミリギジヂビピ';
const KATAKANA_U = 'ウクスツヌフムユルグズヅブプヴ';
const KATAKANA_E = 'エケセテネヘメレゲゼデベペ';
const KATAKANA_O = 'オコソトノホモヨロヲゴゾドボポ';

// Small kana — inherit the vowel of their full-size counterpart
const SMALL_HIRAGANA_A = 'ぁ';        // small a
const SMALL_HIRAGANA_I = 'ぃ';        // small i
const SMALL_HIRAGANA_U = 'ぅ';        // small u
const SMALL_HIRAGANA_E = 'ぇ';        // small e
const SMALL_HIRAGANA_O = 'ぉ';        // small o
const SMALL_HIRAGANA_YA = 'ゃ';       // ya → a-dan
const SMALL_HIRAGANA_YU = 'ゅ';       // yu → u-dan
const SMALL_HIRAGANA_YO = 'ょ';       // yo → o-dan
const SMALL_HIRAGANA_TSU = 'っ';      // sokuon (no vowel — skip, keep ー)
const SMALL_KATAKANA_A = 'ァ';
const SMALL_KATAKANA_I = 'ィ';
const SMALL_KATAKANA_U = 'ゥ';
const SMALL_KATAKANA_E = 'ェ';
const SMALL_KATAKANA_O = 'ォ';
const SMALL_KATAKANA_YA = 'ャ';
const SMALL_KATAKANA_YU = 'ュ';
const SMALL_KATAKANA_YO = 'ョ';
const SMALL_KATAKANA_TSU = 'ッ';

const KANA_VOWEL_MAP: Record<string, string> = {};

function buildVowelMap(): void {
  const add = (chars: string, vowel: string) => {
    for (const ch of chars) KANA_VOWEL_MAP[ch] = vowel;
  };
  // Hiragana
  add(HIRAGANA_A, 'a'); add(HIRAGANA_I, 'i'); add(HIRAGANA_U, 'u');
  add(HIRAGANA_E, 'e'); add(HIRAGANA_O, 'o');
  // Katakana
  add(KATAKANA_A, 'a'); add(KATAKANA_I, 'i'); add(KATAKANA_U, 'u');
  add(KATAKANA_E, 'e'); add(KATAKANA_O, 'o');
  // Small kana (vowel inherited from full-size counterpart)
  add(SMALL_HIRAGANA_A + SMALL_KATAKANA_A, 'a');
  add(SMALL_HIRAGANA_I + SMALL_KATAKANA_I, 'i');
  add(SMALL_HIRAGANA_U + SMALL_KATAKANA_U, 'u');
  add(SMALL_HIRAGANA_E + SMALL_KATAKANA_E, 'e');
  add(SMALL_HIRAGANA_O + SMALL_KATAKANA_O, 'o');
  // Small ya/yu/yo
  add(SMALL_HIRAGANA_YA + SMALL_KATAKANA_YA, 'a');
  add(SMALL_HIRAGANA_YU + SMALL_KATAKANA_YU, 'u');
  add(SMALL_HIRAGANA_YO + SMALL_KATAKANA_YO, 'o');
  // Sokuon (っ/ッ) — no vowel, explicitly excluded so ー after ッ is not resolved
}
buildVowelMap();

// ── Unicode range checks (no external dependencies) ──

function isKanjiChar(ch: string): boolean {
  return ch >= '\u4e00' && ch <= '\u9faf';
}

function isHiraganaChar(ch: string): boolean {
  return ch >= '\u3040' && ch <= '\u309f';
}

// ── Segmentation ──

/**
 * Split mixed kanji/kana text into alternating kanji and non-kanji runs.
 * Each run preserves the original surface form, while internally normalizing
 * katakana→hiragana for the reading (used during regex matching).
 */
function segmentRuns(text: string): FuriganaSegment[] {
  const normalized = katakanaToHiragana(text);
  const regex = /([\u4e00-\u9faf]+|[^\u4e00-\u9faf]+)/g;
  const normMatches = normalized.match(regex);
  const origMatches = text.match(regex);

  if (!normMatches || !origMatches) return [];

  const segments: FuriganaSegment[] = [];
  for (let i = 0; i < normMatches.length; i++) {
    const firstChar = normMatches[i]![0]!;
    segments.push({
      type: isKanjiChar(firstChar) ? 'kanji' : 'non-kanji',
      text: origMatches[i]!,
      pronunciation: normMatches[i]!,
    });
  }
  return segments;
}

// ── Regex builder ──

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a regex that captures readings for each kanji segment
 * while matching non-kanji segments literally.
 *
 * e.g., segments: [kanji:"食", non-kanji:"パン"]
 *        → /(.+)(ぱん)/
 * The captured groups are then mapped back to the segments.
 */
function buildCaptureRegex(segments: FuriganaSegment[]): RegExp {
  let pattern = '';
  for (const seg of segments) {
    if (seg.type === 'kanji') {
      pattern += '(.+)';
    } else {
      pattern += `(${escapeRegex(seg.pronunciation)})`;
    }
  }
  return new RegExp(pattern);
}

// ── Ruby segment interface ──

/** A segment of ruby-annotated text. Framework-agnostic — renderers map these
 *  to <ruby>/<rt> (HTML), NSAttributedString (iOS), or SpannableString (Android). */
export interface RubySegment {
  /** The base text to display. */
  text: string;
  /** Phonetic reading to display above the text.
   *  When undefined, this segment renders as plain text (no ruby). */
  reading?: string;
}

// ── Main algorithm ──

/**
 * Match a Japanese word's kanji/kana surface form against its reading
 * to produce segmented kanji↔furigana pairs.
 *
 * @param text - Surface form (mixed kanji/kana, e.g. "食パン")
 * @param reading - Phonetic reading (katakana or hiragana, e.g. "ショクパン")
 * @returns Segments with per-kanji furigana readings.
 *
 * @example
 * matchHiragana({ text: "朝ご飯", reading: "あさごはん" })
 * // [{ text:"朝", pronunciation:"あさ", type:"kanji" },
 * //  { text:"ご", pronunciation:"ご", type:"non-kanji" },
 * //  { text:"飯", pronunciation:"はん", type:"kanji" }]
 *
 * matchHiragana({ text: "食べ物", reading: "たべもの" })
 * // [{ text:"食", pronunciation:"た", type:"kanji" },
 * //  { text:"べ", pronunciation:"べ", type:"non-kanji" },
 * //  { text:"物", pronunciation:"もの", type:"kanji" }]
 *
 * matchHiragana({ text: "乗り遅れる", reading: "のりおくれる" })
 * // [{ text:"乗", pronunciation:"の", type:"kanji" },
 * //  { text:"り", pronunciation:"り", type:"non-kanji" },
 * //  { text:"遅", pronunciation:"おく", type:"kanji" },
 * //  { text:"れる", pronunciation:"れる", type:"non-kanji" }]
 */
export function matchHiragana({
  text,
  reading,
}: {
  text: string;
  reading: string;
}): FuriganaSegment[] {
  // Normalize reading to hiragana if it's in katakana
  if (reading.length > 0 && !isHiraganaChar(reading[0]!)) {
    reading = katakanaToHiragana(reading);
  }

  const segments = segmentRuns(text);
  const regex = buildCaptureRegex(segments);
  const matchResult = reading.match(regex);

  if (matchResult) {
    const capturedReadings = matchResult.slice(1);
    for (let i = 0; i < segments.length; i++) {
      segments[i]!.pronunciation = capturedReadings[i]!;
    }
    return segments;
  }

  // Fallback: unsegmented (regex didn't match — rare edge case)
  return [{ text, pronunciation: reading, type: 'kanji' }];
}

// ── Framework-agnostic ruby builder ──

/**
 * Build ruby segments from a token's text and pronunciation.
 *
 * Unlike renderRuby() in the React component, this returns pure data —
 * no JSX, no React dependency. Every platform maps RubySegment[] to its
 * own rendering primitives:
 *
 *   Web (React):    <ruby>seg.text<rt>seg.reading</rt></ruby>
 *   Web (vanilla):  el.innerHTML = '<ruby>...<rt>...</rt></ruby>'
 *   iOS:            NSAttributedString with ruby annotations
 *   Android:        SpannableString with RubySpan
 *
 * @param text - Surface form (e.g. "食パン", "你好")
 * @param pronunciation - Phonetic reading (e.g. "ショクパン", "nǐ hǎo")
 * @param l2Code - ISO 639-1 language code (ja, zh, yue, etc.)
 * @returns Segments with optional readings for ruby annotation.
 */
export function buildRuby(
  text: string,
  pronunciation: string,
  l2Code: string,
): RubySegment[] {
  const base = l2Code.split('-')[0]!;

  // ── Japanese: segment kanji from kana, show furigana only above kanji ──
  if (base === 'ja') {
    // Skip ruby entirely for words with no kanji (pure kana)
    if (!/[一-龯]/.test(text)) {
      return [{ text }];
    }
    const segments = matchHiragana({ text, reading: pronunciation });
    return segments.map((seg) => ({
      text: seg.text,
      reading: seg.type === 'kanji' && seg.pronunciation !== seg.text
        ? seg.pronunciation
        : undefined,
    }));
  }

  // ── Chinese / Cantonese: word-level pinyin/jyutping ──
  if (base === 'zh' || base === 'yue') {
    return [{ text, reading: pronunciation }];
  }

  // ── Other languages with pronunciation (Arabic, Persian, etc.) ──
  return [{ text, reading: pronunciation }];
}
