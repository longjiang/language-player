import { describe, expect, it } from 'vitest';
import {
  normalizeQuoteBlocks,
  splitAiQuotes,
  cleanAiQuote,
  READER_AI_QUOTE_INSTRUCTION,
  formatTimestamp,
  parseTimestampToken,
  formatSubtitleContext,
} from './ai-quotes';

describe('normalizeQuoteBlocks', () => {
  it('isolates an inline marker onto its own blank-line-delimited block', () => {
    const inText = '前半句[[引用||translation]]后半句。';
    const out = normalizeQuoteBlocks(inText);
    expect(out).toBe('前半句\n\n[[引用||translation]]\n\n后半句。');
  });

  it('keeps a marker that is already on its own line unchanged in structure', () => {
    const inText = '第一段。\n\n[[引用||翻译]]\n\n第二段。';
    const out = normalizeQuoteBlocks(inText);
    // The hoisted marker stays a standalone block; no content is lost.
    expect(out).toContain('\n\n[[引用||翻译]]\n\n');
    expect(out.replace(/\n+/g, '\n').trim()).toBe(
      inText.replace(/\n+/g, '\n').trim(),
    );
  });

  it('hoists multiple markers, preserving order and surrounding prose', () => {
    const inText = '甲[[one||1]]乙[[two||2]]丙';
    const out = normalizeQuoteBlocks(inText);
    expect(out).toBe('甲\n\n[[one||1]]\n\n乙\n\n[[two||2]]\n\n丙');
  });

  it('leaves text without markers untouched', () => {
    const text = '普通段落，没有引用。\n\n第二段。';
    expect(normalizeQuoteBlocks(text)).toBe(text);
  });

  it('drops nothing: the marker content survives verbatim', () => {
    const inText = '他说[[吕布自遭李、郭之乱，逃出武关||After the Li Jue and Guo Si rebellion, Lü Bu fled through Wuguan]]了。';
    const out = normalizeQuoteBlocks(inText);
    expect(out).toContain(
      '[[吕布自遭李、郭之乱，逃出武关||After the Li Jue and Guo Si rebellion, Lü Bu fled through Wuguan]]',
    );
    expect(out.startsWith('他说\n\n')).toBe(true);
    expect(out.endsWith('\n\n了。')).toBe(true);
  });

  it('leaves malformed / unterminated markers alone', () => {
    const text = '未闭合的 [[引用||翻译 还有正文。';
    expect(normalizeQuoteBlocks(text)).toBe(text);
  });

  it('output round-trips through splitAiQuotes with identical segments', () => {
    const inText = '甲[[one||1]]乙[[two||2]]丙';
    const before = splitAiQuotes(inText);
    const after = splitAiQuotes(normalizeQuoteBlocks(inText));
    const strip = (segs: ReturnType<typeof splitAiQuotes>) =>
      segs.map((s) => (s.type === 'text' ? { ...s, value: s.value.trim() } : s)).filter(
        (s) => s.type !== 'text' || s.value.length > 0,
      );
    expect(strip(after)).toEqual(strip(before));
  });

  it('prompt instructs the model to put each quote on its own line', () => {
    expect(READER_AI_QUOTE_INSTRUCTION).toContain('OWN line');
    expect(READER_AI_QUOTE_INSTRUCTION).toContain('never inside a sentence');
  });
});

describe('splitAiQuotes', () => {
  it('splits text and quote segments in order', () => {
    const segs = splitAiQuotes('前[[a||1]]后[[b||2]]尾');
    expect(segs).toEqual([
      { type: 'text', value: '前' },
      { type: 'quote', original: 'a', translation: '1' },
      { type: 'text', value: '后' },
      { type: 'quote', original: 'b', translation: '2' },
      { type: 'text', value: '尾' },
    ]);
  });

  it('strips wrapping quotation marks from the passage', () => {
    const segs = splitAiQuotes('x[["quoted"||"gloss"]]y');
    expect(segs[1]).toEqual({ type: 'quote', original: 'quoted', translation: 'gloss' });
  });
});

describe('cleanAiQuote', () => {
  it('trims surrounding quote characters', () => {
    expect(cleanAiQuote(' “引文” ')).toBe('引文');
  });
});

describe('formatTimestamp', () => {
  it('formats seconds as MM:SS', () => {
    expect(formatTimestamp(5)).toBe('00:05');
    expect(formatTimestamp(65)).toBe('01:05');
  });
  it('formats ≥1 hour as H:MM:SS', () => {
    expect(formatTimestamp(3700)).toBe('1:01:40');
  });
});

describe('parseTimestampToken', () => {
  it('parses [MM:SS] and [H:MM:SS] tokens into seconds', () => {
    expect(parseTimestampToken('[00:05]')).toBe(5);
    expect(parseTimestampToken('[1:23]')).toBe(83);
    expect(parseTimestampToken('[1:02:03]')).toBe(3723);
  });
  it('returns null for non-timestamp tokens', () => {
    expect(parseTimestampToken('[foo]')).toBeNull();
    expect(parseTimestampToken('no timestamp')).toBeNull();
  });
});

describe('formatSubtitleContext', () => {
  it('prefixes each line with its [MM:SS] timestamp', () => {
    const out = formatSubtitleContext([
      { starttime: 5, text: 'hi' },
      { starttime: 65, text: 'bye' },
    ]);
    expect(out).toBe('[00:05] hi\n[01:05] bye');
  });
});
