/**
 * Tests for the shared HTML→Markdown converter (SPEC-083), including the
 * preserveIds anchor mechanism and resolveImage (EPUB archive images).
 */

import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, extractTitle } from './html-to-markdown';
import { parseMarkdownBlocks } from './parser';

describe('htmlToMarkdown — basic conversion', () => {
  it('converts headings, paragraphs, bold, italic, and links', () => {
    const md = htmlToMarkdown(
      '<html><body><h1>Title</h1><p>Hello <strong>world</strong> and <em>more</em> <a href="/page">link</a>.</p></body></html>',
      'https://example.com',
    );
    expect(md).toContain('# Title');
    expect(md).toContain('**world**');
    expect(md).toContain('*more*');
    expect(md).toContain('[link](https://example.com/page)');
  });

  it('converts lists, blockquotes, code, hr, and images', () => {
    const md = htmlToMarkdown(
      '<ul><li>one</li><li>two</li></ul><blockquote>q</blockquote><pre><code>x</code></pre><hr><img src="/img.png" alt="pic">',
      'https://example.com',
    );
    expect(md).toContain('- one');
    expect(md).toContain('- two');
    expect(md).toContain('> q');
    expect(md).toContain('```\nx\n```');
    expect(md).toContain('---');
    expect(md).toContain('![pic](https://example.com/img.png)');
  });

  it('strips scripts, styles, and navigation', () => {
    const md = htmlToMarkdown(
      '<html><body><script>evil()</script><style>.x{}</style><nav>menu</nav><p>keep</p></body></html>',
      'https://example.com',
    );
    expect(md).not.toContain('evil');
    expect(md).not.toContain('menu');
    expect(md).toContain('keep');
  });

  it('strips head/doctype/comments (EPUB chapters)', () => {
    const md = htmlToMarkdown(
      '<!DOCTYPE html><html><head><title>Book</title><meta name="x" content="y"></head><body><p>Body text</p></body></html>',
      'https://example.com',
    );
    expect(md).not.toContain('Book');
    expect(md).not.toContain('DOCTYPE');
    expect(md).toContain('Body text');
  });

  it('decodes named and numeric entities', () => {
    const md = htmlToMarkdown('<p>a&mdash;b &amp; c &#65; &#x42;</p>', 'https://example.com');
    expect(md).toContain('a—b & c A B');
  });

  it('extracts main content via article/main/body fallback', () => {
    const md = htmlToMarkdown(
      '<html><body><header>head</header><article><p>core</p></article></body></html>',
      'https://example.com',
    );
    expect(md).toContain('core');
    expect(md).not.toContain('head');
  });

  it('strips ruby annotations, keeping only the base text', () => {
    const md = htmlToMarkdown(
      '<p><ruby>漢字<rt>かんじ</rt></ruby>を読む<ruby>本<rp>（</rp><rt>ほん</rt><rp>）</rp></ruby>。</p>',
      'https://example.com',
    );
    expect(md).toBe('漢字を読む本。');
  });

  it('drops bare rt/rp elements outside a ruby wrapper', () => {
    const md = htmlToMarkdown('<p>a<rt>x</rt>b<rp>(</rp>c<rtc>y</rtc></p>', 'https://example.com');
    expect(md).toBe('abc');
  });
});

describe('htmlToMarkdown — site chrome & rendering hardening (SPEC-083 unification)', () => {
  it('strips a nested .infobox table as a whole element', () => {
    const md = htmlToMarkdown(
      '<html><body><div id="mw-content-text">' +
        '<p>Lead <b class="mw-selflink">Bold</b>.</p>' +
        '<table class="infobox geography vcard"><tr><td>leak1</td></tr>' +
        '<tr><td><table><tr><td>nested-leak</td></tr></table></td></tr></table>' +
        '<p>Keep.</p>' +
      '</div></body></html>',
      'https://example.com',
    );
    expect(md).toContain('Lead **Bold**.');
    expect(md).toContain('Keep.');
    expect(md).not.toContain('leak1');
    expect(md).not.toContain('nested-leak');
  });

  it('preserves bold/italic on tags that carry attributes', () => {
    const md = htmlToMarkdown(
      '<p><b class="mw-selflink">Bold</b> and <strong style="color:red">Strong</strong> and <em id="x">It</em>.</p>',
      'https://example.com',
    );
    expect(md).toContain('**Bold**');
    expect(md).toContain('**Strong**');
    expect(md).toContain('*It*');
  });

  it('promotes lazy-loaded data-src images', () => {
    const md = htmlToMarkdown(
      '<img src="data:image/gif;base64,R0lGODlhAQAB" data-src="/real.png" alt="pic">',
      'https://example.com',
    );
    expect(md).toContain('![pic](https://example.com/real.png)');
    expect(md).not.toContain('R0lGODlhAQAB');
  });

  it('keeps link titles in the markdown (like the web reader)', () => {
    const md = htmlToMarkdown(
      '<a href="/page" title="Page Title">link</a>',
      'https://example.com',
    );
    expect(md).toContain('[link](https://example.com/page "Page Title")');
  });
});

describe('htmlToMarkdown — resolveImage', () => {
  it('rewrites image srcs through the resolver', () => {
    const md = htmlToMarkdown(
      '<img src="images/x.jpg" alt="x">',
      'https://example.com/book/',
      { resolveImage: (src) => `file:///books/${src}` },
    );
    expect(md).toContain('![x](file:///books/images/x.jpg)');
  });

  it('falls back to baseUrl resolution when the resolver returns null', () => {
    const md = htmlToMarkdown('<img src="images/x.jpg" alt="x">', 'https://example.com/book/', {
      resolveImage: () => null,
    });
    expect(md).toContain('![x](https://example.com/book/images/x.jpg)');
  });
});

describe('htmlToMarkdown — preserveIds anchors', () => {
  it('emits anchors for id-bearing blocks and parser maps them', () => {
    const md = htmlToMarkdown(
      '<html><body><section id="ch1"><h1>Chapter</h1><p>Body text.</p></section></body></html>',
      'https://example.com',
      { preserveIds: true },
    );
    // Section id inherited by both blocks.
    const blocks = parseMarkdownBlocks(md, { preserveIds: true });
    const texts = blocks.filter((b) => b.kind === 'text');
    expect(texts.map((t) => t.srcElementId)).toEqual(['ch1', 'ch1']);
  });

  it('prefers the element own id over the ancestor id', () => {
    const md = htmlToMarkdown(
      '<section id="s1"><h2 id="own">Sub</h2></section>',
      'https://example.com',
      { preserveIds: true },
    );
    const blocks = parseMarkdownBlocks(md, { preserveIds: true });
    const [heading] = blocks.filter((b) => b.kind === 'text');
    expect((heading as any).srcElementId).toBe('own');
  });

  it('emits no anchors without ids (web-reader path unchanged)', () => {
    const md = htmlToMarkdown('<p>No ids here.</p>', 'https://example.com', {
      preserveIds: true,
    });
    expect(md).not.toContain('<a id=');
  });

  it('anchors survive round-trip without polluting rendered text', () => {
    const md = htmlToMarkdown(
      '<section id="ch1"><p>One.</p></section>',
      'https://example.com',
      { preserveIds: true },
    );
    expect(md).toContain('<a id="ch1"></a>');
    expect(md).not.toContain('href');
  });
});

describe('extractTitle', () => {
  // Priority matches the web reader: <title> → og:title → first <h1>.
  it('prefers title over h1', () => {
    expect(extractTitle('<title>t</title><h1>H</h1>')).toBe('t');
  });
  it('falls back to og:title when no <title>', () => {
    expect(extractTitle('<meta property="og:title" content="og" /><h1>H</h1>')).toBe('og');
  });
  it('falls back to h1 when no title/og', () => {
    expect(extractTitle('<h1>H</h1>')).toBe('H');
  });
  it('returns null when no title/og/h1', () => {
    expect(extractTitle('<p>plain</p>')).toBeNull();
  });
});
