/**
 * Shared web-reader fetch helper (SPEC-087 §2 "one shared pipeline").
 *
 * Both apps load a web article identically: fetch the page through the Flask
 * `/proxy` endpoint (which validates the URL, sends browser headers, detects
 * anti-bot challenge pages and falls back to a rendering reader service — see
 * ADR-0052) and return the text plus its format. This is the ONLY place the
 * reader fetch is defined so the two platforms can never diverge.
 *
 * `text/markdown` in the response means the server already converted the page
 * (reader-service fallback): clients must NOT run it through the HTML
 * converter. Empty content is an error, never a blank reader.
 *
 * Pure platform-agnostic: uses the standard `fetch`/`encodeURIComponent`
 * globals available in both the browser (web) and React Native (mobile).
 */

import { htmlToMarkdown } from './html-to-markdown';

export type ReaderPageFormat = 'html' | 'markdown';

export interface ReaderPage {
  /** Raw response text — HTML, or markdown when `format === 'markdown'`. */
  text: string;
  format: ReaderPageFormat;
}

/**
 * A page that could not be read. `reason` is the backend's machine-readable
 * cause (`blocked`, `empty`, `invalid_url`, `not_found`, `timeout`, …) so the
 * UI can show a specific, localized message instead of a raw `HTTP 403`.
 */
export class ReaderFetchError extends Error {
  /** HTTP status the backend (or the target site) answered with. */
  readonly status: number;
  readonly reason?: string;

  constructor(message: string, status: number, reason?: string) {
    super(message);
    this.name = 'ReaderFetchError';
    this.status = status;
    this.reason = reason;
  }
}

/** Fetch a remote web page through the Flask `/proxy` endpoint.
 *  `apiBase` is the app's `PYTHON_API_URL`. */
export async function fetchReaderPage(url: string, apiBase: string): Promise<ReaderPage> {
  const res = await fetch(`${apiBase}/proxy?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { reason?: unknown; status?: unknown }
      | null;
    const reason = typeof body?.reason === 'string' ? body.reason : undefined;
    const upstream = typeof body?.status === 'number' ? body.status : res.status;
    throw new ReaderFetchError(`HTTP ${res.status}`, upstream, reason);
  }
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  return {
    text: await res.text(),
    format: contentType.includes('markdown') ? 'markdown' : 'html',
  };
}

/**
 * Turn a fetched page into the markdown the reader parses.
 *
 * HTML goes through the shared converter; a markdown response is passed
 * through untouched (converting it as HTML would destroy it). A page with no
 * readable text throws instead of rendering an empty reader (the silent
 * failure this replaced — ADR-0052).
 */
export function readerPageMarkdown(page: ReaderPage, url: string): string {
  const md = page.format === 'markdown' ? page.text : htmlToMarkdown(page.text, url);
  if (!md.trim()) {
    throw new ReaderFetchError('The page has no readable text', 200, 'empty');
  }
  return md;
}

/**
 * Translation key for a reader load failure. Kept in the shared package so
 * web and mobile map the backend's reasons the same way.
 */
export function readerErrorKey(e: unknown): string {
  if (e instanceof ReaderFetchError) {
    if (e.reason === 'empty') return 'msg.page_has_no_readable_text';
    if (e.reason === 'blocked') return 'msg.site_blocks_reading';
    if (e.status === 403 || e.status === 429) return 'msg.site_blocks_reading';
  }
  return 'msg.failed_to_load_url';
}
