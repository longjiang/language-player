# Caption Selection — which transcript a video resolves to

## Metadata

- **Arch ID**: ARCH-035
- **Feature**: The single rule the Python backend uses to choose a YouTube
  caption track for a language — locale candidates, manual-vs-auto-generated
  preference, the caption-service failure taxonomy, and the ingestion
  minimum-length rule
- **Type**: as-built
- **Status**: accepted
- **Created**: 2026-10-16
- **Last Updated**: 2026-10-18 (merged the two resolvers — see "Fixed")
- **ROADMAP Phase**: Phase 9: Backend Consolidation (cross-cutting)
- **Scope**: Flask backend (`zerotohero-python-server/`). Client-side track
  pickers (Chrome extension, web player) are out of scope.
- **See also**:
  - [SPEC-029 — Caption Normalization](../specs/029-caption-normalization.md) — the `clean_generated` axis
  - [SPEC-091 — Subtitle HTML-Entity Decoding](../specs/091-subtitle-html-entity-decoding.md) — decode point, cache-key parity
  - [ARCH-010 — Video Loading Pipeline](010-video-loading-pipeline.md) — where the caption fallback sits in the watch flow
  - [SPEC-096 — Admin Video Ingestion](../specs/096-admin-video-ingestion.md) — the importer that stores a transcript into `subs_l2`
  - [ARCH-003 — Python Backend Architecture](003-python-backend-architecture.md) — route map and utility catalog
  - [ARCH-019 — Chrome Extension Architecture](019-chrome-extension-architecture.md) — the extension's own, separate track picker
  - [SPEC-037 — Two-Tier Remote Cache](../specs/037-two-tier-remote-cache-offload.md) — bucket caps and offload

---

## Overview

One rule, in one module, for every consumer:

```python
caption_selection.choose_best_transcript(candidates, l2_locale_priority(l2_code))
```

1. Only tracks whose `language_code` is in the L2's **locale family** are
   eligible.
2. **A manually created track anywhere in that family beats an auto-generated
   one.** ASR output has no punctuation, casing or speaker marks, so a manual
   `zh-CN` is worth more than an ASR `zh` even when `zh` is what was asked for.
3. Within the same tier the **locale list decides** — first candidate wins.
4. Ties keep YouTube's own order.

Everything below is the detail behind those four lines.

## The consumers

| Consumer | Entry point | Returns |
|---|---|---|
| Watch page fallback (`/videos`, `/videos/subtitles`) | `app_youtubecaptions.get_best_l2_subs_with_meta()` | fetched lines + `{language_code, language, is_generated}` (+ error) |
| Progressive clean (`/timedtext/clean`) | same, with `clean_generated=False` | same |
| `/get_best_l2_subs` | `get_best_l2_subs()` → the above | the lines |
| `/get_best_l1_subs` | `get_best_l1_subs()` | the L2 track translated to L1 |
| `/timedtext` | `caption()` (exact language + display name) | one named track |
| Admin importer | `utils_video_import.transcript_for_import()` → the L2 resolver | `subs_l2` CSV |

The crawler's adapter (`utils_youtube.list_captions()`) was deleted with the
crawler (`dc7b212`); every remaining consumer goes through
`select_best_l2_transcript()`.

`get_best_l1_subs()` and `caption()` with `tlangs` are **serving-only**: a
machine translation is never stored as a video's `subs_l2` (the importer
always resolves with `tlangs=None`).

```text
                    YouTubeTranscriptApi(proxy=Webshare)
                    app_youtubecaptions.caption_api()
                              │
                    list_transcripts_result()
                     → (metadata[], error)
                              │
             choose_best_transcript(candidates, locale_priority)
                              │
                  select_best_l2_transcript()
                              │
           fetch_caption_track(video, name, code)   → (lines, error)
```

Everything goes through the proxied client and the one rule.

## Locale candidates

`caption_selection.l2_locale_priority(l2_code)` returns, in order:

1. the language's own locale variants — the requested code first — from
   `LOCALES`;
2. the locales of the countries where the language is spoken
   (`host_country_locales_by_code()`), so a `fil-PH` track counts as Cebuano.

**`LOCALES` (in `utils_language.py`) is the single source of truth.**
`get_locales_dict()` is now a view of it; it used to read
`data/locales.csv`, so a language present in one table and not the other
resolved differently depending on which helper a caller happened to use.
`data/locales.csv` is legacy and no longer read (45 languages gained their
variants when the tables were unified; see "Fixed").

`utils_youtube.l2_locales()` delegates to the same function, so the
`filter_l2_code` eligibility check and the caption resolvers cannot disagree
about what "in this language" means.

## Selection rules in detail

`choose_best_transcript()` buckets the candidates whose `language_code` is in
the priority list into the manual tier and the generated tier, then takes the
best of the manual tier, or the generated tier if there is no manual track.
Within a tier it sorts by the locale list's index, then by arrival order.

Consequences worth knowing:

- Requesting `zh-Hant` resolves to a `zh-Hant` track and never to `zh-CN`,
  because the priority list for an exact BCP-47 code contains only that code.
- Requesting `zh` prefers a manual `zh-CN` over an auto-generated `zh`
  (rule 2), and among manual `zh`-family tracks prefers the earliest in the
  table (`zh`, then `zh-CN`, then `zh-Hans`, …).
- A video whose only track is ASR in the right locale still resolves — ASR is
  accepted everywhere.

## Auto-generated transcripts

Accepted everywhere; nothing rejects a video for being ASR-only. The only
preference is manual-over-ASR, as above.

The video-level `contentDetails.caption` flag is a **different** question —
"does this video have any captions at all" — and it was only ever used by the
legacy crawler and the Google-search discovery path (both removed). It says
nothing about the requested language.
The admin importer does not use it: it checks whether an actual track in the
L2 family exists, which is strictly stronger.

## Failures: "no transcript" vs "the caption service is broken"

These must not be conflated — one says the video is unusable, the other says
try again later. Both listing and fetching use the library's own taxonomy:

| Outcome | Detection | Reported as |
|---|---|---|
| The video has no captions, or none in this language | `TranscriptsDisabled`, `NoTranscriptFound`, `VideoUnavailable`, `VideoUnplayable`, `AgeRestricted`, `InvalidVideoId`, `NotTranslatable`, `TranslationLanguageNotAvailable` | empty result, **no error** |
| YouTube refused the request (IP block, `/sorry/index`, `429`) | `RequestBlocked` / `IpBlocked`, or a `429` / `sorry/index` message from the proxy layer | `{'kind': 'rate_limited', 'message': …}` |
| Anything else (network, unparsable response, upstream 5xx) | default | `{'kind': 'lookup_failed', 'message': …}` |

Anything not in the library's "this video has no transcript" set is treated as
a **service** failure — the conservative direction, because recording a
blocked lookup as "this video has no captions" is how a rate-limited bulk
import silently produces a catalogue full of transcript-less rows.

- `get_best_l2_subs_with_meta()` returns `(None, meta)` with
  `meta['error']` / `meta['error_kind']` set, and still reports which track it
  had selected. A caller that only wants lines can ignore it;
  `is_generated` stays `False` so `/videos` behaves exactly as before.
- The importer records `caption_service_unavailable` instead of
  `no_transcript`, passes the message through, and counts it separately in
  the batch summary.
- Only successful listings are cached, so a failure is retried on the next
  request.

## Minimum length (ingestion only)

`caption_selection.MIN_TRANSCRIPT_LINES = 4` with
`is_usable_transcript()` / `is_usable_transcript_line_count()` is the single
definition of "worth storing", applied by:

- the admin importer → `transcript_too_short` (the line count is reported);
- the legacy crawler's `save_video_with_transcript`, which previously
  hardcoded its own `< 4` check.

It is deliberately **not** applied on the serving path: a two-line transcript
is still better than nothing to watch, and rejecting it would turn an existing
video's only captions into an error.

## Text normalization is a separate axis — `clean_generated`

`clean_generated` does not control whether ASR is allowed; it controls whether
ASR lines are LLM-normalized (SPEC-029). `CLEAN_GENERATED_CAPTIONS`
(`1` by default) is the master switch, and `clean_generated=None` falls back
to it. Normalization always requires `tlangs is None` and
`fetched.is_generated`.

| Caller | Passes | Effective on a normal request |
|---|---|---|
| `/videos`, `/videos/subtitles` | `_parse_bool_arg('clean_generated')` | **LLM-normalized** — the arg is absent, so this returns `None`, which falls back to the master switch (on) |
| `/timedtext` | `_parse_bool_arg('clean_generated')` | same |
| `/timedtext/clean` | `clean_generated=False` | raw fetch, normalized slice-wise afterwards |
| Admin importer | `clean_generated=False` | raw, matching the legacy crawler |

The web app passes `clean_generated=0` explicitly for its progressive path
(SPEC-029); anything that omits the parameter pays for normalization on the
read path.

## Caching

| Bucket | Key | Written by |
|---|---|---|
| `caption` | `{lang}/{md5(video_id + name + lang + tlangs + generated_ok [+ "\|clean=" + flag])}` | `fetch_caption_track()` — after entity decoding (SPEC-091) |
| `caption` (`type='list'`) | `list/{md5(...)}` | the transcript listing (successful listings only) |
| `caption_clean` | `{language_code}/{md5(joined chunk lines)}` | the LLM normalizer, keyed by prompt version + chunk content |
| `transcribe_youtube` | `{video_id}_{lang}.csv` | the Whisper fallback (`transcribe_youtube`) |

Two consequences worth knowing:

- The **display name is in the key**, so a track renamed by the uploader
  misses the cache even though the lines are unchanged.
- The caption cache has **no TTL and no revision component** — a YouTube
  caption revision keeps serving the old lines until the entry is evicted
  (`prune_cache.py` caps each bucket at 1 GiB and offloads by mtime, so cold
  entries move to the shared host rather than expiring). Only
  `PROMPT_VERSION` invalidates `caption_clean`.

## Known Issues

1. **The line count of a cached transcript can be stale** (see Caching): the
   key has no revision or etag component.
2. **`tlangs` output is never cached** under the L1 language key in a way that
   distinguishes translation quality; it is a machine translation, served
   on demand.
3. **`host_country_locales_by_code()` returns nothing for languages whose
   `LOCALES` entry already intersects `YOUTUBE_LANGS`** (by design — it is the
   fallback for languages YouTube does not list), so the "spoken in these
   countries" expansion mostly helps languages whose own locale codes are not
   YouTube languages.
4. **Only one ingestion path remains.** The legacy crawler and its caption
   adapter were deleted (`cdfce67`, `dc7b212`); the admin importer is the
   ingestion path, and it shares the selection and minimum-length rules.

### Fixed 2026-10-16

First pass (`5576056`):

- `caption_locales_by_code()` replaced `insert(0, ...)` on the shared
  `LOCALES` lists (module state mutated on a request path under gthread
  workers).
- `get_best_l1_subs()` guarded its L2 list with the **L1** code, so when the
  L1 code appeared among the L2's locales the L2 code was never added and a
  track tagged with the requested code could not match (`l1='zh'`, `l2='cmn'`).
- The admin importer gained the declared-locale check the crawler already had.

Second pass (`86b550b`):

- **One rule.** `caption_selection.choose_best_transcript()` is used by the
  crawler, the serving path and the importer; previously the serving path used
  YouTube's track order with the locale list as a *filter*, so requesting
  `zh-Hant` could return `zh-CN`.
- **One locale table.** `get_locales_dict()` reads `LOCALES`. Measured across
  34,317 language codes: 45 languages gain their variants, one "loss" — the
  malformed `nb_NO`, from a **duplicate `'nb'` key** in `LOCALES` whose later
  value used an underscore where YouTube uses a hyphen. Duplicate removed and
  `nb_NO`/`nn_NO` corrected to `nb-NO`/`nn-NO`.
- **Failures are distinguishable** (see the taxonomy above); the importer's
  `caption_service_unavailable` replaces a misleading `no_transcript`.
- **One minimum-length rule** shared by the importer and the legacy crawler,
  which each had their own.
- The crawler's listing now uses the proxied caption client; it built its own
  unproxied `YouTubeTranscriptApi`, so it could be blocked where the serving
  path was not.

## Files

| File | Role |
|---|---|
| `zerotohero-python-server/caption_selection.py` | The rule: `l2_locale_priority()`, `choose_best_transcript()`, `MIN_TRANSCRIPT_LINES`, `is_usable_transcript[_line_count]()` |
| `zerotohero-python-server/app_youtubecaptions.py` | `caption_api()`, `list_transcripts_result()`, `select_best_l2_transcript()`, `get_best_l2_subs_with_meta()`, `get_best_l1_subs()`, `fetch_caption_track()` / `caption()`, `transcribe_youtube()` |
| `zerotohero-python-server/utils_youtube.py` | `l2_locales()`, `video_locale_matches_l2()` — the crawler-era `list_captions()` / `find_videos_with_transcripts()` / `filter_youtube()` helpers were deleted with the crawler |
| `zerotohero-python-server/utils_language.py` | `LOCALES` (the table), `get_locales_dict()`, `caption_locales_by_code()`, `locales_by_code()`, `host_country_locales_by_code()` |
| `zerotohero-python-server/utils_cache.py` | caption / caption_clean / transcribe_youtube cache keys |
| `zerotohero-python-server/routes/core.py` | `/timedtext`, `/timedtext/clean`, `/get_best_l2_subs`, `/get_best_l1_subs` |
| `zerotohero-python-server/routes/video.py` | `/videos`, `/videos/subtitles` (DB first, YouTube fallback) |
| `zerotohero-python-server/utils_video_import.py` | `transcript_for_import()` — the importer's vetted transcript step |
| `zerotohero-python-server/test_caption_selection.py` | The rule itself |
| `zerotohero-python-server/test_caption_locales.py` | Resolver integration, locale-table mutation, failure reporting |

## Open Questions

- Should the caption cache key include a revision component (an etag or the
  line count) so a re-uploaded caption set invalidates?
- Should a `caption_service_unavailable` failure abort a bulk import instead of
  being recorded per video (the summary now makes it visible, but the run
  still walks the whole list)?
- Should `/videos` and `/videos/subtitles` surface `meta['error']` to the
  client so the UI can say "transcripts temporarily unavailable" instead of
  showing nothing?
