import { NextResponse } from 'next/server';
import { log } from '@/lib/logger';

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
 * Deliberately an **allowlist**, and deliberately not a general proxy: an open
 * `?u=` fetcher is an SSRF hole. Add a hostname here only with a caller that
 * needs it.
 */
const ALLOWED_HOSTS = new Set([
  'img.youtube.com', // video thumbnails — video-service.ts `youtubeThumbnail`
  'i.ytimg.com', // the CDN form of the same thumbnails
  'commons.wikimedia.org', // Wiktionary audio — use-speech `wiktionaryAudioUrl`
  'upload.wikimedia.org', // where `Special:FilePath` redirects to
]);

/** Refuse anything implausibly large rather than buffering it. */
const MAX_BYTES = 8 * 1024 * 1024;

/** Cache length for a successful passthrough (thumbnails and audio never change). */
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800, immutable';

/**
 * GET /api/asset-proxy?u=<absolute https URL>
 *
 * Returns the upstream body with its content type, or a bare status when the
 * upstream fails — callers already render a fallback (an `onError` handler on
 * web, a blank box on mobile), so an error body would only ever be shown by
 * accident.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('u');
  if (!raw) {
    return NextResponse.json({ error: 'Missing u' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid u' }, { status: 400 });
  }

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    log(`[LP Web] asset-proxy refused host=${target.hostname} protocol=${target.protocol}`);
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  try {
    const upstream = await fetch(target, {
      // Thumbnails and audio are immutable, so let the fetch be cached too.
      next: { revalidate: 86400 },
      redirect: 'follow',
      headers: { accept: 'image/*,audio/*;q=0.9,*/*;q=0.8' },
    });

    if (!upstream.ok) {
      log(`[LP Web] asset-proxy upstream ${upstream.status} for ${target.hostname}`);
      return new NextResponse(null, { status: upstream.status });
    }

    const length = Number(upstream.headers.get('content-length') ?? '0');
    if (length > MAX_BYTES) {
      log(`[LP Web] asset-proxy refused ${length} bytes from ${target.hostname}`);
      return new NextResponse(null, { status: 413 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        'cache-control': CACHE_CONTROL,
      },
    });
  } catch (e) {
    log(`[LP Web] asset-proxy fetch failed for ${target.hostname}:`, (e as Error)?.message ?? e);
    return new NextResponse(null, { status: 502 });
  }
}
