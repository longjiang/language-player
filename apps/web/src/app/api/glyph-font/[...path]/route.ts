import { NextRequest } from 'next/server';
import { PYTHON_API_URL } from '@/lib/api-url';

export const runtime = 'nodejs';

/**
 * Same-origin proxy for the SPEC-104 glyph-font endpoints.
 *
 * Keeping the font fetch on our own origin avoids CORS/font-loading edge
 * cases and keeps the browser off any blocked third-party host (ADR-0046).
 * The upstream hash URLs are immutable, so cache headers pass straight
 * through.
 */
const ALLOWED_FILE = /^[0-9a-f]{16}\.(woff2|ttf|otf)$/;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const joined = (path ?? []).join('/');

  const isManifest = joined === 'manifest';
  const isFile = ALLOWED_FILE.test(joined);
  if (!isManifest && !isFile) {
    return new Response('Not found', { status: 404 });
  }

  const search = request.nextUrl.search;
  const upstream = `${PYTHON_API_URL.replace(/\/+$/, '')}/glyph-font/${joined}${search}`;

  try {
    const response = await fetch(upstream, {
      // Manifest coverage can change when source fonts are updated; the
      // subset URLs themselves are content-addressed and immutable.
      next: isManifest ? { revalidate: 300 } : { revalidate: 31536000 },
    });

    const headers = new Headers();
    for (const key of ['content-type', 'cache-control', 'etag', 'content-length']) {
      const value = response.headers.get(key);
      if (value) headers.set(key, value);
    }
    if (!headers.has('content-type')) {
      headers.set('content-type', isManifest ? 'application/json' : 'application/octet-stream');
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch {
    return new Response('Glyph font service unavailable', { status: 503 });
  }
}
