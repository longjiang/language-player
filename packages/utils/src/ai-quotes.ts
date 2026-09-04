/**
 * Quote-chip parsing for the reader "Ask AI" summary chat.
 *
 * The summary prompt instructs the model to cite exact passages from the text
 * as `[[<exact L2 passage>||<L1 translation>]]` on their own line. The reader
 * turns those markers into tappable chips (original + translation) that open
 * the reader search for the quoted passage.
 */

export interface AiQuote {
  /** The exact passage from the text (L2), with any wrapping quotes stripped. */
  original: string;
  /** The model's L1 translation of THAT passage. */
  translation: string;
}

/** Model-facing instruction appended to reader summary prompts so responses
 *  emit `[[original||translation]]` quote markers. This is a prompt to the LLM,
 *  not UI chrome, so it is kept in English (not localized). */
export const READER_AI_QUOTE_INSTRUCTION =
  'Quote exact passages from the text. For EVERY quoted passage, output it on its own line in EXACTLY this format: [[exact L2 passage||L1 translation]]. Use ONLY the [[...||...]] format for quotes — never markdown blockquotes (>), quotation marks, or any other styling. Copy the L2 passage exactly from the text, and put its L1 translation after ||.';

/** Curly/straight/typographic quotation-mark characters (left & right). */
const QUOTE_CHARS = new Set([`"`, `'`, `‘`, `’`, `“`, `”`, `„`, `‟`, `‹`, `›`, `«`, `»`]);

/** Strip leading/trailing quotation marks from a passage (the model often wraps
 *  the quote, which would otherwise break the reader search). */
function stripQuoteChars(s: string): string {
  let out = s.trim();
  while (out.length > 0 && QUOTE_CHARS.has(out.charAt(0))) out = out.slice(1);
  while (out.length > 0 && QUOTE_CHARS.has(out.charAt(out.length - 1))) out = out.slice(0, -1);
  return out;
}

/** Whitespace- and case-insensitive, NFC-normalized comparison form (so a quote
 *  spanning a line break between reader blocks still matches the joined text). */
function normalizeForCompare(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, '').toLowerCase();
}

/** True when `original` appears (whitespace/case-insensitively) inside `text`. */
export function textContainsQuote(original: string, text: string): boolean {
  if (!original || !text) return false;
  return normalizeForCompare(text).includes(normalizeForCompare(original));
}

/** Drop quotes that are halluncinated / not actually present in the reader
 *  content. `contentTexts` are the reader's content sources (full text, current
 *  page, chapter, book-so-far). When no content is supplied the quotes pass
 *  through unchanged (e.g. the dictionary path). */
export function filterReaderQuotes(quotes: AiQuote[], contentTexts: string[]): AiQuote[] {
  const sources = contentTexts.filter((s): s is string => Boolean(s));
  if (sources.length === 0) return quotes;
  return quotes.filter((q) => sources.some((s) => textContainsQuote(q.original, s)));
}

/** Extract `[[original||translation]]` markers from an AI response.
 *  Returns the text with the markers stripped (for markdown rendering) plus the
 *  parsed quote list (preserved in order); wrapping quotes are stripped. */
export function parseAiQuotes(text: string): { clean: string; quotes: AiQuote[] } {
  const quotes: AiQuote[] = [];
  const clean = text.replace(/\[\[(.+?)\|\|(.+?)\]\]/g, (_, original: string, translation: string) => {
    const o = stripQuoteChars(original ?? '');
    const t = stripQuoteChars(translation ?? '');
    if (o) quotes.push({ original: o, translation: t });
    return '';
  });
  return { clean, quotes };
}
