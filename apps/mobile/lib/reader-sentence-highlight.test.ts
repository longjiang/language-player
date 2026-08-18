import { describe, expect, it } from 'vitest';
import type { ContentBlock, TextBlock } from '@/lib/parse-markdown';
import { isReaderTextBlock, localTextBlockIndex } from './reader-sentence-highlight';

function textBlock(id: string, type: TextBlock['type'] = 'paragraph'): TextBlock {
  return { kind: 'text', type, text: `block-${id}`, formats: [] };
}
function imageBlock(): ContentBlock {
  return { kind: 'image', uri: 'https://example.com/x.png' };
}

describe('isReaderTextBlock', () => {
  it('accepts the four reader body text kinds', () => {
    expect(isReaderTextBlock(textBlock('p', 'paragraph'))).toBe(true);
    expect(isReaderTextBlock(textBlock('q', 'blockquote'))).toBe(true);
    expect(isReaderTextBlock(textBlock('li', 'list-item'))).toBe(true);
    expect(isReaderTextBlock(textBlock('h', 'heading'))).toBe(true);
  });

  it('rejects non-text and non-body blocks', () => {
    expect(isReaderTextBlock(imageBlock())).toBe(false);
    expect(isReaderTextBlock({ kind: 'table', header: [], rows: [] })).toBe(false);
    expect(isReaderTextBlock({ kind: 'code', text: 'x' })).toBe(false);
    expect(isReaderTextBlock({ kind: 'hr' })).toBe(false);
    expect(isReaderTextBlock({ kind: 'html', text: '<p>x</p>' })).toBe(false);
  });
});

describe('localTextBlockIndex', () => {
  it('resolves the local index among text blocks, skipping non-text blocks', () => {
    // Page: [p1, image, heading, p2] — p2's global index is 3 but its
    // translation lives under local key 2 (blockTranslations keying).
    const p1 = textBlock('p1');
    const img = imageBlock();
    const h = textBlock('h', 'heading');
    const p2 = textBlock('p2');
    const visible: ContentBlock[] = [p1, img, h, p2];
    expect(localTextBlockIndex(visible, p2)).toBe(2);
    expect(localTextBlockIndex(visible, h)).toBe(1);
    expect(localTextBlockIndex(visible, p1)).toBe(0);
  });

  it('matches renderBlock lookup when local == global (first page, no extras)', () => {
    const a = textBlock('a');
    const b = textBlock('b');
    const visible: ContentBlock[] = [a, b];
    expect(localTextBlockIndex(visible, a)).toBe(0);
    expect(localTextBlockIndex(visible, b)).toBe(1);
  });

  it('returns -1 when the block is not on the current page', () => {
    const p1 = textBlock('p1');
    const other = textBlock('other');
    expect(localTextBlockIndex([p1], other)).toBe(-1);
  });

  it('returns -1 for non-text blocks or missing input', () => {
    const img = imageBlock();
    expect(localTextBlockIndex([img], img)).toBe(-1);
    expect(localTextBlockIndex(null, textBlock('p'))).toBe(-1);
    expect(localTextBlockIndex(undefined, textBlock('p'))).toBe(-1);
    expect(localTextBlockIndex([textBlock('p')], undefined)).toBe(-1);
  });
});
