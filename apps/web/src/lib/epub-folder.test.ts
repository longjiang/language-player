import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { folderNameFromFiles, unwrapEpubZip, zipEpubFolder, type EpubFolderFile } from './epub-folder';

function file(name: string, content: string): EpubFolderFile {
  return { path: name, file: new File([content], name.split('/').pop()!) };
}

describe('folder EPUB zipping', () => {
  it('keeps mimetype as the first, stored zip entry', async () => {
    const files: EpubFolderFile[] = [
      file('Book.epub/text/ch1.xhtml', '<html><body><p>Hola</p></body></html>'),
      file('Book.epub/mimetype', 'application/epub+zip'),
      file('Book.epub/META-INF/container.xml', '<container/>'),
      file('Book.epub/content.opf', '<package/>'),
    ];
    const data = await zipEpubFolder(files);
    const zip = await JSZip.loadAsync(data);
    const names = Object.keys(zip.files).filter((n) => !n.endsWith('/'));
    expect(names).toContain('Book.epub/mimetype');
    await expect(zip.file('Book.epub/mimetype')!.async('string')).resolves.toBe('application/epub+zip');
    await expect(zip.file('Book.epub/text/ch1.xhtml')!.async('string')).resolves.toContain('Hola');
  });

  it('derives the top-level folder name', () => {
    const files = [
      file('My Book.epub/mimetype', 'application/epub+zip'),
      file('My Book.epub/META-INF/container.xml', '<container/>'),
    ];
    expect(folderNameFromFiles(files)).toBe('My Book.epub');
  });
});

async function zipFile(name: string, entries: [string, string | Uint8Array][]): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of entries) zip.file(path, content);
  const data = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([data], name);
}

describe('unwrapEpubZip', () => {
  it('keeps an archive that is already an EPUB and normalizes the name', async () => {
    const file = await zipFile('Book.epub.zip', [
      ['mimetype', 'application/epub+zip'],
      ['META-INF/container.xml', '<container/>'],
      ['content.opf', '<package/>'],
    ]);
    const out = await unwrapEpubZip(file);
    expect(out).not.toBeNull();
    expect(out!.fileName).toBe('Book.epub');
    const zip = await JSZip.loadAsync(out!.data);
    expect(zip.file('META-INF/container.xml')).toBeTruthy();
  });

  it('extracts a single inner .epub', async () => {
    const inner = new JSZip();
    inner.file('mimetype', 'application/epub+zip');
    inner.file('META-INF/container.xml', '<container/>');
    inner.file('content.opf', '<package/>');
    const innerData = await inner.generateAsync({ type: 'uint8array' });
    const file = await zipFile('book.zip', [['novel.epub', innerData]]);
    const out = await unwrapEpubZip(file);
    expect(out).not.toBeNull();
    expect(out!.fileName).toBe('novel.epub');
    const zip = await JSZip.loadAsync(out!.data);
    expect(zip.file('META-INF/container.xml')).toBeTruthy();
  });

  it('rezips an extracted EPUB folder with the folder stripped', async () => {
    const file = await zipFile('Book.epub.zip', [
      ['Book.epub/mimetype', 'application/epub+zip'],
      ['Book.epub/META-INF/container.xml', '<container/>'],
      ['Book.epub/content.opf', '<package/>'],
      ['Book.epub/OEBPS/ch1.xhtml', '<html/>'],
    ]);
    const out = await unwrapEpubZip(file);
    expect(out).not.toBeNull();
    expect(out!.fileName).toBe('Book.epub');
    const zip = await JSZip.loadAsync(out!.data);
    expect(zip.file('META-INF/container.xml')).toBeTruthy();
    expect(zip.file('OEBPS/ch1.xhtml')).toBeTruthy();
    expect(zip.file('Book.epub/mimetype')).toBeFalsy();
  });

  it('returns null for a zip without an EPUB', async () => {
    const file = await zipFile('archive.zip', [['readme.txt', 'hello']]);
    await expect(unwrapEpubZip(file)).resolves.toBeNull();
  });
});
