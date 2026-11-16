import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchReaderPage,
  readerErrorKey,
  readerPageMarkdown,
  ReaderFetchError,
  type ReaderPage,
} from './fetch-page';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('fetchReaderPage', () => {
  it('returns HTML with its format', async () => {
    stubFetch(new Response('<html><body><p>hi</p></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));
    const page = await fetchReaderPage('https://example.com', 'http://localhost:5001');
    expect(page.format).toBe('html');
    expect(page.text).toContain('<p>hi</p>');
  });

  it('passes a reader-service markdown body through as markdown', async () => {
    stubFetch(new Response('# 陈情令\n\n正文', {
      status: 200,
      headers: { 'content-type': 'text/markdown; charset=utf-8' },
    }));
    const page = await fetchReaderPage('https://baike.baidu.com/x', 'http://localhost:5001');
    expect(page.format).toBe('markdown');
    expect(page.text).toBe('# 陈情令\n\n正文');
  });

  it('carries the backend reason and upstream status on failure', async () => {
    stubFetch(new Response(JSON.stringify({ reason: 'blocked', status: 403 }), {
      status: 422,
      headers: { 'content-type': 'application/json' },
    }));
    await expect(
      fetchReaderPage('https://baike.baidu.com/x', 'http://localhost:5001'),
    ).rejects.toMatchObject({ name: 'ReaderFetchError', reason: 'blocked', status: 403 });
  });

  it('keeps the HTTP status when the error body is not JSON', async () => {
    stubFetch(new Response('Bad gateway', { status: 502 }));
    await expect(
      fetchReaderPage('https://example.com', 'http://localhost:5001'),
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe('readerPageMarkdown', () => {
  it('does not reconvert markdown as HTML', () => {
    const page: ReaderPage = { text: '# Title\n\n**bold**', format: 'markdown' };
    expect(readerPageMarkdown(page, 'https://example.com')).toBe('# Title\n\n**bold**');
  });

  it('converts HTML with the shared converter', () => {
    const page: ReaderPage = { text: '<p>Hello <strong>world</strong></p>', format: 'html' };
    expect(readerPageMarkdown(page, 'https://example.com')).toContain('**world**');
  });

  it('throws reason "empty" instead of returning a blank page', () => {
    const page: ReaderPage = { text: '<html><head><title>x</title></head></html>', format: 'html' };
    expect(() => readerPageMarkdown(page, 'https://example.com')).toThrowError(ReaderFetchError);
    try {
      readerPageMarkdown(page, 'https://example.com');
    } catch (e) {
      expect((e as ReaderFetchError).reason).toBe('empty');
    }
  });
});

describe('readerErrorKey', () => {
  it('maps blocked pages to the site-blocks message', () => {
    expect(readerErrorKey(new ReaderFetchError('x', 403, 'blocked')))
      .toBe('msg.site_blocks_reading');
  });

  it('maps empty pages to the no-readable-text message', () => {
    expect(readerErrorKey(new ReaderFetchError('x', 200, 'empty')))
      .toBe('msg.page_has_no_readable_text');
  });

  it('falls back to the generic load message', () => {
    expect(readerErrorKey(new Error('boom'))).toBe('msg.failed_to_load_url');
  });
});
