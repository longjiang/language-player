/**
 * Reader Anchor Persistence — AsyncStorage helpers for saving/restoring
 * the last-read page position in the notes reader and web reader.
 *
 * Each reader screen persists its anchor keyed by a stable identifier:
 *   - Notes reader:  `reader_anchor_note_{noteId}`
 *   - Web reader:    `reader_anchor_url_{base64(url)}`
 *
 * The anchor is the first ~40 characters of the first text block on the
 * current page (matching the EPUB reader's approach).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ANCHOR_PREFIX = 'reader_anchor_';

/** Save the page anchor for a note. */
export async function saveNoteAnchor(noteId: number, anchor: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${ANCHOR_PREFIX}note_${noteId}`, anchor);
  } catch {
    // non-critical
  }
}

/** Get the saved page anchor for a note, or null. */
export async function getNoteAnchor(noteId: number): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`${ANCHOR_PREFIX}note_${noteId}`);
  } catch {
    return null;
  }
}

/** Save the page anchor for a web reader URL. */
export async function saveUrlAnchor(url: string, anchor: string): Promise<void> {
  try {
    const key = btoa(url); // base64 to avoid key-length issues
    await AsyncStorage.setItem(`${ANCHOR_PREFIX}url_${key}`, anchor);
  } catch {
    // non-critical
  }
}

/** Get the saved page anchor for a web reader URL, or null. */
export async function getUrlAnchor(url: string): Promise<string | null> {
  try {
    const key = btoa(url);
    return await AsyncStorage.getItem(`${ANCHOR_PREFIX}url_${key}`);
  } catch {
    return null;
  }
}
