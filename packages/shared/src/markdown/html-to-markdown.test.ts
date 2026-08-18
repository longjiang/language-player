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

  it('extracts main content via article/main/body fallback', () => {
    const md = htmlToMarkdown(
      '<html><body><header>head</header><article><p>core</p></article></body></html>',
      'https://example.com',
    );
    expect(md).toContain('core');
    expect(md).not.toContain('head');
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
  it('prefers h1 over title', () => {
    expect(extractTitle('<title>t</title><h1>H</h1>')).toBe('H');
  });
  it('falls back to title', () => {
    expect(extractTitle('<title>t</title>')).toBe('t');
  });
});
