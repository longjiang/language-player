import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system/legacy';
import { log, logwarn } from '@/lib/logger';

/**
 * File handling — routes files opened in the app ("Open file" / OS "Open
 * in Language Player") to the right reader:
 *  - audio/video (+ .srt)        → local media player
 *  - .epub/.fb2/.mobi/.azw3      → ebook reader
 *  - .pdf                        → ebook reader (PDF mode)
 *  - .txt/.md                    → notes reader (creates a note)
 *  - images                      → image reader (vision OCR)
 *
 * OS-opened files arrive as file:/content: URIs through expo-linking
 * (iOS CFBundleDocumentTypes / Android VIEW intent filters). Every opened
 * file is copied into the app's documents so it survives and is routable.
 */

export type OpenedFileKind = 'media' | 'ebook' | 'pdf' | 'notes' | 'image' | 'unknown';

export interface OpenedFile {
  kind: OpenedFileKind;
  /** file:// URI of the copy inside the app documents. */
  uri: string;
  /** Original file name. */
  name: string;
  /** Original external URI (file: or content:). */
  sourceUri: string;
}

const KIND_BY_EXT: Array<[RegExp, OpenedFileKind]> = [
  [/\.(mp3|m4a|aac|wav|ogg|oga|flac|wma|opus)$/i, 'media'],
  [/\.(mp4|mov|mkv|avi|webm|m4v|3gp)$/i, 'media'],
  [/\.(srt|vtt)$/i, 'media'],
  [/\.epub$/i, 'ebook'],
  [/\.(fb2|mobi|azw3)$/i, 'ebook'],
  [/\.pdf$/i, 'pdf'],
  [/\.(txt|md|markdown)$/i, 'notes'],
  [/\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i, 'image'],
];

export function classifyFileName(name: string): OpenedFileKind {
  for (const [re, kind] of KIND_BY_EXT) if (re.test(name)) return kind;
  return 'unknown';
}

/** Pending opened files, consumed by the target screens on focus. */
const pendingOpens: OpenedFile[] = [];

export function peekPendingOpen(): OpenedFile | null {
  return pendingOpens[0] ?? null;
}

export function consumePendingOpen(): OpenedFile | null {
  return pendingOpens.shift() ?? null;
}

export function clearPendingOpens(): void {
  pendingOpens.length = 0;
}

/** Copy an external file URI into the app documents (content: on Android
 *  needs the copy — it is a temporary grant). */
async function ingestExternalUri(sourceUri: string, fallbackName?: string): Promise<void> {
  try {
    const name =
      fallbackName ||
      sourceUri.split('/').pop()?.split('?')[0] ||
      `opened-${Date.now()}`;
    const kind = classifyFileName(name);
    log('[file-open] ingest — source:', sourceUri, '| name:', name, '| kind:', kind);
    if (kind === 'unknown') {
      logwarn('[file-open] ignored — no reader for', name);
      return;
    }
    const dir = `${FileSystem.documentDirectory}opened/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const dest = `${dir}${Date.now()}_${name.replace(/[^\w.\-]+/g, '_')}`;
    try {
      await FileSystem.copyAsync({ from: sourceUri, to: dest });
    } catch {
      // content:// URIs sometimes need a read first (asset-library etc.).
      logwarn('[file-open] copy failed, trying read+write', name);
      const base64 = await FileSystem.readAsStringAsync(sourceUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.writeAsStringAsync(dest, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    const opened: OpenedFile = { kind, uri: dest, name, sourceUri };
    pendingOpens.push(opened);
    log('[file-open] opened external file', { kind, name });
  } catch (err) {
    logwarn('[file-open] ingest failed:', (err as Error)?.message ?? err);
  }
}

/** Start listening for OS file-open events (call once from the root layout). */
export function startFileOpenListener(): () => void {
  void Linking.getInitialURL().then((url) => {
    log('[file-open] initial URL:', url ?? '(none)');
    if (url) void ingestExternalUri(url);
  });
  const sub = Linking.addEventListener('url', ({ url }) => {
    log('[file-open] url event:', url);
    void ingestExternalUri(url);
  });
  log('[file-open] listener started');
  return () => sub.remove();
}
