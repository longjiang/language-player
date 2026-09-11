/**
 * Auto-titling for saved notes (SPEC-009 §"Notes Reader: auto-title from the
 * first line").
 *
 * A note created with **New Note**, **Paste** or an import that never got a
 * real title still reads as the localized "Untitled" placeholder. When the user
 * leaves the editor for the reader, both apps derive a title from the note's
 * first line — at most `AUTO_TITLE_MAX_TOKENS` word tokens, with a trailing
 * ellipsis when more of the line follows.
 *
 * Tokenization is passed in (`tokenize`) because the tokenizer is
 * platform-bound: web calls the Python batch lemmatizer, mobile uses its
 * server-then-local chain. Counting **tokens** rather than whitespace-separated
 * words is what makes the trim correct for the L2s without spaces (zh, ja, th):
 * a 30-character Chinese line is dozens of tokens but one "word". When the
 * tokenizer is unavailable (offline, server error) the line is split on
 * whitespace instead, so the rename still happens.
 *
 * The rules are shared by both apps — the same note must get the same title
 * whichever client the user happens to open it in.
 */
import type { LemmatizedToken } from '@langplayer/shared';

/** Word tokens kept in an auto-generated note title. */
export const AUTO_TITLE_MAX_TOKENS = 10;

/** Appended to a title that was cut at `AUTO_TITLE_MAX_TOKENS`. */
export const AUTO_TITLE_ELLIPSIS = '…';

/**
 * The English placeholder, matched alongside the UI-language one: notes are
 * titled with the *creating* client's `msg.untitled_note`, so the label in
 * front of us may be a different locale's variant (mobile's offline create
 * path also falls back to the English literal).
 */
const ENGLISH_UNTITLED = 'Untitled';

/** Platform tokenizer for one line; `null` means "unavailable, use the fallback". */
export type NoteTitleTokenizer = (line: string) => Promise<LemmatizedToken[] | null>;

/**
 * First non-empty line of a note body, with leading Markdown markers (`#`…`######`
 * headings and `>` quotes) stripped — the title is shown as plain text, so the
 * markers are noise. Empty string when the note has no text.
 */
export function noteFirstLine(text: string): string {
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*(?:#{1,6}\s+|>\s*)/, '').trim();
    if (line) return line;
  }
  return '';
}

/**
 * Does this title still read as the "Untitled" placeholder (or is it empty)?
 * Only then may an auto-title replace it — a title the user typed is never
 * overwritten.
 */
export function isUntitledNoteTitle(
  title: string | null | undefined,
  untitledLabel: string,
): boolean {
  const value = (title ?? '').trim().toLowerCase();
  if (!value) return true;
  return value === ENGLISH_UNTITLED.toLowerCase()
    || value === (untitledLabel ?? '').trim().toLowerCase();
}

/**
 * Trim an already-tokenized first line to `maxTokens` word tokens.
 *
 * Word tokens are the ones the lemmatizer resolved (`lemmas.length > 0`);
 * spaces and punctuation ride along with them so the returned title is a plain
 * slice of the source line. A line with no more than `maxTokens` words is
 * returned unchanged.
 */
export function autoTitleFromLine(
  line: string,
  tokens: LemmatizedToken[] | null | undefined,
  maxTokens: number = AUTO_TITLE_MAX_TOKENS,
): string {
  const source = line.trim();
  if (!source) return '';
  const max = Math.max(1, Math.floor(maxTokens));

  // Tokenizer output that no longer reconstructs the line (or no tokenizer at
  // all) can't be sliced safely — fall back to whitespace words.
  if (!tokens || tokens.length === 0 || !tokensReconstructLine(tokens, source)) {
    return trimByWhitespace(source, max);
  }

  let seen = 0;
  let cut = '';
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    cut += token.text;
    if (Array.isArray(token.lemmas) && token.lemmas.length > 0) {
      seen += 1;
      if (seen >= max) {
        // Only mark the truncation when something of the line is left over.
        const rest = tokens.slice(i + 1).some(t => (t.text ?? '').trim() !== '');
        return rest ? `${cut.trimEnd()}${AUTO_TITLE_ELLIPSIS}` : cut.trimEnd();
      }
    }
  }
  return cut.trimEnd();
}

export interface AutoNoteTitleOptions {
  /** Note body; only its first non-empty line is used. */
  text: string;
  /** The note's current title — the rename is skipped unless it reads as "Untitled". */
  currentTitle?: string | null;
  /** `msg.untitled_note` in the current UI language. */
  untitledLabel: string;
  /** Platform tokenizer for the first line. */
  tokenize: NoteTitleTokenizer;
  /** Defaults to `AUTO_TITLE_MAX_TOKENS`. */
  maxTokens?: number;
}

/**
 * The title a note should take from its first line, or `null` when it should
 * keep the title it already has (not untitled, no text, or nothing to change).
 * Never throws: a failing tokenizer falls back to whitespace splitting.
 */
export async function autoNoteTitle(options: AutoNoteTitleOptions): Promise<string | null> {
  const { text, currentTitle, untitledLabel, tokenize, maxTokens } = options;
  if (!isUntitledNoteTitle(currentTitle, untitledLabel)) return null;

  const line = noteFirstLine(text);
  if (!line) return null;

  let tokens: LemmatizedToken[] | null = null;
  try {
    tokens = await tokenize(line);
  } catch {
    // Tokenizer unavailable (offline / server error) — whitespace fallback.
    tokens = null;
  }

  const title = autoTitleFromLine(line, tokens, maxTokens);
  if (!title || title === (currentTitle ?? '').trim()) return null;
  return title;
}

// ── Internals ────────────────────────────────────────────────────────────

/** Does the tokenizer output join back into the line it came from?
 *
 *  Whitespace *runs* are collapsed before comparing, so a lemmatizer that
 *  normalizes spacing still slices cleanly, while output that dropped the
 *  spaces entirely (e.g. the video token-cache endpoint) is rejected — slicing
 *  it would glue a space-separated title into one word. Such output falls back
 *  to whitespace words, which is the honest trim for it. */
function tokensReconstructLine(tokens: LemmatizedToken[], line: string): boolean {
  const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
  const rebuilt = tokens.map(t => t.text ?? '').join('');
  // Guard against a pathological tokenizer that returns nothing at all.
  if (!rebuilt.trim()) return false;
  return collapse(rebuilt) === collapse(line);
}

/** Fallback trim: whitespace-separated words (no tokenizer available). */
function trimByWhitespace(line: string, max: number): string {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length <= max) return line;
  return `${words.slice(0, max).join(' ')}${AUTO_TITLE_ELLIPSIS}`;
}
