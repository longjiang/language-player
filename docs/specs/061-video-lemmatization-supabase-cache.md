# SPEC-061: Supabase-Backed Video Lemmatization + Cache ID Rebinding

## Metadata

- **Spec ID**: SPEC-061
- **Feature**: Move `/lemmatize-video` and `/lemmatize-video-normalized` onto the Supabase video read path; reuse existing Directus-ID video lemmatization caches without renaming files
- **Status**: complete (verified 2026-10-16)
- **Created**: 2026-08-10
- **Implemented**: 2026-08 — seven commits, `3b50dfe` → `f662ccb` (backend)
- **ROADMAP Phase**: Phase 9: Backend Consolidation
- **See also**:
  - [ARCH-034 — Video Lemmatization Cache](../arch/034-video-lemmatization-cache.md) — as-built deep dive on the cache this spec rebinds
  - [SPEC-038 — Video Content Supabase Migration](038-video-content-supabase.md)
  - [SPEC-039 — Full Database Migration](039-full-database-migration-supabase.md)
  - [ADR-0021 — Video Content Migration](<../adr/0021-migrate-video-content-to-supabase.md>)
  - [ARCH-016 — Server Tokenization Pipeline](../arch/016-server-tokenization.md)
  - [SPEC-091 — Subtitle HTML-Entity Decoding](091-subtitle-html-entity-decoding.md)

## Overview

The video lemmatization endpoints used to fetch videos from Directus, so
consolidated Supabase video IDs returned `null`, and the video lemmatization
cache was keyed by whatever ID the caller passed. This spec moved both
endpoints onto `utils_content` (Supabase), kept `/lemmatize-video` on the old
Directus-ID contract, made `/lemmatize-video-normalized` accept the new
consolidated ID, and rebound cache lookups to the old Directus ID at
read/write time — with no bulk cache file rename on local or remote storage.

**This document is now an as-built record.** The plan sections below have been
rewritten to describe what actually shipped, with per-requirement status. See
"Implementation Status" for the deviations.

## Background

### Call path before this spec

1. `GET /lemmatize-video` → `app_directus.get_and_lemmatize_video_by_id()`
2. `GET /lemmatize-video-normalized` → `app_directus.get_and_lemmatize_video_by_id_normalized()`
3. Both called `utils_directus.get_video()`, which still read Directus.
4. `utils_video_lemma.lemmatize_video()` read/wrote
   `cache/lemmatized_subs/{iso639-3}/{video_id}`.

### ID remapping formula

```text
new_id = prefix * 10^10 + old_id
old_id = new_id % 10^10
```

Spot-checking every language in `L2_PREFIX` against real Supabase IDs found two
errors, both corrected in `3b50dfe`:

| Code | Was | Now |
|---|---|---|
| `ca` | 2 | 9 |
| `eu` | missing → defaulted to 1 | 2 |

`ko` round-trips correctly (`67` ↔ `30000000067`). The corrected values are
asserted in `test_video_id_remap.py::test_known_remaps`.

### Why not bulk-rename cache files

The remote cache API (`remote_cache.py`) supports get/set/delete by exact key
only — no list, rename, or batch-move. Local and remote caches are also not
synchronized copies (the offload job deletes local files after upload), so a
physical rename cannot be made atomic across both stores. Lookup-time ID
translation gives the same reuse with no data movement and no risk of moving
caches into the wrong prefix block. This decision held: no cache files were
renamed.

## Implementation Status

| Req | Status | Evidence |
|---|---|---|
| **R1** `/lemmatize-video` keeps Directus ID, fetches Supabase | ✅ | `app_directus._fetch_video_with_subs()` → `content.get_video_by_id(conn, video_id, l2_code, include_subs=True)` |
| **R2** `/lemmatize-video-normalized` accepts consolidated ID | ✅ | `utils_content.resolve_video_id()` passes IDs `>= 10^10` through unchanged |
| **R3** Both share one cache, keyed by the old Directus ID | ✅ | `cache_video_id(video_id)` called in both paths (`app_directus.py:200`, `:249`) |
| **R4** Existing caches reused, no renames | ✅ | No rename tooling exists; `cache_video_id()` translates at lookup/write time |
| **R5** Code-keyed prefix map, no silent default | ⚠️ **partly — reworded, see below** | `L2_PREFIX_BY_CODE` (29 entries) + `_resolve_l2_code()` raises for unknown codes; but unlisted *valid* codes still fall back to prefix 1 by design |
| **R6** Response shapes unchanged | ✅ | Legacy returns raw hash table; normalized returns `{md5: {tokens}}` |
| **R7** No routes removed | ✅ | `/lemmatize-video` intact; `/lemmatize-video-legacy` added as an alias |
| **R8** (new) Versioned cache namespace | ✅ | `_lemmatized_subs_key()` sends `kor` + `lzh` to `v2/` |
| **R9** (new) SPEC-091 decode-before-hash | ✅ | Decode happens before md5 keying in both the cache writer and the space-recovery map |
| **R10** (new) `include_subs` on the Supabase video fetch | ✅ | `utils_content.get_video_by_id(conn, video_id, l2_code=None, include_subs=False)`; the lemmatization path passes `include_subs=True` |

### Deviation from R5 as originally written

R5 said the mapping should have "no silent default-to-prefix-1 fallback". What
shipped is narrower and deliberate:

- **Truly unknown language** → `_resolve_l2_code()` returns `None` →
  `remap_video_id()` **raises `ValueError`**. No silent remap. ✅
- **Known/valid language absent from the 29-entry map** → `L2_PREFIX_BY_CODE.get(code, 1)`
  → **prefix 1**. This is intentional and documented in `utils_user_data.py`:
  codes not in the map live in the base `youtube_videos` table, so prefix 1 is
  the *correct* answer, not a guess.

So the requirement's intent (never silently mis-shard an unknown language) is
met, but the literal wording over-promised. R5 should be read as: *unknown
languages raise; valid-but-unlisted languages correctly resolve to the base
shard.*

`L2_PREFIX` (Directus language-ID keyed) is **retained** alongside
`L2_PREFIX_BY_CODE`, as R5 allowed, because legacy callers still pass numeric
language IDs — `_resolve_l2_code()` accepts both forms.

## What Shipped

### 1. Corrected prefix map — `utils_user_data.py`

- `L2_PREFIX_BY_CODE` — ISO code → shard prefix, 29 entries
  (`ca: 9`, `eu: 2`, `vi: 2`, `ko: 3`, `zh: 4`, `en: 5`, `de: 6`, `ja: 7`,
  `fr: 8`, `es: 9`, `ru: 9`, `tr/pl/nl: 10`, `ar/cs/el/he/pt/uk/ms/sk: 11`,
  `it: 12`, `id/sv/no/nan: 13`, `th/my: 14`).
- `_resolve_l2_code()` — normalizes ISO 639-1 / 639-3 / glottolog codes and
  legacy numeric Directus IDs to a canonical code; returns `None` when unknown.
- `remap_video_id(lang, old_id)` — accepts either form; raises on unknown
  language; passes consolidated IDs (`>= 10^10`) through untouched.
- `test_video_id_remap.py::test_prefix_map_matches_directus_suffix_map` asserts
  the whole map against `youtube_videos_suffix`, so a `ca`/`eu`-class
  regression can't land silently.

### 2. Supabase video fetch with subs — `utils_content.py`

- `get_video_by_id(conn, video_id, l2_code=None, include_subs=False)` — adds
  `subs_l2` to the SELECT and returns it on the video dict when
  `include_subs=True`, so `lemmatize_video()` consumes the same shape as the
  old Directus video object.
- `resolve_video_id()` unchanged in behavior: old IDs (`< 10^10`) remap when
  `l2_code` is supplied; consolidated IDs pass through.

### 3. Cache ID translation helper — `utils_video_lemma.py`

```python
KNOWN_VIDEO_ID_PREFIXES = frozenset(range(1, 15))

def cache_video_id(video_id, l2_code=None):
    """Return the Directus ID used for the lemmatized-subs cache key."""
    # < 10**10                -> unchanged
    # >= 10**10, known prefix -> video_id % 10**10
    # unknown prefix          -> unchanged (future-proof for non-prefixed IDs)
```

Note: the shipped helper tests membership in `KNOWN_VIDEO_ID_PREFIXES`
(range 1–14) rather than consulting `L2_PREFIX_BY_CODE` per language — the
`l2_code` parameter is accepted but unused. Prefix 0 can only arise from a
sub-`10^10` ID, which is already returned unchanged, so the 1–14 range covers
every real consolidated ID.

### 4. Endpoint data flow

`app_directus._fetch_video_with_subs()` is the single fetch helper:

```python
conn = ud.get_conn()
try:
    return content.get_video_by_id(conn, video_id, l2_code, include_subs=True)
finally:
    conn.close()
```

**`/lemmatize-video`** (`routes/text_routes.py:124`) — keeps `video_id` +
`lang`; fetch via `_fetch_video_with_subs()`; `cache_id = cache_video_id(video_id)`;
returns the raw per-lemmatizer hash table. Marked **LEGACY** in its docstring.

**`/lemmatize-video-normalized`** (`routes/text_routes.py:155`) — same fetch;
`cache_id = cache_video_id(video_id)`; builds a `text_by_hash` map from the
entity-decoded subtitle lines for space recovery; returns
`{md5: {tokens: [...]}}`.

Both therefore share `cache/lemmatized_subs/{iso639-3}/{old_id}`.

### 5. Legacy alias — shipped

`/lemmatize-video-legacy` (`routes/text_routes.py:149`) is a thin alias that
calls the `/lemmatize-video` handler. The canonical route was never renamed or
removed.

### 6. Cache hygiene after engine changes — partially shipped

The follow-up in the original plan (a versioned whole-video cache namespace)
shipped, but **per-language** rather than globally, in
`utils_cache._lemmatized_subs_key()`:

```python
key = f'{lang}/{video_id}'
if lang in ('kor', 'lzh'):
    return f'v2/{key}'
return key
```

- `kor` → `v2` because the Kiwi overlap fix changed the raw output shape
  (`747f796`).
- `lzh` → `v2` because whole-video rows predate the pinyin policy and were
  segmented by the regex fallback, with no jieba segmentation and no readings
  (`f662ccb`).
- Every other language keeps the legacy key so existing caches are reused —
  no bulk rename, per the R4 decision.

Asserted by `test_video_id_remap.py::test_lemmatized_subs_cache_key_versioning`.

## API Contract

| Endpoint | `video_id` param | Fetch source | Cache key |
|---|---|---|---|
| `/lemmatize-video` | Directus ID (`67`) | Supabase (remapped internally) | `lemmatized_subs/kor/67` |
| `/lemmatize-video-legacy` | Directus ID (`67`) | Same handler as above | `lemmatized_subs/kor/67` |
| `/lemmatize-video-normalized` | Consolidated ID (`30000000067`) | Supabase (direct) | `lemmatized_subs/kor/67` |

For `kor` and `lzh`, every key above is prefixed `v2/` in storage
(`lemmatized_subs/v2/kor/67`).

Unknown videos still return `200 null`; missing params still behave as before.

## Consumers

The **only** caller of the non-normalized `/lemmatize-video` is the archived
GO app (`apps/mobile-go-legacy/src/api/python/video.ts:202`). Active clients —
web and mobile — both call `/lemmatize-video-normalized` via
`@langplayer/api-client` `getVideoTokenCache()`. The Chrome extension does not
use the whole-video cache at all; it goes straight to
`/lemmatize-normalized/batch`.

## Verification

### Unit tests — `test_video_id_remap.py`

- `test_known_remaps` — `ko` 1 → `30000000001`, `ca` 63 → `90000000063`,
  `eu` 1398 → `20000001398`, numeric `3179` 1 → `30000000001`.
- `test_roundtrip_recovers_old_id` — `new_id % 10**10 == 67`.
- `test_unknown_l2_raises_instead_of_defaulting` — `remap_video_id("zz", 1)`
  raises `ValueError`.
- `test_prefix_map_matches_directus_suffix_map` — full-map assertion against
  `youtube_videos_suffix`.
- `test_cache_video_id` — `67` → `67`; `30000000067` → `67`; `"30000000067"` →
  `67`; `999000000000000` (unknown prefix) → unchanged.
- `test_lemmatized_subs_cache_key_versioning` — `kor`/`lzh` → `v2/…`, `eng` →
  legacy.

### API tests

- `/lemmatize-video?video_id=67&lang=ko` returns the raw hash table.
- `/lemmatize-video-normalized?video_id=30000000067&lang=ko` returns unified
  tokens.
- Calling either endpoint first, then the other, reuses
  `cache/lemmatized_subs/kor/67` and does not create a key under the new ID.
- `/videos/id/63?l2=ca` and `/videos/id/1398?l2=eu` now resolve correctly.
- SPEC-056 (at least `ko`) confirms the tokenization pipeline still scores as
  expected.

## Rollout — complete

1. ✅ Prefix map + cache helper + Supabase fetch implemented behind the
   existing endpoints.
2. ✅ Unit tests and manual API checks.
3. ✅ Korean cache namespace versioned (`v2`) rather than purge-and-rebuild;
   `lzh` followed.
4. ✅ Deployed; `/lemmatize-video-normalized` cache-hit behavior observable via
   cache files / API logs.
5. ✅ `/lemmatize-video-legacy` alias added; the old route kept.

## Dependencies

- SPEC-038 / ADR-0021 ID-prefix contract
- SPEC-039 WS-5 Supabase content read layer
- `utils_content.py`, `utils_user_data.py`, `utils_cache.py`, `remote_cache.py`
- SPEC-091 (decode-before-hash) — landed after this spec but is now part of
  the cache-key contract

## Open Questions

- ~~Should the versioned video-cache namespace ship in this spec or as
  follow-up?~~ **Resolved**: shipped per-language (`kor`, `lzh`). A global
  namespace bump is still available if a future engine change touches many
  languages at once.
- Should `/lemmatize-video` also accept consolidated IDs for robustness, or
  strictly enforce the old-ID contract? **Still open** — it currently enforces
  the old-ID contract via the caller, though `resolve_video_id()` would pass a
  consolidated ID through if one were supplied.
- Should the API response `l2` field switch from the legacy Directus integer to
  the ISO code now, or stay mirrored for compatibility and change in a separate
  spec? **Still open.**
