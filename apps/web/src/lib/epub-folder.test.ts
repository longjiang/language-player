import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { folderNameFromFiles, zipEpubFolder, type EpubFolderFile } from './epub-folder';

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
