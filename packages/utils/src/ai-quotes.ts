/**
 * Quote-chip parsing for the reader "Ask AI" summary chat.
 *
 * The summary prompt instructs the model to cite exact passages from the text
 * as `[[<exact L2 passage>||<L1 translation>]]` on their own line. The reader
 * turns those markers into tappable chips (original + translation) that open
 * the reader search for the quoted passage.
 */

export interface AiQuote {
  /** The exact passage from the text (L2). */
  original: string;
  /** The model's L1 translation of THAT passage. */
  translation: string;
}

/** Model-facing instruction appended to reader summary prompts so responses
 *  emit `[[original||translation]]` quote markers. This is a prompt to the LLM,
 *  not UI chrome, so it is kept in English (not localized). */
export const READER_AI_QUOTE_INSTRUCTION =
  'Where relevant, quote exact passages from the text. For each quote, write it on its own line as [[exact L2 passage||L1 translation]].';

/** Extract `[[original||translation]]` markers from an AI response.
 *  Returns the text with the markers stripped (for markdown rendering) plus the
 *  parsed quote list (preserved in order). */
export function parseAiQuotes(text: string): { clean: string; quotes: AiQuote[] } {
  const quotes: AiQuote[] = [];
  const clean = text.replace(/\[\[(.+?)\|\|(.+?)\]\]/g, (_, original: string, translation: string) => {
    const o = original?.trim() ?? '';
    const t = translation?.trim() ?? '';
    if (o) quotes.push({ original: o, translation: t });
    return '';
  });
  return { clean, quotes };
}
