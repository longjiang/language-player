/**
 * Folder-EPUB support for the web reader.
 *
 * macOS/iOS exports (Calibre, Dropbox, Apple Books) sometimes ship an EPUB as
 * an extracted directory whose name ends in `.epub`. Browsers can't open
 * directories with the normal file input, so we read them via the
 * File System Entry API (drag-drop and `webkitdirectory` input), zip them
 * back into a real EPUB in memory, and feed the result through the same
 * pipeline as a normal .epub file.
 */

import JSZip from 'jszip';

export interface EpubFolderFile {
  /** Path inside the EPUB zip (e.g. "META-INF/container.xml"). */
  path: string;
  file: File;
}

interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** Recursively flatten a dragged directory entry into files + zip paths. */
export async function readDirectoryEntry(
  entry: FileSystemEntry,
  path = '',
): Promise<EpubFolderFile[]> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntry);
    return [{ path: path || entry.name, file }];
  }
  if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry;
    const children = await readAllEntries(dir.createReader());
    const nested = await Promise.all(
      children.map((child) =>
        readDirectoryEntry(child, path ? `${path}/${child.name}` : child.name),
      ),
    );
    return nested.flat();
  }
  return [];
}

/** Extract entries from a drag-drop DataTransfer, or null when unsupported. */
export async function folderFilesFromDrop(
  items: DataTransferItemList | DataTransferItem[],
): Promise<EpubFolderFile[] | null> {
  const list = Array.from(items);
  const entries: FileSystemEntry[] = [];
  for (const item of list) {
    const getEntry = (item as unknown as { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry;
    const entry = getEntry?.call(item);
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return null;
  const files = (await Promise.all(entries.map((e) => readDirectoryEntry(e)))).flat();
  return files.length > 0 ? files : null;
}

/** Map a `webkitdirectory` input's FileList onto zip paths. */
export function folderFilesFromInput(files: FileList): EpubFolderFile[] {
  return Array.from(files).map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    return { path: rel, file };
  });
}

/** Top-level folder name from the first entry's path. */
export function folderNameFromFiles(files: EpubFolderFile[]): string {
  const first = files.find((f) => f.path.includes('/'))?.path.split('/')[0];
  return first || 'book.epub';
}

/** Zip a folder EPUB back into a real EPUB ArrayBuffer. */
export async function zipEpubFolder(files: EpubFolderFile[]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const sorted = [...files].sort((a, b) => {
    if (a.path === 'mimetype') return -1;
    if (b.path === 'mimetype') return 1;
    return a.path.localeCompare(b.path);
  });
  for (const { path, file } of sorted) {
    const data = await file.arrayBuffer();
    if (path === 'mimetype') {
      zip.file(path, data, { compression: 'STORE' });
    } else {
      zip.file(path, data);
    }
  }
  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    mimeType: 'application/epub+zip',
  });
}

/**
 * Unwrap a `.epub.zip` / `.zip` archive that wraps an EPUB.
 *
 * Three common shapes are handled:
 * - the archive already IS an EPUB (container at root) — use the bytes as-is
 * - the archive contains a single inner `.epub` file — extract it
 * - the archive contains the EPUB's extracted folder — rezip it with the
 *   folder as root
 *
 * Returns null when the zip doesn't contain an EPUB.
 */
export async function unwrapEpubZip(
  file: File,
): Promise<{ data: ArrayBuffer; fileName: string } | null> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    return null;
  }
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  const baseName = file.name.replace(/\.epub\.zip$/i, '').replace(/\.zip$/i, '') + '.epub';

  // Already an EPUB archive (META-INF/container.xml at the zip root).
  if (zip.file('META-INF/container.xml')) {
    return { data: await file.arrayBuffer(), fileName: baseName };
  }

  // Zip wraps a single .epub file.
  const innerEpubs = entries.filter((f) => /\.epub$/i.test(f.name));
  if (innerEpubs.length === 1) {
    const epub = innerEpubs[0]!;
    return {
      data: await epub.async('arraybuffer'),
      fileName: epub.name.split('/').pop()!,
    };
  }

  // Zip contains the extracted EPUB folder (container.xml nested under a
  // top-level folder) — rezip with the folder stripped from every path.
  const container = entries.find((f) => /(^|\/)META-INF\/container\.xml$/i.test(f.name));
  if (container) {
    const prefix = container.name.replace(/META-INF\/container\.xml$/i, '');
    const rezip = new JSZip();
    for (const f of entries) {
      if (f.name.startsWith('__MACOSX/')) continue;
      const rel = f.name.startsWith(prefix) ? f.name.slice(prefix.length) : f.name;
      if (!rel) continue;
      const data = await f.async('arraybuffer');
      if (rel === 'mimetype') {
        rezip.file(rel, data, { compression: 'STORE' });
      } else {
        rezip.file(rel, data);
      }
    }
    const data = await rezip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      mimeType: 'application/epub+zip',
    });
    return { data, fileName: baseName };
  }

  return null;
}
