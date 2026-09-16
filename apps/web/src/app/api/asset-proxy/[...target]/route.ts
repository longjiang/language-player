import { NextResponse } from 'next/server';
import { log } from '@/lib/logger';
import { parseAssetProxyTarget } from '@/lib/asset-proxy';

export const runtime = 'nodejs';

/**
 * Same-origin passthrough for third-party media that is blocked in mainland
 * China (ADR-0046).
 *
 * YouTube thumbnails and Wikimedia pronunciation audio are load-bearing UI, but
 * `img.youtube.com` and `commons.wikimedia.org` are unreachable from China, so
 * the browser must never request them directly. Fetching them here makes the
 * URL same-origin for the client and moves the (working) fetch to the server,
 * where the request is made from Netlify rather than from the learner's network.
 *
 * The target is addressed **by path**, e.g.
 *
 *     GET /api/asset-proxy/img.youtube.com/vi/<videoId>/mqdefault.jpg
 *
 * and not by the `?u=<url>` query string this route used to take. Netlify keys
 * the cached response on the path alone, so the query-string form served one
 * image for every thumbnail in the app; `lib/asset-proxy.ts` documents the
 * measurements and owns both halves of the scheme.
 */

/** Refuse anything implausibly large rather than buffering it. */
const MAX_BYTES = 8 * 1024 * 1024;

/** Cache length for a successful passthrough (thumbnails and audio never change). */
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800, immutable';

/**
 * Returns the upstream body with its content type, or a bare status when the
 * upstream fails — callers already render a fallback (an `onError` handler on
 * web, a blank box on mobile), so an error body would only ever be shown by
 * accident.
 */
export async function GET(request: Request, props: { params: Promise<{ target: string[] }> }) {
  const { target } = await props.params;

  // The old `?u=` form would land here as `/api/asset-proxy` plus a query. A
  // query is meaningless in this scheme and is not part of the cache key, so
  // reject it loudly rather than serve whatever the path alone resolves to.
  const { search } = new URL(request.url);
  if (search) {
    log(`[LP Web] asset-proxy rejected query string target=${(target ?? []).join('/')} search=${search}`);
    return NextResponse.json({ error: 'Target must be a path, not a query' }, { status: 400 });
  }

  const parsed = parseAssetProxyTarget(target);
  if (!parsed.ok) {
    log(
      `[LP Web] asset-proxy rejected reason=${parsed.reason} ` +
        `target=${(target ?? []).join('/')} detail=${parsed.detail}`,
    );
    return NextResponse.json(
      { error: parsed.reason === 'host' ? 'Host not allowed' : 'Invalid target' },
      { status: parsed.reason === 'host' ? 403 : 400 },
    );
  }

  const upstreamUrl = parsed.url;
  log(`[LP Web] asset-proxy fetching ${upstreamUrl.href}`);

  try {
    const upstream = await fetch(upstreamUrl, {
      // Thumbnails and audio are immutable, so let the fetch be cached too.
      next: { revalidate: 86400 },
      redirect: 'follow',
      headers: { accept: 'image/*,audio/*;q=0.9,*/*;q=0.8' },
    });

    if (!upstream.ok) {
      log(`[LP Web] asset-proxy upstream ${upstream.status} for ${upstreamUrl.href}`);
      return new NextResponse(null, { status: upstream.status });
    }

    const length = Number(upstream.headers.get('content-length') ?? '0');
    if (length > MAX_BYTES) {
      log(`[LP Web] asset-proxy refused ${length} bytes from ${upstreamUrl.hostname}`);
      return new NextResponse(null, { status: 413 });
    }

    log(`[LP Web] asset-proxy served ${upstreamUrl.href} bytes=${length || 'unknown'}`);

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        'cache-control': CACHE_CONTROL,
      },
    });
  } catch (e) {
    log(`[LP Web] asset-proxy fetch failed for ${upstreamUrl.href}: ${(e as Error)?.message ?? e}`);
    return new NextResponse(null, { status: 502 });
  }
}
