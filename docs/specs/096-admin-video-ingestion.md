# SPEC-096: Admin Video Ingestion (YouTube id / channel / playlist → DB)

## Metadata

- **Spec ID**: SPEC-096
- **Feature**: Admin endpoints that add YouTube videos to `youtube_videos` —
  a single video, a list of ids, a whole channel, or a whole playlist — by
  fetching metadata, downloading the L2 transcript, populating the
  lemmatization cache and scoring difficulty
- **Status**: complete (2026-10-16)
- **Created**: 2026-10-16
- **Implemented**: 2026-10-16 — five commits, `ec70774` → `1df1911`
  (`zerotohero-python-server`)
- **ROADMAP Phase**: Phase 9: Backend Consolidation
- **Scope**: Flask backend (`zerotohero-python-server/`). The admin console UI
  that would call these endpoints is **not** part of this spec (ROADMAP:
  "Content moderation (videos / shows / talks) in the admin console" is still
  open).
- **See also**:
  - [ARCH-032 — YouTube Video Difficulty](../arch/032-youtube-video-difficulty.md) — how `lex_div` / `word_freq` / `difficulty` are defined
  - [ARCH-033 — Difficulty → Level Bucketing](../arch/033-difficulty-level-bucketing.md) — the thresholds those numbers feed
  - [ARCH-034 — Video Lemmatization Cache](../arch/034-video-lemmatization-cache.md) — the cache this pipeline writes
  - [SPEC-038 — Video Content Supabase Migration](038-video-content-supabase.md) — the consolidated id contract
  - [SPEC-039 — Full Database Migration](039-full-database-migration-supabase.md) — § 5.8 added the existing `/admin/*` routes
  - [SPEC-061 — Supabase Video Lemmatization + Cache ID Rebinding](061-video-lemmatization-supabase-cache.md)
  - [SPEC-091 — Subtitle HTML-Entity Decoding](091-subtitle-html-entity-decoding.md)
  - [ADR-0032 — Admin Console as a Separate Next.js App](<../adr/0032-admin-console-app.md>)
  - [ARCH-003 — Python Backend Architecture](../arch/003-python-backend-architecture.md)

## Overview

Adding videos used to mean running the Classic crawler
(`utils_scout.save_videos_with_subs_in_playlist` →
`utils_directus.save_video_with_transcript`) from a notebook against Directus
and MySQL. That path no longer matches the stack: the content lives in
Supabase (SPEC-038/039), it never scored difficulty, it created talk / TV-show
rows as a side effect, and it cannot be called over HTTP.

This spec adds five `is_admin`-gated Flask endpoints that ingest YouTube
content directly into `public.youtube_videos` through one shared pipeline:

```text
YouTube id / channel / playlist
   │
   ├─ videos.list (batches of 50)  ── metadata (title, channel, date, tags,
   │                                     category, locale, duration, madeForKids,
   │                                     views / likes / comments)
   ├─ eligibility                  ── unavailable / not embeddable / region-restricted
   ├─ caption pipeline             ── subs_l2 CSV (starttime,duration,line)
   ├─ lemmatize_video()            ── lemmatized_subs cache entry (ARCH-034)
   ├─ score_lemmas()               ── lex_div / word_freq / difficulty (ARCH-032)
   └─ insert or refresh            ── youtube_videos row, consolidated id (SPEC-038)
```

## User Stories

- As an admin, I want to paste a YouTube URL or id and have the video appear
  in the catalog with subtitles and a difficulty level, so that learners can
  watch it without anyone running a notebook.
- As an admin, I want to add a batch of ids in one call, so that a curated
  list of links does not need one request per video.
- As an admin, I want to resolve a channel handle (`@name`) to its channel id,
  so that I can pass the right reference to the channel import.
- As an admin, I want to import a whole channel or playlist in resumable
  chunks, so that a large import cannot hit a request timeout or lose the work
  it already did.
- As an admin, I want re-running an import to refresh metadata and backfill
  anything missing rather than creating duplicates, so that imports are
  idempotent.

## How It Worked Before (Classic / notebook)

| Legacy piece | What it did | Why it is not reused |
|---|---|---|
| `utils_scout.save_videos_with_subs_in_playlist` | Walked a playlist, created talks / TV shows, saved videos | Writes Directus, creates show rows, no difficulty, no HTTP surface |
| `utils_directus.save_video_with_transcript` | Built the Directus payload and POSTed it | Directus REST; the payload shape is now the Supabase column set |
| `utils_youtube.check_and_filter_youtube` | Filtered embeddable / age / region / captions | Returned a bare `[]` for both "no videos" and "API error" |
| `utils_video_lemma.add_lex_div_and_word_freq_to_video` | Scored one video | Wrote `UPDATE youtube_videos…` through the MySQL/Directus SQL helper |

The reusable parts (the caption pipeline, `lemmatize_video`,
`mtld_from_lemmas`, `zipf_frequency`, `cache_video_id`) are shared; the
storage and crawling layers were rewritten.

## Pipeline

### 1. Metadata (`utils_youtube.get_video_details_batched`)

`videos.list` accepts **at most 50 ids per request** (YouTube API hard limit),
so ids are chunked at 50 and the responses merged into one
`{youtube_id: resource}` map. The function returns three things:

- `details` — the resources the API returned,
- `unavailable` — requested ids the API did *not* return (deleted, private,
  or otherwise not visible),
- `error` — set when the request itself failed (HTTP error, quota, network,
  non-JSON body).

Separating "missing id" from "failed request" is the fix for the legacy
`[]`-means-everything behaviour: a quota error must not look like 50 deleted
videos. A failing batch aborts the call with `502` instead of marking the ids
dead.

Ids are validated against `^[A-Za-z0-9_-]{11}$` **before** the request
(`normalize_video_ids`), because one malformed id makes the YouTube API reject
the entire batch with `400 invalid`.

### 2. Eligibility (`utils_youtube.video_import_block_reason`)

| Reason | Condition | `force: true` |
|---|---|---|
| `unavailable` | the API did not return the id | no |
| `not_embeddable` | `status.embeddable` is false | no |
| `region_restricted` | `contentDetails.regionRestriction` is present (either `blocked` or `allowed`) | **yes** |
| `no_transcript` | no transcript in the L2 or one of its locales | no |

Only *new* inserts are filtered. An existing row under the same `l2` is
refreshed regardless, because the rule is "do not add", not "do not update".

**Members-only videos are not detected.** The YouTube Data API exposes no
`membersOnly` field on the video resource and no equivalent on
`videos.list`; a members-only video looks like an ordinary public video
(`privacyStatus: "public"`, `embeddable: true`). The only community-known
signal is a missing `statistics.viewCount`, which is documented as a
heuristic rather than a contract, so rejecting on it would risk dropping
perfectly good videos. Decided explicitly on 2026-10-16; revisit if the API
ever adds a real flag.

### 3. Transcript (`utils_video_import.transcript_csv`)

`app_youtubecaptions.get_best_l2_subs_with_meta(youtube_id, l2)` resolves the
caption in the L2 (or one of its locale variants, via `LOCALES`), using the
Webshare proxy and the caption cache. The result is stored as the same
`subs_l2` CSV shape the rest of the catalog uses:

```csv
starttime,duration,line
0.0,2.5,你好
```

`clean_generated` defaults to **false** for imports: the legacy crawler stored
YouTube's raw auto-generated captions, and LLM-normalizing every caption line
would make bulk imports orders of magnitude slower and more expensive. The
flag can be turned on per request.

### 4. Lemmatization cache (ARCH-034)

`utils_video_lemma.lemmatize_and_score_video()` calls `lemmatize_video()`,
which writes the whole-video `lemmatized_subs` entry keyed by
`cache_video_id(video_id)` — the **legacy Directus id**, so the watch page
(which translates the consolidated id back, SPEC-061) gets the same hit as for
a migrated video. `get_lemmas_from_video()` was changed to translate the cache
key the same way; before this spec it used the raw id and would have written
and looked up a cache entry under the consolidated id.

Cache writes stay **local-only**; the cron offload job (`prune_cache.py`)
moves cold entries to the shared host, exactly as for every other cache
writer.

### 5. Difficulty (ARCH-032 / ARCH-033)

The scoring math was extracted out of the Directus batch pipeline into pure
helpers so both paths share one implementation:

| Helper | Role |
|---|---|
| `compute_lex_div(lemmas)` | MTLD ÷ 1000, capped below 1, truncated to 17 dp |
| `compute_word_freq(lemmas, lang)` | mean Zipf frequency of the unique lemmas, 2 dp |
| `score_lemmas(lemmas, lang, lex_div, word_freq)` | fills in whichever half is missing, then `difficulty = lex_div / word_freq` |
| `lemmatize_and_score_video(video, l2, …)` | cache + score for one video, returns `(lex_div, word_freq, difficulty, lemma_count)` |

The incremental rule from ARCH-032 is preserved: a value that already exists
is never recomputed (and, in the refresh path, never overwritten). When both
halves already exist but `difficulty` is missing, difficulty is derived
arithmetically without re-reading the subtitles.

### 6. Insert or refresh

New rows get an **explicitly allocated consolidated id**
(`prefix * 10^10 + old_id + 1`, SPEC-038). This matters because
`youtube_videos.id` is `GENERATED BY DEFAULT AS IDENTITY` but its sequence
sits at the end of the *last* prefix block (`140000015875` at the time of
writing), so letting the default apply would file a Thai/Khmer/Malay-language
video as whatever language owns that block. `utils_content.next_video_id()`
computes the next id inside the language's own block; two concurrent imports
racing on the same id are retried (and the cache entry is re-keyed) rather
than failing the request.

Existing rows are refreshed with only the fields the API actually returned —
`metadata_from_api()` omits absent keys, so a video whose view/like counts are
hidden cannot blank those columns — plus a backfill of `subs_l2` and any
missing `lex_div` / `word_freq` / `difficulty`. Rows are inserted with
`status = 'draft'` and `type = 'other'`, matching every other row in the
table.

## API Endpoints

All five are registered on `routes/admin.py`'s blueprint and gated by
`require_admin()` (Supabase JWT `app_metadata.is_admin`).

| Endpoint | Method | Purpose |
|---|---|---|
| `/admin/videos/add` | POST | Add one video |
| `/admin/videos/add-batch` | POST | Add a list of ids |
| `/admin/channels/resolve` | GET | Handle / URL / id → channel id |
| `/admin/channels/add` | POST | Add (or update) a whole channel's uploads |
| `/admin/playlists/add` | POST | Add (or update) a whole playlist |

### `POST /admin/videos/add`

```json
{ "youtube_id": "dQw4w9WgXcQ", "l2": "zh", "force": false, "clean_generated": false }
```

`201` when added, `200` when skipped (`status: "skipped"` + `reason`), `400`
for a malformed id or an unknown language, `502` when the YouTube API fails.

### `POST /admin/videos/add-batch`

```json
{
  "youtube_ids": ["dQw4w9WgXcQ", "abcdefghijk"],
  "l2": "zh",
  "limit": 50,
  "cursor": { "offset": 0 },
  "force": false,
  "clean_generated": false,
  "refresh_existing": true
}
```

`youtube_ids` also accepts a comma-separated string. Always `200`; the body
carries one result per processed id:

```json
{
  "results": [
    { "youtube_id": "dQw4w9WgXcQ", "status": "added", "id": 40000123456,
      "difficulty": 0.0022, "lex_div": 0.0099, "word_freq": 4.5, "lines": 312 },
    { "youtube_id": "abcdefghijk", "status": "skipped", "reason": "region_restricted" }
  ],
  "summary": { "total": 2, "added": 1, "updated": 0, "skipped": 1, "failed": 0,
               "requested": 2, "invalid": 0 },
  "next_cursor": { "offset": 2 },
  "l2": "zh"
}
```

### `GET /admin/channels/resolve`

`?channel=@name` (aliases: `handle`, `url`, `q`) — a handle, a `UC…` id, or
any channel URL (`/channel/UC…`, `/@name`, `/c/Name`, `/user/Name`).

```json
{ "channel": { "channel_id": "UC_x5XG1OV2P6uZZ5FSM9Ttw", "title": "…",
               "handle": "@googledevelopers", "uploads_playlist_id": "UU_x5XG1OV2P6uZZ5FSM9Ttw",
               "thumbnail": "…", "subscribers": "2680000", "video_count": "6117" } }
```

Resolution tries `channels.list?forHandle=` first and falls back to
`forUsername=` so legacy `/c/` and `/user/` URLs still resolve.
`404` when nothing matches, `502` when the lookup itself failed.

### `POST /admin/channels/add` and `POST /admin/playlists/add`

```json
{ "channel": "@name", "l2": "zh", "limit": 50, "cursor": { "page_token": "…", "skip": 0 } }
```

```json
{ "playlist": "https://www.youtube.com/playlist?list=PL…", "l2": "ja", "limit": 50 }
```

Both walk a playlist (`channels/add` uses the channel's `UU…` uploads
playlist) and run each video through the same pipeline, then add
`"channel"` (channels only) and `"playlist_id"` to the batch response shape.

## Paging contract

A whole channel or playlist can be thousands of videos, each needing a
transcript download, so a single synchronous call would outlive gunicorn's
120-second request timeout. Both bulk shapes are therefore paged:

- **Flat list** (`add-batch`): `limit` (default 50, max 500) plus
  `cursor: {"offset": n}`; the response's `next_cursor` is null on the last
  page.
- **Playlist / channel**: `limit` plus an opaque
  `cursor: {"page_token": …, "skip": n}`. `skip` lets a call that stops
  mid-page resume exactly there, instead of re-listing the playlist from the
  start on every call. `next_cursor` is null once the playlist is exhausted.

`import_videos()` commits after **each** video, so a failure late in a page
cannot discard the rows already reported as added; a per-video exception is
caught, recorded as `failed`, and the rest of the page continues.

Background jobs with progress polling were considered and rejected: they need
a job registry that survives worker restarts (gunicorn runs 4 workers, and an
in-process registry is not shared), for a workflow that an admin tool can
just loop over.

## Error Mapping

| Exception | HTTP | Meaning |
|---|---|---|
| `UnknownLanguageError` | 400 | `l2` is not a known language |
| `ValueError` / `TypeError` | 400 | malformed id, missing field, bad cursor |
| `ChannelNotFoundError` (`LookupError`) | 404 | no channel for the reference |
| `YouTubeApiError` | 502 | `videos.list` failed (quota, auth, network) |
| `PlaylistFetchError` | 502 | `playlistItems.list` failed |
| `YouTubeChannelError` | 502 | `channels.list` failed |
| anything else | 500 | logged, then returned as `{"error": …}` |

## Files

| File | Role |
|---|---|
| `zerotohero-python-server/utils_video_import.py` | The ingestion pipeline (single, list, channel, playlist) |
| `zerotohero-python-server/routes/admin.py` | The five endpoints |
| `zerotohero-python-server/utils_youtube.py` | Batched `videos.list` + availability, eligibility, channel/playlist reference parsing and resolution |
| `zerotohero-python-server/utils_video_lemma.py` | `compute_lex_div` / `compute_word_freq` / `score_lemmas` / `lemmatize_and_score_video`; cache-key translation in `get_lemmas_from_video` |
| `zerotohero-python-server/utils_content.py` | `next_video_id()`, `get_videos_by_youtube_ids()` |
| `zerotohero-python-server/app_youtubecaptions.py` | Transcript download (unchanged, now shared by the import path) |
| `zerotohero-python-server/test_admin_video_import.py` | Unit + route tests (39 cases) |

## Testing

`python3.10 -m pytest test_admin_video_import.py` covers:

- eligibility matrix (unavailable / not embeddable / region-restricted, and
  `force` overriding the region check),
- id allocation and the payload written for a new video,
- refresh-only semantics (`refresh_existing: false`), metadata refresh, and
  the arithmetic difficulty backfill that needs no transcript,
- per-video failure isolation and per-page cursoring,
- playlist `(page_token, skip)` paging and API-error propagation,
- route-level auth (403), validation (400), status codes (200/201), and
  error mapping (404/502).

Everything network- or NLP-shaped (YouTube API, caption pipeline,
lemmatizer, database) is faked; the tests assert the ingestion *decisions*.

## Known Limitations

- **Members-only videos are not filtered** (see § 2). They will be added, and
  will fail to play for non-members.
- **Region restriction is "any `regionRestriction`"**, which is stricter than
  the crawler's old "blocked in US/GB/CA" rule. `force: true` overrides it.
- **The ngram subtitle index is not refreshed.** The `subs_l2` trigger nulls
  `subs_ngram_tsv` on write, so newly imported videos are not reachable
  through the PGroonga ngram path until `backfill_subs_ngram_tsv.py` runs.
- **No admin console UI yet** — the endpoints are called directly (curl or
  the admin app once it grows the screen).
- **`duration` is stored as the raw ISO-8601 string** (`PT3M44S`), matching
  every existing row; nothing parses it at write time.
- **Transcript downloads are serial** within a page. `limit` keeps a call
  inside the request timeout rather than relying on concurrency.
- **A new video added under a second language gets a second row** (ids are
  per-language-prefixed and dedupe is per `(youtube_id, l2)`), which is the
  documented behaviour: "already exists in the DB under the same l2".

## Open Questions

- Should imports also mark the video as searchable (run the ngram backfill for
  the new rows) instead of leaving that to the cron job?
- Should `clean_generated` default to true for single adds (where the cost is
  one video) and stay false for bulk?
- Is a members-only heuristic worth adding as an *advisory* flag (e.g.
  `warnings: ["possible_members_only"]`) rather than a rejection?
- Should the admin console expose these endpoints, and if so does it need a
  job/progress view rather than the cursor loop?
