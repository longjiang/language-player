# SPEC-091 — Subtitle HTML-Entity Decoding at the Server

## Metadata
- **Spec ID**: SPEC-091
- **Feature**: Decode HTML entities in subtitle text on the Flask endpoints (all frontends)
- **Status**: complete
- **Created**: 2026-09-03
- **ROADMAP Phase**: Cross-cutting (web + mobile + extension)

## Overview

`youtube_videos.subs_l2` stores subtitle text exactly as YouTube's caption
pipeline produced it — including HTML entities. Numeric forms are common in
English captions (`ISN&#39;T`), and some timedtext formats DOUBLE-encode them
(`ISN&amp;#39;T`). Decoding used to be a client parse-time concern: only the
web watch page's `parseCSVSubtitles()` did it, so the subs-search results
list, the subs-search playback modal, the mobile apps, and the Chrome
extension all displayed raw `&#39;` text (and hashed it for the token cache).

SPEC-091 moves the decode to the Flask layer so every consumer — web,
mobile, Chrome extension, lemmatization cache — receives identical, decoded
subtitle text. The shared `parseSubtitleCSV()` keeps an idempotent decode
pass as a safety net for raw-CSV consumers.

## Decision

**Fix at the Flask endpoint, not the DB and not per-frontend.**

- **DB rewrite rejected**: decoding `subs_l2` in place would rewrite the
  dominant ~15–18 GB of the videos table, force FTS/ngram index rebuilds,
  invalidate every `lemmatized_subs` cache entry (md5 keys change), and
  require ingestion-script changes to prevent regression — all for what is a
  display/keying bug.
- **Per-frontend decode rejected**: leaves the extension's LLM-example
  prompts broken, does nothing for server-side consumers, and changes the
  mobile token-cache hit behavior inconsistently with web.

## How It Works

New helper `decode_html_entities()` in `zerotohero-python-server/utils_gen.py`:

- Decodes named + decimal + hex entities via `html.unescape`, iterating up to
  3 passes so double-encoded entities collapse.
- Idempotent; stops early once a pass changes nothing.
- Preserves literal `&` that isn't part of a well-formed `&…;` entity.

**Decode the CSV FIELD, never the CSV string** — unescaping `&quot;` before
CSV parsing would corrupt quoted fields.

### Server decode points

| Endpoint / path | Change |
|---|---|
| `utils_content._reduce_subs_to_context` (live `GET /subs-search`) | Match terms against raw OR decoded line text (recall for apostrophe/quote terms against raw DB rows); decode the `line` field of the returned context rows |
| `app_subs_search.reduce_video_subs_to_context` (Classic `GET /subs-search-classic`) | Same dual match + field decode |
| `routes/video._parse_subs_csv` (`GET /videos/subtitles`) | Decode `l2Line` |
| `routes/video.py` YouTube-caption fallbacks (`GET /videos`, `GET /videos/subtitles`) | Decode caption `text` |
| `app_youtubecaptions.caption()` | Decode transcript text BEFORE caption-cache write, so the caption cache, `/timedtext`, `/get_best_l2_subs`, and the LLM caption normalizer all see clean text |
| `utils_video_lemma.lemmatize_video` / `get_lemmas_from_video` | Decode BEFORE md5 keying, so `lemmatized_subs` cache keys match the decoded text clients hash (`TokenCache.get(md5(text))`) |
| `app_directus.get_and_lemmatize_video_by_id_normalized` | Space-recovery map hashes decoded text (same keys) |

### Client safety net

`parseSubtitleCSV()` in `packages/utils/src/subs-csv.ts` decodes each parsed
`line` via the shared `decodeHtmlEntities()` (`packages/utils/src/entities.ts`).
It is idempotent — a no-op on already-decoded server output — and covers the
Chrome extension and any consumer of raw DB CSV.

## Search-recall note

Phase-1 matching (FTS/ILIKE/ngram) still runs against the RAW `subs_l2`.
Exact apostrophe/quote searches (e.g. `isn't`) can phase-1-miss rows whose
only form is `isn&#39;t`. Recall for inflected lookups is preserved because
the client sends ALL inflected forms (`is`, `not`, …) and `_reduce_subs_to_context`
now matches decoded text too. A native exact-match upgrade would require the
rejected DB migration; revisit only if exact apostrophe lookups prove
insufficient.

## Cache invalidation

The subs_search result cache has no TTL. After deploying:

```bash
# Server — local + shared-host buckets (remote_delete supports buckets):
find cache/subs_search -type f -delete          # local tier
# purge the shared-host subs_search bucket via delete-flask-cache.php
```

Local dev caches were purged as part of this spec. `lemmatized_subs` is left
alone: legacy entries are keyed on raw-text md5 and simply miss (falling back
to per-line lemmatization) until naturally rebuilt — a purge is optional and
only costs re-lemmatization on next access.

## Testing

- `packages/utils/src/subs-csv.test.ts` — single/double decode, quoted-field
  integrity, literal `&` preserved, idempotence, `findMatchLine` on decoded text.
- `zerotohero-python-server/test_app.py` — `test_decode_html_entities_helper`,
  `test_reduce_subs_to_context_decodes_entities`,
  `test_parse_subs_csv_decodes_entities`,
  `test_lemmatize_video_decodes_entities_before_hashing`.

## Dependencies

- SPEC-004 (original client-side decode), ARCH-004, ARCH-010, ARCH-017.
- `packages/utils/src/entities.ts` (shared decoder, unchanged).

## Open Questions

- None. If native exact search for apostrophe terms becomes a priority, the
  DB migration (or generated-column FTS over decoded text) is the follow-up.
