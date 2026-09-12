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
 * The printed key uses two shapes, and both must survive:
 *
 *   ② 新; ③ 免费Wi-Fi; ④ 充电口。          — circled question numerals (B ➋)
 *   2. 金敏俊: B、c; 3. 奥利维亚: D, a。     — row numbers plus a name label (A ➌)
 *   (4) 运营时刻 ......... [ C ]           — a labelled row with a bracketed answer (D ➋)
 *
 * Tolerates the punctuation the key actually uses (`;`, `；`, `。`, `.`) in both
 * full-width and half-width forms.
 *
 * @param raw — one task's key line(s), verbatim from the printed key.
 */
export function parseAnswerKey(raw: string): AnswerKeyItem[] {
  if (!raw) return [];

  // Normalise the row-number forms into circled numerals so there is exactly
  // one index syntax downstream: `2.` / `2、` / `(2)` → ②.
  const withCircled = raw
    .replace(/[(（]\s*(\d{1,2})\s*[)）]/g, (_m, n) => indexToCircled(Number(n)))
    .replace(/(^|[;；。.\s])(\d{1,2})\s*[.、)）]/g, (_m, pre, n) => `${pre}${indexToCircled(Number(n))}`);

  const items: AnswerKeyItem[] = [];
  const segments: Array<{ index: number; text: string }> = [];
  let current: { index: number; text: string } | null = null;

  for (const ch of withCircled) {
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
    // Drop a leading `<name>:` / `<label> .......` prefix. A ➌ labels each row
    // with a person's name and D ➋ with a section title; neither is an answer.
    let body = seg.text;
    const colon = body.search(/[:：]/);
    if (colon !== -1) body = body.slice(colon + 1);
    body = body.replace(/[.．…_·]{2,}/g, ' ');

    // A bracketed answer (`[ C ]`) is the D ➋ shape; unwrap before splitting.
    const bracketed = body.match(/[[［]\s*([^\]］]+?)\s*[\]］]/);
    if (bracketed) body = bracketed[1]!;

    const answers = body
      .split(MULTI_ANSWER_SPLIT_RE)
      .map((part) => part.replace(/^[\s;；:：.。\[\]［］]+|[\s;；:：.。\[\]［］]+$/g, '').trim())
      .filter(Boolean);
    if (answers.length) items.push({ index: seg.index, answers });
  }

  return items;
}

/** Look up one item's accepted answers by question index. */
export function answersForKeyIndex(raw: string, index: number): string[] {
  return parseAnswerKey(raw).find((item) => item.index === index)?.answers ?? [];
}
