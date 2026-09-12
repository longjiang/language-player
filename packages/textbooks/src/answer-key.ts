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

const CHINESE_NUMERALS: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/**
 * `插图二 C` → `② C`, so the illustration slots join the one index syntax.
 *
 * B ➎'s key names the slots in Chinese words because the workbook prints them that
 * way (插图一…六); its blank ids are `b1`…`b6` in the same order, so the index
 * carries across unchanged.
 */
function normaliseChineseNumerals(raw: string): string {
  return raw.replace(/插图([一二三四五六七八九十]+)/g, (_m, word: string) => {
    // Only single characters occur; a compound (十一) would be an authoring error.
    const n = word.length === 1 ? CHINESE_NUMERALS[word] : undefined;
    return n === undefined ? _m : indexToCircled(n);
  });
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
 *   插图二 C; 插图三 D; …                  — Chinese-numbered illustration slots (B ➎)
 *
 * Tolerates the punctuation the key actually uses (`;`, `；`, `。`, `.`) in both
 * full-width and half-width forms.
 *
 * @param raw — one task's key line(s), verbatim from the printed key.
 */
export function parseAnswerKey(raw: string): AnswerKeyItem[] {
  if (!raw) return [];

  // Normalise the row-number forms into circled numerals so there is exactly
  // one index syntax downstream: `2.` / `2、` / `(2)` → ②. The illustration slots
  // are numbered in Chinese words rather than circles, so 插图二 is index 2.
  const withCircled = normaliseChineseNumerals(raw)
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

/**
 * Parse a **grouped** answer key into `"<group>.<position>"` labels.
 *
 * A ➍ prints five numbered sub-items, each with its own ①②③, and the key mirrors
 * that:
 *
 *   (2) ① 不管；② 还是；③ 趟；(3) ① 虽然；② 但是；③ 一般；…
 *
 * The inner circles restart per group, so a flat index cannot express this — `①`
 * occurs four times — and the blanks address their answers positionally instead:
 * `keyLabel: '2.1'` is group 2's first answer. Kept as its own function because the
 * shape is genuinely different from the three flat ones.
 */
export function parseGroupedAnswerKey(raw: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!raw) return out;

  // Split on the parenthesised group numbers, keeping the number with its body.
  const parts = raw.split(/[(（]\s*(\d{1,2})\s*[)）]/);
  for (let i = 1; i < parts.length; i += 2) {
    const group = parts[i]!;
    const body = parts[i + 1] ?? '';
    // Within a group the answers are delimited by their own circled numerals.
    let position = 0;
    for (const chunk of body.split(/[①②③④⑤⑥⑦⑧⑨⑩]/)) {
      const answers = chunk
        .split(MULTI_ANSWER_SPLIT_RE)
        .map((part) => part.replace(/^[\s;；:：.。\[\]［］]+|[\s;；:：.。\[\]［］]+$/g, '').trim())
        .filter(Boolean);
      if (!answers.length) continue;
      position += 1;
      out.set(`${group}.${position}`, answers);
    }
  }
  return out;
}

/** Look up one item's accepted answers by question index. */
export function answersForKeyIndex(raw: string, index: number): string[] {
  return parseAnswerKey(raw).find((item) => item.index === index)?.answers ?? [];
}

/**
 * Parse a **label-keyed** answer key into `label → answers`.
 *
 * A ➊ puts its blanks on a map beside city names, so the key names each blank
 * instead of numbering it:
 *
 *   北京：C；成都：D；吐鲁番：B；拉萨：J；…
 *
 * Kept separate from `parseAnswerKey` rather than folded into it: the two forms
 * share punctuation but not structure (labels are arbitrary text, so treating
 * them as indices would mis-key every blank).
 */
export function parseLabelledAnswerKey(raw: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!raw) return out;

  for (const segment of raw.split(/[;；。\n]/)) {
    const text = segment.trim();
    if (!text) continue;
    const colon = text.search(/[:：]/);
    if (colon === -1) continue;
    const label = text.slice(0, colon).trim();
    const answers = text
      .slice(colon + 1)
      .split(MULTI_ANSWER_SPLIT_RE)
      .map((part) => part.replace(/^[\s.。]+|[\s.。]+$/g, '').trim())
      .filter(Boolean);
    if (label && answers.length) out.set(label, answers);
  }

  return out;
}

/** Answers for one label-keyed item. */
export function answersForKeyLabel(raw: string, label: string): string[] {
  // A grouped label (`2.1`) addresses a sub-item's own item, which the flat label
  // shape cannot express.
  if (/^\d+\.\d+$/.test(label)) return parseGroupedAnswerKey(raw).get(label) ?? [];

  return parseLabelledAnswerKey(raw).get(label) ?? [];
}
