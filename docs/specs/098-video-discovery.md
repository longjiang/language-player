# SPEC-098: Video Discovery

## Metadata

- **Spec ID**: SPEC-098
- **Feature**: Find candidate videos for a language from Google-Trends search
  terms and translated popular topics, vet them, and hand them to the importer
- **Status**: complete (2026-10-16); metadata caching added 2026-10-22
- **Created**: 2026-10-16
- **Implemented**: 2026-10-16 — `4595cd8` (`zerotohero-python-server`).
  2026-10-22 — per-video metadata cache in front of the discover-phase probes
  (§ "Metadata cache")
- **ROADMAP Phase**: Phase 9: Backend Consolidation
- **See also**:
  - [SPEC-096 — Admin Video Ingestion](096-admin-video-ingestion.md) — the importer this feeds
  - [ARCH-035 — Caption Selection](../arch/035-caption-selection.md) — how a candidate's transcript is chosen
  - [ARCH-003 — Python Backend Architecture](../arch/003-python-backend-architecture.md)
  - [SPEC-039 — Full Database Migration](039-full-database-migration-supabase.md) — § 5.8, the admin surface this joins

## Overview

The legacy crawler could not only import a playlist you named — it could also
*find* videos, by searching Google's video results for terms from Google
Trends and a translated popular-topics list, then crawling whatever it found.
That pipeline lived in `utils_scout`
(`get_google_trends_youtube_search_terms` → `get_search_terms` →
`search_youtube_by_google_video_multiple_pages` →
`save_videos_to_discovery_content_talk`) and wrote through Directus.

This spec ports the *finding* half and points it at the Supabase importer:

```text
data/popular-topics.csv.txt  ─┐
data/youtube_search_terms/*.csv ─┴─► search terms (per language)
                                      │
                       Google video search (scraped, N pages/term)
                                      │
                       YouTube metadata (batched, error-aware)
                                      │
        eligibility (video_import_block_reason) · already-stored · dedupe
                                      │
                          one video per channel, best first
                                      │
                    review (default)  or  import_videos(talk=…)
```

## Why report-only by default

The search half scrapes Google's video-results HTML. That is fragile by
nature — a markup change, a consent interstitial or a rate limit all look like
"no results" — so `POST /admin/videos/discover` **returns the candidates for
review and imports nothing** unless `import: true` is passed. Compare
SPEC-096's importer, which is given explicit ids and can therefore be safe to
run unattended.

## API

`POST /admin/videos/discover` (admin-gated, like every route on the blueprint)

| Field | Meaning |
|---|---|
| `l2` (required) | language to discover for |
| `terms` (optional) | search terms; a list or comma-separated string |
| `term_limit` (optional) | use only the first N generated terms |
| `pages` (optional) | Google result pages per term (default 1, max 5) |
| `max_per_channel` (optional) | videos kept per channel (default 1) |
| `import` (optional, default false) | import the candidates |
| `limit` (optional) | import at most N candidates |
| `talk` (optional) | talk to file them under (default `Discover Content`) |

```json
{
  "l2": "zh",
  "terms": ["热门歌曲", "热门电视剧"],
  "scraped": 42,
  "candidates": [
    { "youtube_id": "…", "title": "…", "channel_id": "UC…", "views": 1200000, "term": "热门歌曲" }
  ],
  "skipped": {
    "already_stored": ["…"],
    "unavailable": ["…"],
    "locale_mismatch": ["…"],
    "region_restricted": ["…"],
    "channel_diversity": ["…"]
  }
}
```

With `import: true` the response also carries `imported_candidates` and an
`import` block holding the ordinary importer result (per-video outcomes,
summary, cursor).

## Search terms

`utils_video_discovery.search_terms(l2)` merges two shipped data sets, in the
legacy order and de-duplicated case-insensitively:

1. `data/popular-topics.csv.txt` — the header row is a language list and each
   row is one topic per language (`translated_search_terms`).
2. `data/youtube_search_terms/{lang}.csv` — Google-Trends exports, of which
   only the `TOP` section is used and the `RISING` section stops the parse
   (`trends_search_terms`).

A language with neither returns `[]`, so a caller can tell "nothing to search
for" from "no results".

## Vetting

`filter_candidates()` — the part that must not be naive:

| Outcome | Rule |
|---|---|
| `unavailable` | the batched `videos.list` did not return the id |
| `already_stored` | the id already exists under this language (one query for the whole batch) |
| `not_embeddable` / `region_restricted` / `locale_mismatch` | `video_import_block_reason()` — the **same** rule the importer applies, so discovery cannot offer something the importer would refuse |
| `channel_diversity` | beyond `max_per_channel`, after sorting by view count |

Survivors come back sorted by view count (the legacy ordering) and diversified
by channel, so one prolific uploader cannot fill a batch — the crawler kept
exactly one video per channel for the same reason.

A failed `videos.list` raises `YouTubeApiError` → **502**; it never degrades
into "nothing was found".

## Metadata cache

The vetting step is the only part of a discovery run that costs a YouTube API
call per candidate, and the same ids are probed over and over: the console
follows discovery with the language preflight (`POST /admin/videos/preflight`)
and the discovery screen (`POST /admin/videos/screen`) within seconds, and
re-running a set of terms re-probes the same candidates.

So every video resource is cached **individually**, one file per id, and read
before YouTube is asked:

| | |
|---|---|
| Bucket | `cache/video_metadata/{youtube_id}.json` |
| Entry | `{"fetched_at": <epoch>, "video": <videos.list resource>}` |
| Negative entry | `{"fetched_at": <epoch>, "unavailable": true}` — YouTube did not return the id (deleted, private) |
| TTL | 24 hours (`VIDEO_METADATA_CACHE_TTL_HOURS`, `0` disables the cache) |
| Tier | **local disk only** — no shared-host fallback (SPEC-037) |

`utils_youtube.get_video_details_cached()` drives the split probe: it collects
the cache hits, then hands **only the uncached ids** to
`get_video_details_batched()`, which still sends them in batches of 50. The
return shape is unchanged — `(details, unavailable, error)` — so callers do not
know whether an answer came from cache. A failed live request caches nothing,
so the next probe asks YouTube again rather than remembering a failure.

### Which probes use it

Discover-phase, read-only probes only:

| Caller | Endpoint |
|---|---|
| `utils_video_discovery.filter_candidates()` | `POST /admin/videos/discover` |
| `routes/admin.py` preflight | `POST /admin/videos/preflight` |
| `utils_video_screening.screen_videos()` | `POST /admin/videos/screen` |

The **importer** (`utils_video_import.import_video()` / `import_videos()`) and
**`sweep_unavailable()`** (`POST /admin/videos/sweep-unavailable`) keep calling
`get_video_details_batched()` directly. They must see live state: a
24-hour-old resource would let an import store a video that has since been
deleted or made private, and would hide a dead video from the sweep whose job
is to find exactly those.

### Failure modes

- Cache writes never fail a discovery run — an unwritable bucket degrades to
  the uncached behaviour.
- An entry whose `fetched_at` is older than the TTL, or that is malformed, is
  treated as a miss and deleted, so the bucket does not fill with entries
  nothing will read.
- Because the bucket is ephemeral, the two housekeeping jobs leave it alone:
  `prune_cache.py` deletes an oversized batch instead of offloading it
  (`remote_cache.LOCAL_ONLY_BUCKETS`) and `offload_cache.py` skips it. A cold
  entry is stale by definition; uploading it would only fill the shared host
  with data nothing reads.

## Importing

Discovery imports go through `utils_video_import.import_videos()` unchanged:
transcript download, lemmatization cache, difficulty scoring, the shared
eligibility rules and console ID allocation all apply. The default talk
(`Discover Content`) is created on demand by the talk/TV-show support in
SPEC-096, using the first imported video as its cover.

## Testing

`zerotohero-python-server/test_video_discovery.py` (12 cases) covers the term
merge and the `TOP`/`RISING` parser, the vetting matrix (unavailable /
already-stored / locale-mismatch / sorting), the API-failure path, channel
diversification, and the route: admin-only, input validation, report-only by
default, import when asked (honouring `limit` and the default talk), 502 on a
YouTube failure.

`zerotohero-python-server/test_video_metadata_cache.py` (13 cases) covers the
cache: a second probe of the same ids makes no `videos.list` request, uncached
ids still go out in batches of 50, only the missing ids are requested, the
`unavailable` tombstone is reused, an expired entry is refetched and removed,
`VIDEO_METADATA_CACHE_TTL_HOURS=0` disables the cache, a failed request caches
nothing, entries are one file per video, the cache never contacts the shared
host, discovery vetting reuses entries across runs, the importer keeps the live
probe, and the two housekeeping jobs neither offload nor keep the bucket's
files.

Everything network-shaped is stubbed; the data-file parsers run against the
files the repo ships.

## Known Limitations

- **The search half is a scraper.** Google changing its results page, showing
  a consent interstitial, or rate-limiting the caller all surface as "few or
  no results" — there is no error signal. Reviewing the candidate list before
  importing is the mitigation, which is why `import` defaults to false.
- **No cross-run memory for terms.** The same term searched twice returns the
  same candidates; ids already in the catalogue are filtered out, but nothing
  records "term X was searched on date Y". The **metadata** of the candidates
  is remembered for 24 hours (§ Metadata cache), which is what makes a re-run
  cheap; re-scraping Google is not.
- **Cached metadata is up to 24 hours old.** Within a discovery session that is
  harmless (the importer re-probes live before writing, and the sweep always
  probes live), but a video that appears, disappears or changes language in the
  last day is shown in discovery as it was when it was probed. Set
  `VIDEO_METADATA_CACHE_TTL_HOURS=0` to probe live.
- **Terms are a shipped snapshot.** `data/youtube_search_terms/*.csv` are
  2023-era Google-Trends exports (79 languages) and `popular-topics.csv.txt`
  is from the same period; refreshing them is a manual data task.
- **One page per term by default** to stay inside the caller's request budget;
  `pages` raises it at the cost of more scraping.

## Open Questions

- Should discovery record what each term returned, so a later call can tell
  "already searched, nothing new" without re-scraping?
- Should the run be paged like the channel/playlist imports (search N terms,
  return a cursor) instead of doing every term in one request?
- Is `max_per_channel=1` still the right default now that the importer can
  file results under a talk?
