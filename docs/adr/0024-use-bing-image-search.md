# ADR-0024: Use DuckDuckGo Image Search for Word Photos (After Google, Openverse, and Bing)

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

On 2026-08-04 production began serving unrelated/NSFW images. Root cause
(verified live from the VPS): **Bing serves random trending content to the
production datacenter IP** — `猫` returned "plank shoulder taps", a Minecraft
video, Spanish house plans, and audit papers on different fetches, even with a
warmed browser session and cookies. DuckDuckGo returns correct results from
the same IP (verified live: `猫` → cat photos). Bing therefore cannot be used
as the backend engine from production; DDG is used instead.

## Decision

**Use DuckDuckGo as the single image-search backend, served through Flask.**

1. **Flask is the image-search gateway.** `routes/core.py`
   `/images/<term>/<lang>` and `/img/<term>/<index>/<lang>` call
   `app_images.get_images(...)`, which fetches from DuckDuckGo.
2. **DDG via the `ddgs` package** (sync library, run in a worker thread with
   `asyncio.to_thread`). A `lang` → DDG `region` map (~30 languages, default
   `us-en`) biases results; 35 results per query.
3. **Backward-compatible response contract.** Results keep the classic
   `[{src, url, ...}]` shape used by `word-photos.js`; `title` and `full` are
   added. `src` is DDG's thumbnail when available, falling back to the
   full-size URL.
4. **apps/web unchanged.** It already calls
   `${PYTHON_API_URL}/images/<query>/<l2>`; LLM query rewriting, relaxation,
   pills, pagination, and broken-tile replacement are untouched.
5. **Cache with guards.** Results are cached per term/lang as a `v4` payload,
   but only if they pass sanity checks (≥3 items, all with `src`).
   `LP_IMAGES_CACHE=0` disables the cache entirely.
6. **Disambiguation stays at query-build time.** No engine-side language
   filtering is attempted; the target-language-name hint for Latin-script
   terms remains the mechanism for same-word-different-meaning cases.
7. **No index-phase filtering.** Candidates are returned as-is. `/img` fetches
   the source URL directly (browser UA, source-page referer when available)
   and tunnels the upstream status (403/404/502) to the client, which is
   responsible for handling broken tiles.

## Consequences

### 2026-08-04 amendment: apps/web reverts to Openverse

After production confirmed that **Bing soft-blocks the datacenter IP by
returning HTTP 200 with unrelated/trending images** (and that DDG's image
results are Bing-sourced anyway, `provider = "bing"` in `ddgs` 9.14.4), the
web app reverted its dictionary image widget to the pre-Bing setup:

- `apps/web/src/components/dictionary/image-search-results.tsx` queries the
  Openverse API directly again (`api.openverse.org/v1/images/`), with the
  original term searched first and LLM-rewritten queries used as a polyfill.
- Compact popup dictionary: original term only, 10 thumbnails, no LLM queries.
- Openverse-specific density caps (`OWNER_MAX_IMAGES = 2`) are restored so a
  single photographer cannot flood the grid.
- The Flask `/images/<term>/<lang>` gateway and DDG backend remain in place
  for the Classic app and other non-web clients; the web app no longer routes
  through it.
- Broken thumbnails are still hidden at render time and replaced from the
  reserve pool, preserving the post-Bing UX improvements.

### Backend: Flask `/images` and `/img` re-enabled on Openverse

The Flask endpoints were shut down as an immediate fix during the
soft-block incident (410 → silent empty results). They are re-enabled with
Openverse as the sole provider:

- `routes/core.py` again calls `app_images.get_images(...)` for
  `/images/<term>/<lang>` and proxies the selected thumbnail via
  `app_images.proxy_image(...)` for `/img/<term>/<index>/<lang>`, tunneling
  upstream 403/404 statuses to the client.
- `app_images.py` fetches from the Openverse API
  (`api.openverse.org/v1/images/`, `filter_dead=true`, page size 20) and maps
  results to the classic `[{src, url, title, full}]` contract (`src` =
  thumbnail, `url` = source page, `full` = full-size image).
- Cache payloads are now **v6** so any poisoned v5 (DDG-era) entries are
  ignored and rebuilt from Openverse.
- **Rate limits**: anonymous Openverse access is 5 req/hour / 100 req/day per
  IP, which is unusable for a production gateway. Set `OPENVERSE_API_KEY` to
  a free registered key (standard tier: 100 req/min / 10,000 req/day, 500
  thumbnails/min) before deploying; the per-term/lang cache keeps API calls
  to roughly one per unique word.

### Gained

- **Working endpoint again**: ~35 correct results per query/language from the
  VPS (verified live), replacing Google's dead scrapers and Bing's
  IP-flagged garbage.
- **Single gateway**: all image search flows through Flask — one cache, one
  rate-limit surface, and one place to swap providers again.
- **Single engine that works from production**: DDG is the only one of the
  tested engines that returns correct results from the VPS's datacenter IP.
- **Classic compatibility**: `word-photos.js` keeps working with no client
  changes.
- **Fast cold index**: no pre-sniff, so a first `/images/<term>/<lang>` call
  is roughly one DDG fetch (~1s); later calls hit the sanity-checked cache.
- **Smaller payloads**: thumbnail-first `src` (~30 KB) instead of full-size
  images (~400 KB) for most results.

### Accepted

- **Unofficial endpoint + rate limits**: DDG's image endpoint is not a public
  API and rate-limits aggressive use. Mitigation: the fetch is small, cached,
  and isolated in `app_images.py` behind Flask; `ddgs` raises a clear error on
  rate limiting, which surfaces as an empty result set rather than garbage.
- **Broken thumbnails reach clients**: unfiltered results mean some `/img`
  requests come back 403/404. The web widget swaps failed tiles for a muted
  placeholder; other clients see the tunneled status and can handle it.
- **No license metadata**: Openverse provided Creative-Commons licensing;
  DDG results carry none. Word photos are illustrative links to their source
  pages, not licensed assets, and the UI already links back to the source.
- **No true language filtering**: ambiguous terms must be disambiguated in the
  query (already handled in `buildImageQuery`).
