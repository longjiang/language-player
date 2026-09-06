/**
 * Quote-chip parsing for the reader "Ask AI" summary chat.
 *
 * The summary prompt instructs the model to cite exact passages from the text
 * as `[[<exact L2 passage>||<L1 translation>]]`. The reader turns those
 * markers into tappable chips (original + translation) that open the reader
 * search for the quoted passage.
 */

export interface AiQuote {
  /** The exact passage from the text (L2), with any wrapping quotes stripped. */
  original: string;
  /** The model's L1 translation of THAT passage. */
  translation: string;
}

/** A piece of an AI response after splitting it on `[[…||…]]` quote markers:
 *  either literal prose text or a single quote citation. Rendering walks these
 *  in order so quotes appear at the position the model placed them — as
 *  full-width block chips (see `normalizeQuoteBlocks`). */
export type AiTextSegment =
  | { type: 'text'; value: string }
  | { type: 'quote'; original: string; translation: string };

/**
 * Model-facing instruction appended to reader summary prompts so responses
 * emit `[[original||translation]]` quote markers. This is a prompt to the LLM,
 * not UI chrome, so it is kept in English (not localized).
 *
 * The reader demands a CONCISE answer supported by a FEW short exact quotes.
 * Each quote must sit on its OWN line as a standalone block (never inside a
 * sentence) so it can render as a full-width block chip; `normalizeQuoteBlocks`
 * cleans up any the model still emits inline. Never a reproduction of the
 * whole text and never a trailing dump of every passage (the model previously
 * quoted the entire chapter).
 */
export const READER_AI_QUOTE_INSTRUCTION =
  'Answer concisely and do NOT reproduce the whole text. Quote a few SHORT exact passages from the text to support your answer (ideally 3–5, never the whole text). Put each quote on its OWN line as a standalone paragraph at the point it supports — never inside a sentence. Output each quoted passage in EXACTLY this format on that line: [[exact L2 passage||L1 translation]]. Use ONLY the [[...||...]] format for quotes — never markdown blockquotes (>), quotation marks, or any other styling. Copy the L2 passage exactly from the text, and put its L1 translation after ||.';

/**
 * Summary-specific instruction appended for the reader's "Ask AI" summary
 * presets (page / chapter / book-so-far): a concise overview, not a retelling.
 * Kept in English like `READER_AI_QUOTE_INSTRUCTION` (a prompt to the LLM).
 */
export const READER_AI_SUMMARY_INSTRUCTION =
  'Give a CONCISE summary in the target language: a short overview that captures the arc, the key events, and the main characters. Do NOT reproduce or retell the full text — a faithful summary, not a copy. Support it with a few short, exact quotes.';

/**
 * Model-facing instruction appended to video "Ask AI" prompts so responses cite
 * the subtitle timestamps they refer to. Kept in English like the other
 * instructions (a prompt to the LLM). The transcript context is formatted as
 * `[MM:SS] line` per subtitle; the model is asked to echo the `[MM:SS]` tokens.
 */
export const VIDEO_AI_TIMESTAMP_INSTRUCTION =
  'The video transcript is provided with each line preceded by its timestamp in [MM:SS] format. When you refer to a specific part of the video, cite that timestamp inline in EXACTLY this [MM:SS] format (copy it from the transcript). Cite the timestamp of every subtitle line you discuss or quote. Do not invent timestamps that are not present in the transcript.';

/** `[MM:SS]` / `[H:MM:SS]` timestamp token (as the model is asked to emit). */
const TIMESTAMP_TOKEN_RE = /\[(?:(\d+):)?(\d{1,2}):(\d{2})\]/g;

/** Format seconds as `MM:SS` (or `H:MM:SS` for ≥1 hour). */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Parse a `[MM:SS]` (or `[H:MM:SS]`) token into seconds; null if not a match. */
export function parseTimestampToken(token: string): number | null {
  const m = token.match(/^\[(?:(\d+):)?(\d{1,2}):(\d{2})\]$/);
  if (!m) return null;
  const m1 = parseInt(m[2] ?? '0', 10);
  const s1 = parseInt(m[3] ?? '0', 10);
  const h1 = m[1] ? parseInt(m[1], 10) : 0;
  return h1 * 3600 + m1 * 60 + s1;
}

/**
 * Build the transcript context string for the video "Ask AI": one subtitle per
 * line, prefixed with its `[MM:SS]` timestamp so the model can cite the
 * timestamps of the lines it references.
 */
export function formatSubtitleContext(
  lines: { starttime: number; text: string }[],
): string {
  return lines
    .map((l) => `[${formatTimestamp(l.starttime)}] ${l.text}`)
    .join('\n');
}

/** Curly/straight/typographic quotation-mark characters (left & right). */
const QUOTE_CHARS = new Set([`"`, `'`, `‘`, `’`, `“`, `”`, `„`, `‟`, `‹`, `›`, `«`, `»`]);

/** The `[[original||translation]]` quote marker. Non-greedy so each marker
 *  stops at the first `]]`; `[\s\S]+?` so a quoted passage spanning a line
 *  break still matches. Shared by the stripper and the splitter. */
const QUOTE_MARKER = /\[\[([\s\S]+?)\|\|([\s\S]+?)\]\]/g;

/** Strip leading/trailing quotation marks from a passage (the model often wraps
 *  the quote, which would otherwise break the reader search). Also trims. */
export function cleanAiQuote(s: string): string {
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
  const clean = text.replace(QUOTE_MARKER, (_, original: string, translation: string) => {
    const o = cleanAiQuote(original ?? '');
    const t = cleanAiQuote(translation ?? '');
    if (o) quotes.push({ original: o, translation: t });
    return '';
  });
  return { clean, quotes };
}

/** Split an AI response into ordered text/quote segments so quotes can be
 *  rendered INLINE at the position the model placed them (rather than being
 *  stripped out and collected at the end). Markers that overlap or are
 *  malformed are left in the surrounding text unchanged. */
export function splitAiQuotes(text: string): AiTextSegment[] {
  const segments: AiTextSegment[] = [];
  QUOTE_MARKER.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTE_MARKER.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', value: text.slice(last, m.index) });
    const original = cleanAiQuote(m[1] ?? '');
    const translation = cleanAiQuote(m[2] ?? '');
    if (original) segments.push({ type: 'quote', original, translation });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) });
  return segments;
}

/**
 * Hoist every `[[original||translation]]` marker in an AI response onto its
 * own line so each renders as a standalone full-width block chip rather than
 * an inline span breaking the sentence around it.
 *
 * `READER_AI_QUOTE_INSTRUCTION` asks the model to emit each marker as its own
 * paragraph, but models still slip markers into the middle of a sentence.
 * Rewriting the text (instead of only restyling at render time) keeps the web
 * markdown renderer and the mobile inline renderer in sync — and keeps the
 * prose sentence clean: the marker is cut out and dropped at the end of the
 * line, leaving the surrounding sentence readable.
 */
export function normalizeQuoteBlocks(text: string): string {
  QUOTE_MARKER.lastIndex = 0;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTE_MARKER.exec(text)) !== null) {
    const start = m.index;
    if (start > last) out += text.slice(last, start);
    // Start the marker's line after the previous line's newline (never glue
    // it onto a preceding line), and isolate it with hard newlines so each
    // marker becomes its own block in both markdown and plain-text renders.
    out += '\n\n';
    out += m[0];
    out += '\n\n';
    last = start + m[0].length;
  }
  if (last < text.length) out += text.slice(last);
  return out;
}
