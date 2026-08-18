/**
 * Web-parity gate (SPEC-083 Task 6).
 *
 * Compares the shared parser against apps/web's parseMarkdown shim on the
 * common-case fixtures: headings, paragraphs, blockquotes, flat lists, and
 * inline formats — the cases where the web reader must render identically.
 * Both sides are normalized to the minimal web TextBlock shape (strip list
 * metadata / srcElementId / spine fields). Intentionally excluded (shared
 * core improvements, asserted in parser.test.ts): GFM tables, code fences,
 * hr, raw HTML blocks, nested-list depth, mixed text+image splitting,
 * strikethrough styling.
 */

import { describe, expect, it } from 'vitest';
import { parseMarkdown as webParseMarkdown } from '../../../../apps/web/src/lib/parse-markdown';
import { parseMarkdownBlocks } from './parser';
import type { ContentBlock, TextBlock } from './types';

/** Normalize a text block to the minimal web TextBlock shape. */
function toWebShape(block: ContentBlock): unknown {
  if (block.kind !== 'text') return block;
  const tb: TextBlock = block;
  return {
    kind: 'text',
    type: tb.type,
    ...(tb.depth !== undefined ? { depth: tb.depth } : {}),
    text: tb.text,
    formats: tb.formats,
  };
}

const FIXTURES: string[] = [
  '# Heading one',
  '## **Bold** heading',
  '### Heading with `code` and *italic*',
  'Plain paragraph with **bold**, *italic*, `code`, and [link](https://x.y).',
  '> A blockquote with *emphasis*',
  'First paragraph.\n\nSecond paragraph.',
  'A soft break\ninside one paragraph.',
  '- one\n- two\n- three',
  '1. a\n2. b',
  '**調理時間：**20分',
  'Trailing punctuation: **word,** and **word**.',
  '',
  '   \n\n  ',
];

describe('web parity (common-case fixtures)', () => {
  for (const md of FIXTURES) {
    it(`matches web parseMarkdown for: ${JSON.stringify(md.slice(0, 50))}`, () => {
      const webBlocks = webParseMarkdown(md).map(toWebShape);
      const sharedBlocks = parseMarkdownBlocks(md).map(toWebShape);
      expect(sharedBlocks).toEqual(webBlocks);
    });
  }
});

