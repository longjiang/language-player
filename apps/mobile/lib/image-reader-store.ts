/**
 * FileSystem-backed image reader gallery storage (mobile).
 *
 * Persists the image reader's gallery (each loaded image's base64 data URL +
 * OCR result + human-readable title, and the current selection) so it survives
 * navigating away or a fresh mount. Images can be large (base64), so the whole
 * gallery is written as a JSON file in the app documents rather than
 * AsyncStorage (which has tight size limits).
 */

import * as FileSystem from 'expo-file-system/legacy';

const DIR = `${FileSystem.documentDirectory}image_reader/`;
const FILE = `${DIR}gallery.json`;

/** Persisted entry (blocks are derived from `md` on load, so they're omitted). */
export interface ImageReaderPersistedEntry {
  id: string;
  name: string;
  dataUrl: string;
  title?: string;
  md: string;
  error?: boolean;
}

export interface PersistedImageGallery {
  entries: ImageReaderPersistedEntry[];
  currentId: string | null;
}

export async function saveImageGallery(gallery: PersistedImageGallery): Promise<void> {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  await FileSystem.writeAsStringAsync(FILE, JSON.stringify(gallery));
}

export async function loadImageGallery(): Promise<PersistedImageGallery | null> {
  try {
    const raw = await FileSystem.readAsStringAsync(FILE);
    return JSON.parse(raw) as PersistedImageGallery;
  } catch {
    return null;
  }
}
