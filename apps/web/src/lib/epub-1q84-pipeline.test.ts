// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import JSZip from 'jszip';
import { convertDocument } from './epub-book';
import { epubBlocksToReaderBlocks } from './epub-reader-blocks';

/** Convert an XHTML string to a body Element using the jsdom DOM. */
function parseBody(html: string): Element {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.querySelector('body');
  if (!body) throw new Error('no <body>');
  return body;
}

// Locate the 1Q84 BOOK2 fixture via the shared testing-assets symlink.
const FIXTURE = 'tmp/testing-assets/epub/ja/2009 村上春樹 - 1Q84 BOOK2.epub';
const hasFixture = existsSync(FIXTURE);

describe('1Q84 BOOK2 → shared markdown pipeline', () => {
  it('keeps the chapter title as the first TEXT block and images as markdown', { skip: !hasFixture }, async () => {
    const zip = await JSZip.loadAsync(readFileSync(FIXTURE));
    // 0005.xhtml = 第１章 青豆 (each chapter is its own spine doc).
    const xhtml = await zip.file('OPS/xhtml/0005.xhtml')!.async('text');
    const blocks = convertDocument(parseBody(xhtml));
    const readerBlocks = epubBlocksToReaderBlocks(blocks, 0);

    // 1:1 index alignment — the spine-local block index is preserved.
    expect(readerBlocks).toHaveLength(blocks.length);

    // The first non-empty block is the chapter title, as a tokenized text
    // block (so the spine-boundary page break lands on it and the word is
    // clickable in the dictionary).
    const first = readerBlocks[0];
    expect(first?.kind).toBe('text');
    expect((first as any).text).toContain('第１章');

    // Any images become markdown blocks (2 Q84 chapter opens are an image/text
    // doc; 0005 has none, but the pipeline must not error).
    expect(readerBlocks.every(b => b.kind === 'text' || b.kind === 'markdown')).toBe(true);
  });
});
