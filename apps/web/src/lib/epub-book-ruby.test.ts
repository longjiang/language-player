// @vitest-environment jsdom
/**
 * Tests for ruby stripping in the web EPUB DOM walker (convertDocument).
 * The reader renders its own phonetics, so publisher ruby (rt readings,
 * rp fallback parens) must be stripped before block conversion — same
 * behavior as the shared htmlToMarkdown (mobile EPUB path).
 */

import { describe, expect, it } from 'vitest';
import { convertDocument } from './epub-book';
import type { EpubTextBlock } from './epub-book-types';

describe('convertDocument — ruby stripping', () => {
  it('keeps the ruby base text and drops rt/rp readings', () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML =
      '<p><ruby>漢字<rt>かんじ</rt></ruby>を読む<ruby>本<rp>（</rp><rt>ほん</rt><rp>）</rp></ruby>。</p>';
    const blocks = convertDocument(doc.body);
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as EpubTextBlock).text).toBe('漢字を読む本。');
  });

  it('drops bare rt/rp/rtc elements outside a ruby wrapper', () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<p>a<rt>x</rt>b<rp>(</rp>c<rtc>y</rtc></p>';
    const blocks = convertDocument(doc.body);
    expect((blocks[0] as EpubTextBlock).text).toBe('abc');
  });
});
