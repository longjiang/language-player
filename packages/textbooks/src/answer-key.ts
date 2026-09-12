/**
 * Answer-key ingestion (SPEC-095).
 *
 * The workbook's answer key is machine-structured — `B课 ➊: ③ f; ④ c; ⑤ a; ⑥ d.`
 * — and it is the source of truth for every authored answer. Two properties of
 * it are load-bearing and are why this is parsed rather than eyeballed:
 *
 *  1. It **omits** the blanks the workbook pre-fills as worked examples (B ➊
 *     prints `① a` and `② b` with no key entry). Absence is therefore
 *     meaningful, and those blanks are modelled as `kind: 'given'`.
 *  2. Some items have **multiple** accepted answers (B ➍: `③ G875、G49、D17、D11`),
 *     so an item's answer is a set, not a string.
 */

/** Circled numerals used as question indices, ① (U+2460) upward. */
const CIRCLED_START = 0x2460;
const CIRCLED_END = 0x2473; // ⑳

/** Parse a single circled-numeral character to its 1-based index. */
export function circledToIndex(ch: string): number | null {
  const code = ch.codePointAt(0);
  if (code === undefined) return null;
  if (code >= CIRCLED_START && code <= CIRCLED_END) return code - CIRCLED_START + 1;
  return null;
}

/** Render a 1-based index as its circled numeral (falls back to `<n>`). */
export function indexToCircled(index: number): string {
  if (index >= 1 && index <= CIRCLED_END - CIRCLED_START + 1) {
    return String.fromCodePoint(CIRCLED_START + index - 1);
  }
  return `<${index}>`;
}

/** One numbered item from the key. */
export interface AnswerKeyItem {
  /** 1-based question index, matching ①②③ in the workbook. */
  index: number;
  /** Every answer the key accepts for this item. */
  answers: string[];
}

/** Answers separated by an ideographic comma, a normaliser, or an ASCII comma. */
const MULTI_ANSWER_SPLIT_RE = /[、,，]/;

/**
 * Parse a raw answer-key line into items.
 *
 * Tolerates the punctuation the key actually uses (`;`, `；`, `。`, `.`) and
 * both full-width and half-width forms.
 *
 * @param raw — e.g. `② C; ③ D; ④ E; ⑤ B; ⑥ G; ⑦ F.`
 */
export function parseAnswerKey(raw: string): AnswerKeyItem[] {
  const items: AnswerKeyItem[] = [];
  if (!raw) return items;

  // Split on the circled numerals themselves so the answer text can contain
  // any punctuation without needing heavier parsing.
  const segments: Array<{ index: number; text: string }> = [];
  let current: { index: number; text: string } | null = null;

  for (const ch of raw) {
    const index = circledToIndex(ch);
    if (index !== null) {
      if (current) segments.push(current);
      current = { index, text: '' };
    } else if (current) {
      current.text += ch;
    }
  }
  if (current) segments.push(current);

  for (const seg of segments) {
    const answers = seg.text
      .split(MULTI_ANSWER_SPLIT_RE)
      .map((part) => part.replace(/^[\s;；:：.。]+|[\s;；:：.。]+$/g, '').trim())
      .filter(Boolean);
    if (answers.length) items.push({ index: seg.index, answers });
  }

  return items;
}

/** Look up one item's accepted answers by question index. */
export function answersForKeyIndex(raw: string, index: number): string[] {
  return parseAnswerKey(raw).find((item) => item.index === index)?.answers ?? [];
}
