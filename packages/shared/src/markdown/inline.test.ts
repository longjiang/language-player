/**
 * Tests for the shared inline markdown tokenizer (SPEC-083).
 */

import { describe, expect, it } from 'vitest';
import { splitInlineMarkdown } from './inline';

describe('splitInlineMarkdown', () => {
  it('splits bold, italic, and code segments', () => {
    expect(splitInlineMarkdown('**b** *i* `c` plain')).toEqual([
      { type: 'bold', value: 'b' },
      { type: 'text', value: ' ' },
      { type: 'italic', value: 'i' },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'c' },
      { type: 'text', value: ' plain' },
    ]);
  });

  it('passes through text without markers', () => {
    expect(splitInlineMarkdown('no markers')).toEqual([{ type: 'text', value: 'no markers' }]);
  });

  it('handles empty and marker-only input', () => {
    expect(splitInlineMarkdown('')).toEqual([]);
    expect(splitInlineMarkdown('**only**')).toEqual([{ type: 'bold', value: 'only' }]);
  });
});
