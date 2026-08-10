# SPEC-061: Supabase-Backed Video Lemmatization + Cache ID Rebinding

## Metadata

- **Spec ID**: SPEC-061
- **Feature**: Move `/lemmatize-video` and `/lemmatize-video-normalized` onto the Supabase video read path; reuse existing Directus-ID video lemmatization caches without renaming files
- **Status**: draft
- **Created**: 2026-08-10
- **ROADMAP Phase**: Phase 9: Backend Consolidation
- **See also**:
  - [SPEC-038 — Video Content Supabase Migration](038-video-content-supabase.md)
  - [SPEC-039 — Full Database Migration](039-full-database-migration-supabase.md)
  - [ADR-0021 — Video Content Migration](<../adr/0021-migrate-video-content-to-supabase.md>)
  - [ARCH-016 — Server Tokenization Pipeline](../arch/016-server-tokenization.md)

## Overview

The video lemmatization endpoints still fetch videos from Directus, so
consolidated Supabase video IDs return `null`, and the video lemmatization
cache is keyed by whatever ID the caller passes. This spec moves both
endpoints onto `utils_content` (Supabase), keeps `/lemmatize-video` on the old
Directus-ID contract, makes `/lemmatize-video-normalized` accept the new
consolidated ID, and rebinds cache lookups to the old Directus ID at
read/write time — no bulk cache file rename on local or remote storage.

## Background

### Current call path

1. `GET /lemmatize-video` → `app_directus.get_and_lemmatize_video_by_id()`
2. `GET /lemmatize-video-normalized` → `app_directus.get_and_lemmatize_video_by_id_normalized()`
3. Both call `utils_directus.get_video()`, which still reads Directus.
4. `utils_video_lemma.lemmatize_video()` reads/writes
   `cache/lemmatized_subs/{iso639-3}/{video_id}`.

### Verified remapping results

The documented formula is correct:

```text
new_id = prefix * 10^10 + old_id
old_id = new_id % 10^10
```

Spot-checking every language in `L2_PREFIX` against real Supabase IDs found
two errors:

| Code | Current prefix | Actual prefix |
|---|---|---|
| `ca` | 2 | 9 |
| `eu` | missing → defaults to 1 | 2 |

All other mapped languages match their actual Supabase prefix. `ko` round-trips
correctly (`67` ↔ `30000000067`), while `ca`/`eu` old IDs currently remap into
the wrong ID block and return 404.

### Why not bulk-rename cache files

The remote cache API (`remote_cache.py`) supports get/set/delete by exact key
only — no list, rename, or batch-move. Local and remote caches are also not
synchronized copies (the offload job deletes local files after upload), so a
physical rename cannot be made atomic across both stores. Lookup-time ID
translation gives the same reuse with no data movement and no risk of moving
caches into the wrong prefix block.

## Requirements

- **R1**: `/lemmatize-video` keeps the Directus video ID as its parameter but
  fetches the video + `subs_l2` from Supabase.
- **R2**: `/lemmatize-video-normalized` accepts the consolidated Supabase video
  ID as its parameter.
- **R3**: Both endpoints use the same underlying cache, stored under the old
  Directus video ID.
- **R4**: Existing cache files on local disk and the remote host are reused
  without being renamed.
- **R5**: `l2`-based prefix mapping is correct, keyed by ISO code, and has no
  silent default-to-prefix-1 fallback.
- **R6**: Response shapes stay unchanged: legacy raw format for
  `/lemmatize-video`, unified `{ md5: { tokens: [...] } }` for
  `/lemmatize-video-normalized`.
- **R7**: Existing clients are not broken by the route change; no route is
  removed.

## Implementation Plan

### 1. Fix the prefix map

**Files**: `zerotohero-python-server/utils_user_data.py`

- Add a code-keyed prefix map (`L2_PREFIX_BY_CODE`) covering every language
  that has migrated videos. Values are the source shard number, verified
  against Supabase:
  - `ca` → `9`
  - `eu` → `2`
  - all other codes already in `L2_PREFIX` keep their current prefix.
- Keep `L2_PREFIX` (Directus language ID → prefix) only where legacy callers
  still need it, or remove it after all callers migrate to ISO codes.
- Change `remap_video_id()` to accept either an ISO code or a legacy Directus
  language ID, and remove the `L2_PREFIX.get(..., 1)` default. Unknown
  languages should return `None`/raise rather than silently remap into the
  base shard.
- Add a unit test that asserts the full map against `youtube_videos_suffix`
  (or against a committed fixture of actual Supabase prefixes), so `ca`/`eu`
  regressions are caught.

### 2. Supabase video fetch with subs

**Files**: `zerotohero-python-server/utils_content.py`

- Add `include_subs=False` to `get_video_by_id()` (or add
  `get_video_with_subs_by_id()`).
- When `include_subs=True`, include `subs_l2` in the SELECT and return it on
  the video dict so `lemmatize_video()` can consume it unchanged.
- Keep `resolve_video_id()` behavior: old IDs (< `10^10`) are remapped when
  `l2_code` is supplied; consolidated IDs pass through.

### 3. Cache ID translation helper

**Files**: `zerotohero-python-server/utils_video_lemma.py`

Add a single helper:

```python
def cache_video_id(video_id, l2_code=None):
    """Return the Directus ID used for the lemmatized-subs cache key.

    - Old Directus ID  -> unchanged
    - Consolidated ID  -> new_id % 10**10 when the prefix is known
    - Unknown/foreign  -> unchanged (future-proof for non-prefixed IDs)
    """
```

Rules:

- `video_id < 10**10` → use as-is.
- `video_id >= 10**10` and `video_id // 10**10` is a known prefix → use
  `video_id % 10**10`.
- Prefix not recognized → use the full consolidated ID (do not guess).

### 4. Endpoint data flow

**Files**: `zerotohero-python-server/app_directus.py`,
`zerotohero-python-server/routes/text_routes.py`

#### `/lemmatize-video` (old Directus ID)

1. Keep `video_id` + `lang` query params.
2. Fetch video from Supabase via `utils_content.get_video_by_id(conn, video_id, l2_code, include_subs=True)`.
3. `cache_id = cache_video_id(video_id)`.
4. Call `lemmatize_video(video, l2_code, cache_id)`.
5. Return the existing raw hash table.

#### `/lemmatize-video-normalized` (new consolidated ID)

1. Keep `video_id` + `lang` query params; the caller passes the consolidated
   Supabase ID.
2. Fetch the same video from Supabase (new ID passes through
   `resolve_video_id()`).
3. Build `text_by_hash` from `subs_l2` as today.
4. `cache_id = cache_video_id(video_id)` → the old Directus ID.
5. Call `lemmatize_video(video, l2_code, cache_id)` so an existing old-ID cache
   is reused, and any new write lands under the old-ID key.
6. Normalize each raw line with `normalize_by_lang()` exactly as today.

Both endpoints therefore share `cache/lemmatized_subs/{iso639-3}/{old_id}`.
No local or remote file needs to be renamed.

### 5. Optional legacy alias

Do not rename or remove `/lemmatize-video`. If a clearer name is desired for
documentation, add `/lemmatize-video-legacy` as an alias to the same handler
after the Supabase cutover; keep `/lemmatize-video` working until every client
is updated.

### 6. Cache hygiene after engine changes

The whole-video cache key has no lemmatizer-version component. Caches built
with an older engine (e.g. Korean Kiwi before the overlap fix) will keep being
served after this change because they are keyed by the same old Directus ID.

For this migration:

- Do **not** bulk-rename caches.
- After the code cutover, invalidate/rebuild caches for any language whose
  engine or raw output format changed recently (Korean `kiwi-v3` at minimum).
- Track a follow-up to add a versioned whole-video cache namespace
  (`lemmatized_subs/v2/{iso639-3}/{old_id}`) so future engine changes can
  invalidate without manual cleanup.

## API Contract

| Endpoint | `video_id` param | Fetch source | Cache key |
|---|---|---|---|
| `/lemmatize-video` | Directus ID (`67`) | Supabase (remapped internally) | `lemmatized_subs/kor/67` |
| `/lemmatize-video-normalized` | Consolidated ID (`30000000067`) | Supabase (direct) | `lemmatized_subs/kor/67` |

Unknown videos still return `200 null`; missing params still behave as today.

## Verification

### Unit tests

- `remap_video_id()`:
  - `ko` old 1 → `30000000001`
  - `ca` old 63 → `90000000063`
  - `eu` old 1398 → `20000001398`
  - unknown language raises/returns `None`, never defaults to prefix 1
- `cache_video_id()`:
  - `67` → `67`
  - `30000000067` → `67`
  - `999000000000000` (unknown prefix) → unchanged
- `utils_content.get_video_by_id(..., include_subs=True)` returns `subs_l2`.

### API tests

- `/lemmatize-video?video_id=67&lang=ko` returns the raw hash table.
- `/lemmatize-video-normalized?video_id=30000000067&lang=ko` returns unified
  tokens.
- First call either endpoint, then verify the other endpoint reuses
  `cache/lemmatized_subs/kor/67` and does not create a key under the new ID.
- `/videos/id/63?l2=ca` and `/videos/id/1398?l2=eu` now resolve correctly.
- Run SPEC-056 (at least `ko`) to confirm the tokenization pipeline still
  scores as expected.

## Rollout

1. Implement prefix map + cache helper + Supabase fetch behind the existing
   endpoints.
2. Run unit tests and manual API checks.
3. Invalidate the affected language's `lemmatized_subs` caches if an engine
   changed (Korean).
4. Deploy; observe `/lemmatize-video-normalized` cache-hit behavior via cache
   files/API logs.
5. Add `/lemmatize-video-legacy` alias only if clients need a clearer name;
   keep the old route until all callers migrate.

## Dependencies

- SPEC-038 / ADR-0021 ID-prefix contract
- SPEC-039 WS-5 Supabase content read layer
- `utils_content.py` and `utils_user_data.py`

## Open Questions

- Should `/lemmatize-video` also accept consolidated IDs for robustness, or
  strictly enforce the old-ID contract?
- Should the API response `l2` field switch from the legacy Directus integer
  to the ISO code now, or stay mirrored for compatibility and change in a
  separate spec?
- Should the versioned video-cache namespace ship in this spec or as follow-up?
