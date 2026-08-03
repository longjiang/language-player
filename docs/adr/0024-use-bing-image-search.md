# ADR-0024: Use Bing Image Search for Word Photos (Replace Google Images and Openverse)

**Date**: 2026-08-03
**Status**: accepted
**See also**: [ARCH-003 (Python Backend Architecture)](../arch/003-python-backend-architecture.md), [ARCH-006 (Classic Dictionary Architecture)](../arch/006-classic-dictionary-architecture.md)

## Context

The Flask endpoint `/images/<term>/<lang>` (used by Classic's
`lib/word-photos.js getGoogleImages`) returned Google Images results, first via
an external scraper API (`mac-mini-m1.zerotohero.ca`) and later via direct
Google HTML scraping in `app_images.py`. Both paths are dead as of August 2026:

- Google removed the `AF_initDataCallback` JSON payload the scrapers parse and
  bot-flags headless browsers, so the endpoint returns nothing.
- Live verification: `GoogleImageScraper` 2.3.5 and `google_images_download`
  3.0.1 both returned 0/20 images across English, Spanish, and Japanese.

Meanwhile `apps/web`'s dictionary image search (`image-search-results.tsx`)
called Openverse directly (`api.openverse.org`) — a second, vendor-direct
source that violates the single-gateway rule and needed Openverse-specific
workarounds (dead-thumbnail sniffing for 424s, same-owner density caps).

We benchmarked alternatives live (2026-08-03, 20 images × 3 languages):

| Engine | Search latency | Download (en/es/ja) | Verdict |
|---|---|---|---|
| DDG (`ddgs`) | 0.56–1.0s | 9.2s / 9.5s / 78.8s | Works; rate-limits under load |
| Bing (async endpoint) | 0.36–0.45s | 7.0s / 4.2s / 46.9s | Works; fastest |
| Google (both packages) | — | 0/20 everywhere | Broken |

Neither Bing's `mkt` nor DDG's `region` is a true language filter: searching
"pie" with `es-ES`/`es-es` still returns English dessert pies. The web app
already disambiguates by appending the target language's native name to
Latin-script queries; that mechanism is retained.

## Decision

**Use Bing as the single image-search backend, served through Flask.**

1. **Flask is the Bing gateway.** `routes/core.py` `/images/<term>/<lang>` and
   `/img/<term>/<index>/<lang>` now call `app_images.get_bing_images(...)`
   instead of the Google scrapers.
2. **No new backend dependencies.** The Bing fetch is implemented with aiohttp
   + stdlib (`re`/`json` parsing of Bing's `images/async` `m="{...}"` blocks),
   matching the existing async style of `app_images.py`. `mkt` is derived from
   the `lang` parameter via `bing_market()` (default `en-US`, ~30 language
   mappings), 35 results per page, `adlt=moderate`.
3. **Backward-compatible response contract.** Results keep the classic
   `[{src, url, ...}]` shape used by `word-photos.js`; `title` is added and the
   existing per-term/per-language images cache is reused unchanged.
4. **apps/web stops calling Openverse.** `image-search-results.tsx` fetches
   `${PYTHON_API_URL}/images/<query>/<l2>` and maps results into the existing
   `SearchImage` shape. LLM query rewriting, query relaxation, thumbnail
   liveness checks, pills, pagination, and round-robin interleaving are
   unchanged.
5. **Openverse-specific logic is removed** (same-owner density caps); provider
   is reported as `bing`.
6. **Disambiguation stays at query-build time.** No engine-side language
   filtering is attempted; the target-language-name hint for Latin-script
   terms remains the mechanism for same-word-different-meaning cases.
7. **Index-phase liveness filter.** Before results are cached, each candidate
   `src` is pre-sniffed through the same `image.php` proxy path that `/img`
   uses (concurrent, first-chunk check) and URLs the proxy cannot deliver
   (200 + empty body) are dropped. This guarantees `/img/<term>/<i>/<lang>`
   serves working images instead of empty 200s. Cached results carry a
   version marker, so stale pre-filter or pre-thumbnail caches are never
   trusted (currently `v3`).
8. **Thumbnail-first results.** `src` is Bing's `turl` thumbnail when Bing
   provides one (typically ~30 KB vs ~400 KB full-size), falling back to the
   full-size `murl`; the full-size URL is preserved as `full` for future
   clients. The web widget and `/img` proxy therefore transfer small images
   only — enough to get a visual idea of a word.

## Consequences

### Gained

- **Working endpoint again**: ~35 results per query/language (verified live),
  replacing the 0-result Google scrapers.
- **Single gateway**: all image search flows through Flask — one cache, one
  rate-limit surface, and one place to swap providers again.
- **Faster**: sub-second search latency and 4–7s downloads for typical
  languages, versus DDG's slower downloads and rate limits.
- **Classic compatibility**: `word-photos.js` keeps working with no client
  changes.
- **No empty images**: the index-phase pre-sniff filters proxy-undeliverable
  URLs, so `/img/...` requests only ever see working images (first index call
  per term costs ~6s; later calls hit the filtered cache).
- **Smaller payloads**: thumbnail-first `src` (~30 KB) instead of full-size
  images (~400 KB) for most results.

### Accepted

- **Unofficial endpoint risk**: Bing's `images/async` page is not a public API
  and could change or start bot-flagging, like Google's did. Mitigation: the
  scraping logic is small, cached, and isolated in `app_images.py` behind
  Flask, so a future swap is cheap.
- **No license metadata**: Openverse provided Creative-Commons licensing;
  Bing results carry none. Word photos are illustrative links to their source
  pages, not licensed assets, and the UI already links back to the source.
- **No true language filtering**: ambiguous terms must be disambiguated in the
  query (already handled in `buildImageQuery`).
