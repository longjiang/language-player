import { NextResponse } from 'next/server';

/**
 * JSON response headers for read-only, user-independent API routes
 * (SPEC-108 Phase 3).
 *
 * `Cache-Control` alone is not enough. Netlify keys a function response on the
 * URL *plus* whatever the `Netlify-Vary` response header lists, and the Next
 * runtime sets that header itself — naming only its own RSC parameters. So a
 * cache entry is shared across any query parameter the adapter did not list.
 *
 * That was not theoretical: measured on 2026-10-27,
 * `/api/videos/Qgzv_LBictg?l2=ja` and `?l2=zh` returned byte-identical payloads
 * (`Cache-Status: Netlify Durable; hit` on the second), i.e. a Chinese learner
 * was served Japanese captions until the entry expired. Every cached route must
 * therefore name the parameters its payload actually depends on.
 *
 * Only use this for responses that are identical for every user. Anything that
 * reads the session (`/api/videos/recommend`) must stay uncached.
 */
export function cachedJson(
  body: unknown,
  { vary, sMaxAge = 3600 }: { vary: string[]; sMaxAge?: number },
) {
  const response = NextResponse.json(body);
  response.headers.set(
    'Cache-Control',
    `public, s-maxage=${sMaxAge}, stale-while-revalidate=86400`,
  );
  response.headers.set('Netlify-Vary', `query=${vary.join('|')}`);
  return response;
}
