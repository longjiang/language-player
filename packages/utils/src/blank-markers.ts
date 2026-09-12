/**
 * Extract `{{bN}}` blank markers from textbook L2 text (SPEC-095).
 *
 * Mirrors `extractNoteMarkers` (SPEC-093, ADR-0041): markers are removed from
 * the text *before* tokenization and each one records the char offset it
 * occupied in the clean text. `TokenizedText` then interleaves an interactive
 * blank at that offset, so the lemmatizer only ever sees clean, marker-free
 * text and the blank lands on a real token boundary.
 *
 * The marker syntax is deliberately non-linguistic (`{{b1}}` rather than
 * underscores) so it can never be produced by, or confused with, the content
 * itself.
 */

export interface BlankMarker {
  /** Blank id, e.g. `b1`. */
  id: string;
  /** Char offset of the marker in `cleanText`. */
  index: number;
}

export interface ExtractBlanksResult {
  cleanText: string;
  markers: BlankMarker[];
}

const MARKER_RE = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;

/**
 * @param text — Raw passage text, possibly containing `{{bN}}` markers.
 * @returns `{ cleanText, markers }` with markers in text order.
 */
export function extractBlankMarkers(text: string): ExtractBlanksResult {
  const markers: BlankMarker[] = [];
  if (!text || !text.includes('{{')) return { cleanText: text ?? '', markers };

  let cleanText = '';
  let lastIndex = 0;
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(text)) !== null) {
    cleanText += text.slice(lastIndex, m.index);
    markers.push({ id: m[1]!, index: cleanText.length });
    lastIndex = m.index + m[0].length;
  }
  cleanText += text.slice(lastIndex);

  return { cleanText, markers };
}

/** Every blank id referenced by `{{...}}` markers in `text`, in order. */
export function blankIdsIn(text: string): string[] {
  return extractBlankMarkers(text).markers.map((m) => m.id);
}

/** True when `text` contains at least one blank marker. */
export function hasBlankMarkers(text: string): boolean {
  return /\{\{\s*[A-Za-z0-9_-]+\s*\}\}/.test(text);
}

export interface InlineMarkersResult {
  cleanText: string;
  /** `[n]` note markers (SPEC-093), in final-text order. */
  noteMarkers: Array<{ id: number; index: number }>;
  /** `{{bN}}` blank markers (SPEC-095), in final-text order. */
  blankMarkers: BlankMarker[];
}

/**
 * Single-pass extraction of both inline marker kinds.
 *
 * `extractNoteMarkers` and `extractBlankMarkers` each compute offsets in their
 * own cleaned text, so running them in sequence corrupts the first one's
 * offsets whenever a marker of the other kind precedes it. Scanning once and
 * recording each offset against the output being built keeps both sets valid in
 * the same final string — which is what `TokenizedText` renders.
 *
 * Either kind can be disabled, so a caller that only wants notes gets exactly
 * the previous behaviour.
 */
export function extractInlineMarkers(
  text: string,
  options: { notes?: boolean; blanks?: boolean } = {},
): InlineMarkersResult {
  const wantNotes = options.notes ?? false;
  const wantBlanks = options.blanks ?? false;
  const noteMarkers: Array<{ id: number; index: number }> = [];
  const blankMarkers: BlankMarker[] = [];

  if (!text || (!wantNotes && !wantBlanks)) {
    return { cleanText: text ?? '', noteMarkers, blankMarkers };
  }

  let cleanText = '';
  let lastIndex = 0;
  const re = /\[(\d+)\]|\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const isNote = m[1] !== undefined;
    const isBlank = m[2] !== undefined;

    // A marker kind the caller did not ask for is kept verbatim.
    if ((isNote && !wantNotes) || (isBlank && !wantBlanks)) continue;

    cleanText += text.slice(lastIndex, m.index);
    if (isNote) {
      const id = Number(m[1]);
      if (Number.isFinite(id)) noteMarkers.push({ id, index: cleanText.length });
    } else {
      blankMarkers.push({ id: m[2]!, index: cleanText.length });
    }
    lastIndex = m.index + m[0].length;
  }

  cleanText += text.slice(lastIndex);
  return { cleanText, noteMarkers, blankMarkers };
}
