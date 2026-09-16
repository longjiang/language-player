/**
 * Addressing for `/api/asset-proxy` — the same-origin relay for third-party
 * media that mainland China blocks (ADR-0046).
 *
 * ## Why the asset identity lives in the path, never in a query string
 *
 * The relay originally took its target as `?u=<absolute URL>`. On Netlify that
 * silently collapsed: a route handler's response is cached by the CDN, and the
 * cache key for `/api/asset-proxy` turned out to be the **path alone**. So the
 * first image ever fetched through the route was served for every thumbnail in
 * the app — every video, every language — for the lifetime of that entry.
 *
 * Measured on the live site (2026-09-16) against `/api/asset-proxy`:
 *
 * | Request                                        | Result             |
 * | ---------------------------------------------- | ------------------ |
 * | `?u=…/vi/dQw4w9WgXcQ/mqdefault.jpg`            | 200, 23,512 B      |
 * | `?u=…/vi/9bZkp7q19f0/mqdefault.jpg`            | 200, same bytes    |
 * | `?u=…/vi/AAAAAAAAAAA/mqdefault.jpg` (bogus id) | 200, same bytes    |
 * | no `u` at all (expected `400 Missing u`)       | 200, same bytes    |
 * | `?u=https://evil.example.com/x.jpg` (403)      | 200, same bytes    |
 *
 * All of them answered `Netlify Durable; hit` with the same `age` (~75,158 s),
 * i.e. they matched one stored object; a path that had never been cached
 * answered `age: 1`. Adding `&cachebust=1` changed nothing. The query string is
 * not part of the cache key, so it cannot be what tells two assets apart.
 *
 * Identity is therefore spelled as path segments, which the key does include:
 *
 *     /api/asset-proxy/img.youtube.com/vi/<videoId>/mqdefault.jpg
 *     /api/asset-proxy/commons.wikimedia.org/wiki/Special:FilePath/<file>
 *
 * `assetProxyUrl` (callers) and `parseAssetProxyTarget` (the route) are the two
 * halves of that scheme, kept together so they cannot drift apart.
 */

/**
 * Hosts the relay will fetch from.
 *
 * Deliberately an allowlist, and deliberately not a general proxy: an open
 * fetcher is an SSRF hole. Add a hostname only with a caller that needs it.
 */
export const ALLOWED_ASSET_HOSTS = [
  'img.youtube.com', // video thumbnails — video-service.ts `youtubeThumbnail`
  'i.ytimg.com', // the CDN form of the same thumbnails
  'commons.wikimedia.org', // Wiktionary audio — use-speech.ts `wiktionaryAudioUrl`
  'upload.wikimedia.org', // where `Special:FilePath` redirects to
] as const;

const ALLOWED = new Set<string>(ALLOWED_ASSET_HOSTS);

/** Where the relay mounts. Exported so callers and the route agree. */
export const ASSET_PROXY_BASE = '/api/asset-proxy';

/**
 * Build the same-origin proxy path for an upstream asset URL.
 *
 * Each segment of the upstream path is percent-encoded once, on top of the
 * encoding `URL#pathname` already carries — `parseAssetProxyTarget` undoes
 * exactly that one layer. The result is a distinct path per asset, which is
 * what keeps two assets from sharing a cache object.
 *
 * Throws on anything the relay would refuse anyway (non-https, host not
 * allowlisted, a query string), so a bad call site fails where it is written
 * rather than as a silently wrong image in the UI.
 */
export function assetProxyUrl(upstream: string): string {
  const url = new URL(upstream);

  if (url.protocol !== 'https:') {
    throw new Error(`asset-proxy: https only, got "${url.protocol}" for ${upstream}`);
  }
  if (!ALLOWED.has(url.hostname)) {
    throw new Error(`asset-proxy: host not allowlisted: "${url.hostname}"`);
  }
  if (url.search) {
    // There is no room for a query in this scheme: the cache key ignores it, so
    // two assets differing only by query would collide (see the file comment).
    throw new Error(`asset-proxy: target must not carry a query string: "${url.search}"`);
  }

  const segments = url.pathname.split('/').filter(Boolean).map(encodeURIComponent);
  if (segments.length === 0) {
    throw new Error(`asset-proxy: target has no path: ${upstream}`);
  }

  return `${ASSET_PROXY_BASE}/${url.hostname}/${segments.join('/')}`;
}

/** Outcome of reading a request's path segments back into an upstream URL. */
export type AssetProxyTarget =
  | { ok: true; url: URL }
  | { ok: false; reason: 'shape' | 'host'; detail: string };

/**
 * Turn `/api/asset-proxy/<host>/<path…>` segments back into the upstream URL.
 *
 * The framework hands the segments over percent-decoded, so they are rejoined
 * **raw**: they are the pieces of the original `URL#pathname`, which is itself
 * the encoded form. Re-encoding here would double-encode the target.
 *
 * Fails closed — a target that does not rebuild to exactly the allowlisted host
 * with a plain path (no query, no fragment) is refused rather than fetched.
 */
export function parseAssetProxyTarget(
  segments: readonly string[] | undefined,
): AssetProxyTarget {
  if (!segments || segments.length < 2) {
    return {
      ok: false,
      reason: 'shape',
      detail: `expected <host>/<path…>, got ${JSON.stringify(segments ?? null)}`,
    };
  }

  const host = segments[0];
  const rest = segments.slice(1);
  if (!host) {
    return { ok: false, reason: 'shape', detail: 'no host segment' };
  }
  if (!ALLOWED.has(host)) {
    return { ok: false, reason: 'host', detail: host };
  }

  let url: URL;
  try {
    url = new URL(`https://${host}/${rest.join('/')}`);
  } catch {
    return { ok: false, reason: 'shape', detail: `${host}/${rest.join('/')}` };
  }

  // A decoded segment could otherwise smuggle a `?`, `#` or authority change
  // past the allowlist check above; rebuild-or-refuse keeps the host honest.
  if (url.hostname !== host || url.search || url.hash) {
    return { ok: false, reason: 'shape', detail: url.href };
  }

  return { ok: true, url };
}
