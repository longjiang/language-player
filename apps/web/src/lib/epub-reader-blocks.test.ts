import { describe, expect, it } from 'vitest';
import { epubBlocksToReaderBlocks } from './epub-reader-blocks';
import type { EpubBlock } from './epub-book-types';

/**
 * The bridge must convert `EpubBlock[]` to `ReaderBlock[]` **1:1** — the same
 * length, same index order — so `BookLocation.spineIndex:blockIndex` stays
 * aligned whether a block is read as an `EpubBlock` (navigation / search /
 * fragments) or as a `ReaderBlock` (rendering).
 */
describe('epubBlocksToReaderBlocks (EPUB→shared markdown bridge)', () => {
  it('preserves 1:1 index alignment across all block shapes', () => {
    const epub: EpubBlock[] = [
      { kind: 'text', type: 'heading', depth: 1, text: '第１章　青豆', formats: [], srcCharBase: 0, anchors: [] },
      { kind: 'text', type: 'paragraph', text: 'あれは世界でいちばん退屈な町だった', formats: [], srcCharBase: 0, anchors: [] },
      // bold inline range → carries into the shared ReaderBlock
      { kind: 'text', type: 'paragraph', text: 'タマルが青豆を迎えた', formats: [{ start: 0, end: 2, type: 'bold' }], srcCharBase: 0, anchors: [] },
      { kind: 'text', type: 'blockquote', text: '引用', formats: [], srcCharBase: 0, anchors: [] },
      { kind: 'text', type: 'list-item', text: '箇条書き', formats: [], srcCharBase: 0, anchors: [] },
      { kind: 'text', type: 'pre', text: '<div>\n  foo\n</div>', formats: [], srcCharBase: 0, anchors: [] },
      { kind: 'image', imageUri: 'blob:abc', alt: '挿絵', srcCharBase: 0, anchors: [] },
    ];

    const out = epubBlocksToReaderBlocks(epub, 3);
    expect(out).toHaveLength(epub.length); // 1:1, no reordering

    // text blocks keep their type/depth/text/formats verbatim
    expect(out[0]).toMatchObject({ kind: 'text', type: 'heading', depth: 1, text: '第１章　青豆' });
    expect(out[1]).toMatchObject({ kind: 'text', type: 'paragraph', text: 'あれは世界でいちばん退屈な町だった' });
    expect(out[2]).toMatchObject({ kind: 'text', formats: [{ start: 0, end: 2, type: 'bold' }] });

    // pre becomes a fenced-code MarkdownBlock (shared web-reader handling),
    // whitespace preserved verbatim
    expect(out[5]).toMatchObject({ kind: 'markdown', raw: '```\n<div>\n  foo\n</div>\n```' });

    // image becomes an image MarkdownBlock so ReactMarkdown renders it richly
    expect(out[6]).toMatchObject({ kind: 'markdown', raw: '![挿絵](blob:abc)' });
  });

  it('maps a bare image (no alt) to an image markdown block', () => {
    const out = epubBlocksToReaderBlocks(
      [{ kind: 'image', imageUri: 'blob:x', srcCharBase: 0, anchors: [] }],
      0,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'markdown', raw: '![](blob:x)' });
  });

  it('keeps headings with a non-default depth', () => {
    const out = epubBlocksToReaderBlocks(
      [{ kind: 'text', type: 'heading', depth: 3, text: '見出し', formats: [], srcCharBase: 0, anchors: [] }],
      0,
    );
    expect(out[0]).toMatchObject({ kind: 'text', type: 'heading', depth: 3 });
  });
});
