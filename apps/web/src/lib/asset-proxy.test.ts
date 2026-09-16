import { describe, it, expect } from 'vitest';
import {
  ALLOWED_ASSET_HOSTS,
  ASSET_PROXY_BASE,
  assetProxyUrl,
  parseAssetProxyTarget,
} from './asset-proxy';

/**
 * Replay what the framework does between the browser and the route: take the
 * proxy URL the app rendered and hand the route its path segments, decoded.
 */
function segmentsOf(proxyUrl: string): string[] {
  const pathname = new URL(proxyUrl, 'https://example.com').pathname;
  return pathname.slice(ASSET_PROXY_BASE.length + 1).split('/').map(decodeURIComponent);
}

/** Full trip: upstream URL → rendered src → route → upstream URL. */
function roundTrip(upstream: string): string {
  const parsed = parseAssetProxyTarget(segmentsOf(assetProxyUrl(upstream)));
  if (!parsed.ok) {
    throw new Error(`route refused a url it was given: ${parsed.reason} — ${parsed.detail}`);
  }
  return parsed.url.href;
}

describe('assetProxyUrl', () => {
  it('addresses a YouTube thumbnail by path, not by query', () => {
    const url = assetProxyUrl('https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg');

    expect(url).toBe('/api/asset-proxy/img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
    // Guards the regression directly: Netlify's cache key ignored the query, so
    // every thumbnail in the app collapsed onto one cache object.
    expect(url).not.toContain('?');
  });

  it('gives two videos two different paths', () => {
    const a = assetProxyUrl('https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
    const b = assetProxyUrl('https://img.youtube.com/vi/9bZkp7q19f0/mqdefault.jpg');

    expect(a).not.toBe(b);
    // The path is the part the cache key definitely includes, so the paths
    // themselves must differ — differing only in a query is what failed.
    expect(a.split('?')[0]).not.toBe(b.split('?')[0]);
  });

  it('round-trips a plain thumbnail', () => {
    const upstream = 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    expect(roundTrip(upstream)).toBe(upstream);
  });

  it('round-trips a Wiktionary filename with non-ASCII characters', () => {
    const upstream =
      'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent('Zh-你好.ogg');

    expect(roundTrip(upstream)).toBe(upstream);
  });

  it('round-trips each allowlisted host', () => {
    for (const host of ALLOWED_ASSET_HOSTS) {
      const upstream = `https://${host}/some/asset.bin`;
      expect(roundTrip(upstream)).toBe(upstream);
    }
  });

  it('refuses a host that is not allowlisted', () => {
    expect(() => assetProxyUrl('https://evil.example.com/x.jpg')).toThrow(/not allowlisted/);
  });

  it('refuses a non-https target', () => {
    expect(() => assetProxyUrl('http://img.youtube.com/vi/x/mqdefault.jpg')).toThrow(/https only/);
  });

  it('refuses a target carrying a query string', () => {
    expect(() => assetProxyUrl('https://img.youtube.com/vi/x/mqdefault.jpg?w=100')).toThrow(
      /query string/,
    );
  });
});

describe('parseAssetProxyTarget', () => {
  it('reports a disallowed host as `host` so the route can answer 403', () => {
    const parsed = parseAssetProxyTarget(['evil.example.com', 'x.jpg']);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe('host');
  });

  it('rejects a host with no path', () => {
    const parsed = parseAssetProxyTarget(['img.youtube.com']);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe('shape');
  });

  it('rejects an empty target', () => {
    expect(parseAssetProxyTarget(undefined).ok).toBe(false);
    expect(parseAssetProxyTarget([]).ok).toBe(false);
  });

  it('refuses a decoded segment that smuggles a query string', () => {
    const parsed = parseAssetProxyTarget(['img.youtube.com', 'vi', 'x?w=100']);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe('shape');
  });

  it('refuses a decoded segment that smuggles a fragment', () => {
    expect(parseAssetProxyTarget(['img.youtube.com', 'vi', 'x#frag']).ok).toBe(false);
  });

  it('keeps the host honest when the path looks like an authority', () => {
    // `https://img.youtube.com/…@evil.example.com/` must stay on the allowlisted
    // host rather than being re-read as credentials for another one.
    const parsed = parseAssetProxyTarget(['img.youtube.com', '@evil.example.com', 'x.jpg']);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.url.hostname).toBe('img.youtube.com');
  });
});
