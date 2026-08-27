import { describe, expect, it } from 'vitest';
import { normalizeVisionMarkdown } from './vision';
import { parseMarkdownBlocks } from './parser';

describe('normalizeVisionMarkdown — image-reader block breaking', () => {
  it('splits single-newline-separated prose into separate blocks', () => {
    const md = [
      '江戸時代 寛永二十一年(1644)',
      '五重塔は寛永十二年(1635)潰架したため、同十八年(1641)明正天皇の詔を奉じて、三代将軍家光が大檀那となって寛永二十年(1643)より復興がはじめられた。',
      '寺伝では長谷川等竹筆とされている。',
      '五重塔の初層は、毎年正月三が日だけ一般公開されている。',
    ].join('\n');

    const normalized = normalizeVisionMarkdown(md);
    expect(normalized).toBe(
      [
        '江戸時代 寛永二十一年(1644)',
        '',
        '五重塔は寛永十二年(1635)潰架したため、同十八年(1641)明正天皇の詔を奉じて、三代将軍家光が大檀那となって寛永二十年(1643)より復興がはじめられた。',
        '',
        '寺伝では長谷川等竹筆とされている。',
        '',
        '五重塔の初層は、毎年正月三が日だけ一般公開されている。',
      ].join('\n'),
    );

    const blocks = parseMarkdownBlocks(normalized);
    expect(blocks).toHaveLength(4);
    expect(blocks.filter((b) => b.kind === 'text')).toHaveLength(4);
  });

  it('collapses runs of blank lines but keeps each non-empty line a block', () => {
    const md = 'line one\n\n\nline two\nline three';
    const normalized = normalizeVisionMarkdown(md);
    expect(normalized).toBe('line one\n\nline two\n\nline three');
  });

  it('preserves fenced code blocks verbatim', () => {
    const md = 'Before\n```\nline 1\nline 2\n```\nAfter';
    const normalized = normalizeVisionMarkdown(md);
    expect(normalized).toBe('Before\n\n```\nline 1\nline 2\n```\n\nAfter');
  });

  it('handles CRLF line endings', () => {
    const normalized = normalizeVisionMarkdown('a\r\nb\r\nc');
    expect(normalized).toBe('a\n\nb\n\nc');
  });

  it('returns empty for empty/whitespace input', () => {
    expect(normalizeVisionMarkdown('')).toBe('');
    expect(normalizeVisionMarkdown('   \n  \n')).toBe('');
  });
});
