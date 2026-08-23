/**
 * Reader anchor persistence (localStorage) for the notes reader and web
 * reader. The anchor is the global block index at the start of the visible
 * page, matching `ReaderLoc` (web reader location model). Keyed by a stable
 * identifier so a refresh / navigation restores the same spot in the text:
 *   - Notes reader:  `lp_reader_pos_note_{noteId}`
 *   - Web reader:    `lp_reader_pos_url_{base64(url)}`
 *
 * Block index is used instead of a page number because page boundaries shift
 * with the viewport (window size, sidebar toggle, text settings) while the
 * block position in the stream stays put — so restoring the block index keeps
 * the reader on the same text across re-pagination.
 */

const NOTE_POS_PREFIX = 'lp_reader_pos_note_';
const URL_POS_PREFIX = 'lp_reader_pos_url_';

/** Save the reading position (block index) for a note. */
export function saveNotePosition(noteId: number, blockIndex: number): void {
  try {
    window.localStorage.setItem(`${NOTE_POS_PREFIX}${noteId}`, String(blockIndex));
  } catch {
    // non-critical
  }
}

/** Get the saved reading position (block index) for a note, or null. */
export function getNotePosition(noteId: number): number | null {
  try {
    const raw = window.localStorage.getItem(`${NOTE_POS_PREFIX}${noteId}`);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/** Save the reading position (block index) for a web reader URL. */
export function saveUrlPosition(url: string, blockIndex: number): void {
  try {
    const key = btoa(url); // base64 to avoid key-length issues
    window.localStorage.setItem(`${URL_POS_PREFIX}${key}`, String(blockIndex));
  } catch {
    // non-critical
  }
}

/** Get the saved reading position (block index) for a web reader URL, or null. */
export function getUrlPosition(url: string): number | null {
  try {
    const key = btoa(url);
    const raw = window.localStorage.getItem(`${URL_POS_PREFIX}${key}`);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}
