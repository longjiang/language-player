/**
 * Golden tests for the shared markdown parser (SPEC-083).
 *
 * The common-case fixtures (headings, paragraphs, lists, blockquotes,
 * bold/italic/code/link, images-in-paragraphs) mirror apps/web's current
 * parseMarkdown output — they are the parity gate for the web swap (Task 6).
 * The new-behavior fixtures (tables, code fences, hr, raw HTML, nested lists,
 * strikethrough, id anchors) assert the SPEC-083 extensions.
 */

import { describe, expect, it } from 'vitest';
import { parseMarkdownBlocks, repairDelimiters } from './parser';
import type { ContentBlock, TextBlock } from './types';

function textBlocks(md: string, opts?: { preserveIds?: boolean }): TextBlock[] {
  return parseMarkdownBlocks(md, opts).filter(
    (b): b is TextBlock => b.kind === 'text',
  );
}

/** First text block, asserting one exists (noUncheckedIndexedAccess-safe). */
function firstText(md: string, opts?: { preserveIds?: boolean }): TextBlock {
  const first = textBlocks(md, opts)[0];
  if (!first) throw new Error('expected at least one text block');
  return first;
}

describe('parseMarkdownBlocks — block structure', () => {
  it('parses headings with depth and inline formats preserved', () => {
    const blocks = parseMarkdownBlocks('# Hello **world**');
    expect(blocks).toEqual([
      {
        kind: 'text',
        type: 'heading',
        depth: 1,
        text: 'Hello world',
        formats: [{ start: 6, end: 11, type: 'bold' }],
      },
    ]);
  });

  it('parses paragraphs, blockquotes, and list items', () => {
    const blocks = parseMarkdownBlocks('> quoted\n\ntext\n\n- item one\n- item two');
    const types = blocks.map((b) => (b.kind === 'text' ? b.type : b.kind));
    expect(types).toEqual(['blockquote', 'paragraph', 'list-item', 'list-item']);
  });

  it('emits flat list items with listDepth/ordered/start (decided: keep flat, carry depth)', () => {
    const blocks = parseMarkdownBlocks('- a\n  - b\n    - c');
    const items = blocks.filter((b) => b.kind === 'text' && b.type === 'list-item') as TextBlock[];
    expect(items.map((i) => i.listDepth)).toEqual([0, 1, 2]);
    expect(items.map((i) => i.text)).toEqual(['a', 'b', 'c']);
  });

  it('carries ordered metadata and start numbers', () => {
    const blocks = parseMarkdownBlocks('3. x\n4. y');
    const items = blocks.filter((b) => b.kind === 'text' && b.type === 'list-item') as TextBlock[];
    expect(items.map((i) => ({ ordered: i.ordered, start: i.start, listDepth: i.listDepth })))
      .toEqual([
        { ordered: true, start: 3, listDepth: 0 },
        { ordered: true, start: 3, listDepth: 0 },
      ]);
  });

  it('handles mixed ordered/unordered nesting', () => {
    const blocks = parseMarkdownBlocks('1. a\n   - b');
    const items = blocks.filter((b) => b.kind === 'text' && b.type === 'list-item') as TextBlock[];
    expect(items.map((i) => ({ text: i.text, ordered: i.ordered, listDepth: i.listDepth })))
      .toEqual([
        { text: 'a', ordered: true, listDepth: 0 },
        { text: 'b', ordered: false, listDepth: 1 },
      ]);
  });

  it('emits CodeBlock for fenced and indented code', () => {
    const blocks = parseMarkdownBlocks('```ts\nconst x = 1;\n```\n\n    indented');
    expect(blocks[0]).toEqual({ kind: 'code', language: 'ts', text: 'const x = 1;' });
    expect(blocks[1]).toEqual({ kind: 'code', language: undefined, text: 'indented' });
  });

  it('emits ThematicBreakBlock for hr', () => {
    const blocks = parseMarkdownBlocks('a\n\n---\n\nb');
    expect(blocks.some((b) => b.kind === 'hr')).toBe(true);
  });

  it('emits HtmlBlock for raw HTML passthrough', () => {
    const blocks = parseMarkdownBlocks('<div class="x">hi</div>');
    expect(blocks).toEqual([{ kind: 'html', text: '<div class="x">hi</div>' }]);
  });

  it('emits TableBlock for GFM tables', () => {
    const blocks = parseMarkdownBlocks('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(blocks).toEqual([
      { kind: 'table', header: ['a', 'b'], rows: [['1', '2']] },
    ]);
  });

  it('emits ImageBlock for a lone image', () => {
    const blocks = parseMarkdownBlocks('![alt](https://x/y.png)');
    expect(blocks).toEqual([{ kind: 'image', uri: 'https://x/y.png', alt: 'alt' }]);
  });

  it('splits mixed text+image paragraphs into adjacent blocks', () => {
    const blocks = parseMarkdownBlocks('before ![alt](u.png) after');
    expect(blocks).toEqual([
      { kind: 'text', type: 'paragraph', text: 'before ', formats: [] },
      { kind: 'image', uri: 'u.png', alt: 'alt' },
      { kind: 'text', type: 'paragraph', text: ' after', formats: [] },
    ]);
  });

  it('skips empty paragraphs', () => {
    expect(parseMarkdownBlocks('')).toEqual([]);
    expect(parseMarkdownBlocks('\n\n')).toEqual([]);
  });
});

describe('parseMarkdownBlocks — inline formats', () => {
  it('extracts bold, italic, code, and link formats with offsets', () => {
    const block = firstText('**b** *i* `c` [l](https://x.y)');
    expect(block.text).toBe('b i c l');
    expect(block.formats).toEqual([
      { start: 0, end: 1, type: 'bold' },
      { start: 2, end: 3, type: 'italic' },
      { start: 4, end: 5, type: 'code' },
      { start: 6, end: 7, type: 'link', url: 'https://x.y' },
    ]);
  });

  it('extracts nested emphasis with correct offsets', () => {
    const block = firstText('**a *b* c**');
    expect(block.text).toBe('a b c');
    // Children are pushed first (italic), then the wrapping strong (bold).
    expect(block.formats).toEqual([
      { start: 2, end: 3, type: 'italic' },
      { start: 0, end: 5, type: 'bold' },
    ]);
  });

  it('extracts strikethrough (gfm)', () => {
    const block = firstText('~~gone~~ stays');
    expect(block.text).toBe('gone stays');
    expect(block.formats).toEqual([{ start: 0, end: 4, type: 'strikethrough' }]);
  });

  it('keeps formats inside headings', () => {
    const block = firstText('## **Important** *note*');
    expect(block.type).toBe('heading');
    expect(block.depth).toBe(2);
    expect(block.formats).toEqual([
      { start: 0, end: 9, type: 'bold' },
      { start: 10, end: 14, type: 'italic' },
    ]);
  });

  it('repairs CJK flanking delimiters (repairDelimiters)', () => {
    // The closing `**` can't right-flank before a digit, so the punctuation
    // moves after the delimiter: `**調理時間**：20分`.
    expect(repairDelimiters('**調理時間：**20分')).toBe('**調理時間**：20分');
    const block = firstText('**調理時間：**20分');
    expect(block.text).toBe('調理時間：20分');
    expect(block.formats).toEqual([{ start: 0, end: 4, type: 'bold' }]);
  });

  it('respects the format-offset invariant TokenizedText relies on', () => {
    const md = '# **A** plain *i* `c` ~~s~~ [l](https://x.y) end\n\n- item **bold**\n\n> quote *it*';
    for (const block of parseMarkdownBlocks(md)) {
      if (block.kind !== 'text') continue;
      for (const f of block.formats) {
        expect(f.start).toBeGreaterThanOrEqual(0);
        expect(f.end).toBeLessThanOrEqual(block.text.length);
        expect(f.start).toBeLessThan(f.end);
      }
    }
  });
});

describe('parseMarkdownBlocks — id anchors (EPUB fragments)', () => {
  it('maps <a id="…"></a> anchors to the following block when preserveIds', () => {
    const md = '<a id="sec1"></a>\n\nSome **bold** text.';
    const blocks = parseMarkdownBlocks(md, { preserveIds: true });
    const text = blocks.filter((b): b is TextBlock => b.kind === 'text');
    expect(text[0]!.srcElementId).toBe('sec1');
    expect(text[0]!.text).toBe('Some bold text.');
    // The anchor itself is consumed, not emitted as an HtmlBlock.
    expect(blocks.some((b) => b.kind === 'html')).toBe(false);
  });

  it('assigns the id to the first block after the anchor only', () => {
    const md = '<a id="a1"></a>\n\nFirst.\n\nSecond.';
    const text = textBlocks(md, { preserveIds: true });
    expect(text[0]!.srcElementId).toBe('a1');
    expect(text[1]!.srcElementId).toBeUndefined();
  });

  it('keeps non-anchor block html as HtmlBlock when preserveIds is off', () => {
    const blocks = parseMarkdownBlocks('<div id="sec1"></div>');
    expect(blocks.some((b) => b.kind === 'html')).toBe(true);
  });
});
