# Caption Selection — which transcript a video resolves to

## Metadata

- **Arch ID**: ARCH-035
- **Feature**: How the Python backend decides which YouTube caption track to
  use for a language — the locale candidates, manual-vs-auto-generated
  preference, name matching, and the separate text-normalization switch
- **Type**: as-built
- **Status**: accepted
- **Created**: 2026-10-16
- **Last Updated**: 2026-10-16
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
  - [SPEC-037 — Two-Tier Remote Cache](037-two-tier-remote-cache-offload.md) — bucket caps and offload

---

## Overview

"Fetch the transcript for this video in language X" is answered by **two
independent resolvers** that do not implement the same rule. Knowing which one
a caller uses is the difference between "prefer a manual track anywhere in the
locale family" and "prefer whatever YouTube lists first".

| | Path A | Path B |
|---|---|---|
| Function | `utils_youtube.list_captions(video_id, l2_code)` | `app_youtubecaptions.get_best_l2_subs_with_meta(youtube_id, l2_code)` |
| Locale candidate list | `locales_by_code()` + `host_country_locales_by_code()` | `LOCALES` table only |
| Ordering that decides | the **locale list** (language priority) | **YouTube's track order** |
| Manual vs ASR | any manual track in any candidate locale beats an ASR track in the exact locale | first match in YouTube's order — manual tracks are listed before generated, so manual wins within the same position |
| Returns | a `Transcript` object (not fetched) | fetched `[{start, duration, text}]` + metadata |
| Consumers | `find_videos_with_transcripts()` → the legacy crawler (`utils_scout`) | `/videos`, `/videos/subtitles`, `/timedtext/clean`, the admin importer |

Path A is the crawler's gate ("does this video have a usable transcript?").
Path B is the serving path ("give me the lines to render/store"). Both are
live; neither is a subset of the other.

```text
                    YouTubeTranscriptApi(proxy=Webshare)
                    app_youtubecaptions.list_transcripts_as_array(video_id)
                    ├─ bucket `caption`, key `list/{md5(video_id)}`
                    │   manual tracks first, then generated
                    │   (`TranscriptList.__iter__`, youtube_transcript_api 1.2.3)
                    │
   path A ──────────┴────────────── path B
   list_captions()                  get_best_l2_subs_with_meta()
     find_manually_created_transcript(locales)      first track whose
       → else find_transcript(locales)              language_code ∈ locales
     returns Transcript                             → caption(video_id, name, lang,
                                                              tlangs=None,
                                                              generated_ok=True)
```

## Locale candidates

Three different notions of "the locales of a language" exist, and they are not
interchangeable:

| Source | Shape | Read by |
|---|---|---|
| `LOCALES` in `utils_language.py` | hardcoded dict, 104 keys, e.g. `'cmn': ['zh', 'zh-CN', 'zh-Hans', 'zh-Hant', 'zh-TW', 'zh-SG']` | path B, `get_best_l1_subs()` |
| `data/locales.csv` via `get_locales_dict()` | 59 keys, the same values for the keys they share | path A, `l2_locales()` |
| `host_country_locales_by_code(code)` | the primary language(s) of the countries where `code` is spoken (from `data/countries.csv.txt`), with special cases (`wo` → `fr`, `ase` → `en-*`, `gv` → `ga`) | path A, `l2_locales()` |

Two helpers exist so callers stop open-coding this:

- **`utils_language.caption_locales_by_code(code)`** — reads `LOCALES` and
  returns a **fresh** list with the requested code first. It exists because
  both resolvers used to `insert(0, ...)` into the table's own lists, mutating
  module state shared by every request and thread in the worker.
- **`utils_youtube.l2_locales(code)`** — `locales_by_code(code)` plus
  `host_country_locales_by_code(code)`. Used by `filter_youtube()`'s
  `filter_l2_code` check **and** by the admin importer's declared-locale
  check, so the crawler and the importer cannot disagree about what "in this
  language" means.

Path B reads `LOCALES` only, so the host-country expansion — the thing that
makes a `fil-PH` track count as Cebuano — **does not apply on the serving
path**. See Known Issues.

## Selection rules

### Path A — `list_captions`

```python
l2_codes = get_locales_dict().get(l2_code, []) + [l2_code] + host_country_locales_by_code(l2_code)
try:
    transcript = transcript_list.find_manually_created_transcript(l2_codes)
except Exception:
    transcript = transcript_list.find_transcript(l2_codes)
```

`find_transcript` is documented as "manually created first, generated only if
none are found", but the implementation
(`youtube_transcript_api/_transcripts.py:300`) iterates **language codes in the
outer loop** and transcript sets in the inner loop. Combined with the explicit
manual pass above, the effective rule is:

1. the first locale (in list order) that has a **manually created** track; else
2. the first locale (in list order) that has a **generated** track.

So a manual `zh-CN` track beats an auto-generated `zh` track, even though `zh`
is the requested code.

### Path B — `get_best_l2_subs_with_meta`

```python
transcripts = list_transcripts_as_array(youtube_id)   # manual first, then generated
for transcript in transcripts:
    if transcript['language_code'] in caption_locales_by_code(l2Code):
        return caption(youtube_id, transcript['language'], transcript['language_code'],
                       tlangs=None, generated_ok=True)
```

The locale list is a **filter, not a priority**: the winner is whichever
matching track appears first in YouTube's listing. `TranscriptList.__iter__`
yields manually created transcripts before generated ones, so an ASR track
only wins when no manual track in any candidate locale exists.

`caption()` then re-resolves by exact `(language_code, name)`:

```python
for transcript in transcript_list:
    if transcript.language_code != lang: continue
    if name and transcript.language != name: continue
    if transcript.is_generated:
        if generated_ok: foundGeneratedTranscript = transcript
        else: continue
    else:
        foundTranscript = transcript          # last non-generated match wins
return foundTranscript or (foundGeneratedTranscript if generated_ok else None)
```

The **name** is `transcript['language']` — YouTube's display name
(`"Chinese (China)"`), which is also part of the caption cache key.

## Auto-generated transcripts

Auto-generated ("ASR") tracks are accepted everywhere: `generated_ok=True` in
both resolvers, and nothing rejects a video for being ASR-only. The only
preference is manual-over-ASR, and the two paths apply it differently
(above).

The video-level `contentDetails.caption` flag is a **different** question —
"does this video have any captions at all" — and is used only by
`filter_youtube(filter_captions=...)`, i.e. the legacy crawler and the
Google-search discovery path. It says nothing about the requested language.
The admin importer does not use it: it checks whether an actual track in the
L2 (or a locale of it) exists, which is strictly stronger.

## Text normalization is a separate axis — `clean_generated`

`clean_generated` does **not** control whether ASR is allowed; it controls
whether ASR lines are LLM-normalized (SPEC-029). `CLEAN_GENERATED_CAPTIONS`
(`1` by default) is the master switch, and `caption(clean_generated=None)`
falls back to it. Normalization always requires `tlangs is None` and
`fetched.is_generated`.

| Caller | Passes | Effective on a normal request |
|---|---|---|
| `/videos`, `/videos/subtitles` | `_parse_bool_arg('clean_generated')` | **LLM-normalized** — the arg is absent, so this returns `None`, which falls back to the master switch (on) |
| `/timedtext` | `_parse_bool_arg('clean_generated')` | same |
| `/timedtext/clean` | `clean_generated=False` | raw fetch, normalized slice-wise afterwards |
| Admin importer (`utils_video_import.transcript_csv`) | `clean_generated=False` | raw, matching the legacy crawler (`transcript.fetch()`) |

The web app passes `clean_generated=0` explicitly for its progressive path
(SPEC-029); anything that omits the parameter pays for normalization on the
read path.

## Caching

| Bucket | Key | Written by |
|---|---|---|
| `caption` | `{lang}/{md5(video_id + name + lang + tlangs + generated_ok [+ "\|clean=" + flag])}` | `caption()` — after entity decoding (SPEC-091) |
| `caption_clean` | `{language_code}/{md5(joined chunk lines)}` | the LLM normalizer, keyed by prompt version + chunk content |
| `transcribe_youtube` | `{video_id}_{lang}.csv` | the Whisper fallback (`transcribe_youtube`) |

Two consequences worth knowing:

- The **display name is in the key**, so a track renamed by the uploader
  misses the cache even though the lines are unchanged.
- The caption cache has **no TTL and no engine version**; only
  `PROMPT_VERSION` (for `caption_clean`) invalidates anything. `prune_cache.py`
  caps every bucket at 1 GiB (lemmatization 2 GiB) and offloads by mtime, so
  cold entries move to the shared host rather than expiring.

## Known Issues

1. **Path B ignores host-country locales.** `caption_locales_by_code()` reads
   `LOCALES` only, so the `fil-PH`-as-Cebuano style match that path A performs
   does not happen on the serving path or in the importer's transcript step.
   The importer's *eligibility* check does use `l2_locales()` (host country
   included), so a video can pass eligibility and then fail to find a
   transcript because the two steps use different locale sets.
2. **Two locale tables.** `LOCALES` (104 keys) and `data/locales.csv` (59
   keys) agree on every shared key today, but nothing keeps them in sync; a
   language added to one and not the other silently resolves differently on
   the two paths.
3. **The locale list is a filter, not a priority, in path B.** Requesting
   `zh-Hant` can return a `zh-CN` track when YouTube lists it first.
4. **A caption-service failure is indistinguishable from "no transcript".** A
   YouTube block or rate limit returns no lines, and callers report
   `no_transcript` (SPEC-096 Known Limitations).
5. **No minimum-length rule.** A two-line transcript is accepted everywhere;
   the legacy crawler imposed its own `< 4 lines` skip inside
   `save_video_with_transcript`, which the importer does not reproduce.
6. **`tlangs` interaction is unspecified.** `get_best_l1_subs()` fetches the L2
   track and asks YouTube to translate it to L1; whether a machine-translated
   track should ever be stored into `subs_l2` is not written down anywhere.

### Fixed 2026-10-16 (`5576056`)

- `caption_locales_by_code()` replaced `insert(0, ...)` on the shared
  `LOCALES` lists (module state mutated on a request path under gthread
  workers).
- `get_best_l1_subs()` guarded its L2 list with the **L1** code, so when the
  L1 code appeared among the L2's locales the L2 code was never added and a
  track tagged with the requested code could not match (`l1='zh'`, `l2='cmn'`).
- The admin importer gained the declared-locale check the crawler already had
  (`locale_mismatch`, bypassed by `force=True`); a video that declares no
  audio language is accepted.

## Files

| File | Role |
|---|---|
| `zerotohero-python-server/app_youtubecaptions.py` | `caption()`, `get_best_l2_subs_with_meta()`, `get_best_l1_subs()`, `list_transcripts_as_array()`, `transcribe_youtube()` |
| `zerotohero-python-server/utils_youtube.py` | `list_captions()`, `find_videos_with_transcripts()`, `l2_locales()`, `video_locale_matches_l2()`, `filter_youtube()` |
| `zerotohero-python-server/utils_language.py` | `LOCALES`, `caption_locales_by_code()`, `locales_by_code()`, `host_country_locales_by_code()`, `get_locales_dict()` |
| `zerotohero-python-server/utils_cache.py` | caption / caption_clean / transcribe_youtube cache keys |
| `zerotohero-python-server/routes/core.py` | `/timedtext`, `/timedtext/clean`, `/get_best_l2_subs`, `/get_best_l1_subs` |
| `zerotohero-python-server/routes/video.py` | `/videos`, `/videos/subtitles` (DB first, YouTube fallback) |
| `zerotohero-python-server/utils_video_import.py` | `transcript_csv()` — the importer's transcript step |
| `zerotohero-python-server/test_caption_locales.py` | Locale-table and resolver regression tests |

## Open Questions

- Should path B adopt `l2_locales()` (host-country expansion), or should the
  importer's eligibility check narrow to `caption_locales_by_code()` so both
  steps agree?
- Should the caption cache key include a track "version" (an etag or the
  fetched line count) so a re-uploaded caption set invalidates?
- Which resolver should the importer use — `list_captions()` (crawler rule:
  manual anywhere beats ASR in the exact locale) or `get_best_l2_subs_with_meta()`
  (serving rule)? They disagree for videos where the two exist in different
  locales.
