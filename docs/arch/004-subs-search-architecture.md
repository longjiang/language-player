# Subs-Search Architecture

How the "Examples" tab on dictionary entry pages finds and displays video subtitles matching a word's inflected forms.

## Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│  Dictionary Entry Page → Examples tab → SubsSearchResults      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Nav bar (video n of total, exact-match toggle, Watch link) │  │
│  │ YouTube mini-player (embedded, autoplay seeks to match)    │  │
│  │ Playback controls (prev/next video, prev/next line)        │  │
│  │ SubtitleDisplay (singleline mode — current sub line)       │  │
│  │ Result list modal (filter, sort, select)                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        │ fetch(PYTHON_API_URL/subs-search?terms=…&l2=ja&context=3)
        ▼

## UI Layout

The `SubsSearchResults` component renders as a self-contained card with a mini video player. Below is the visual structure with the two display states annotated.

```text
┌─────────────────────────────────────────────────────────────────┐
│  Nav Bar                                              border-b  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ "第 1 个视频（共 89 个）"    [30 forms]  [▶ Watch] [☰ List] ││
│  │  ↑ video counter              ↑ exact-    ↑ links to   ↑ opens │
│  │                               match      /watch page   modal  │
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│              ┌─────────────────────────────────┐               │
│              │                                 │               │
│              │    YouTube Embedded Player      │  aspect-video │
│              │    (autoplay, seeks to match)    │               │
│              │                                 │               │
│              └─────────────────────────────────┘               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Playback Controls                                   border-b  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │     [⏮]   [▲]   [▶/⏸]   [▼]   [⏭]                        ││
│  │   prev vid  prev  play/  next  next vid                     ││
│  │             line  pause  line                               ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  Subtitle Display (singleline mode)                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │    記述した戦記軍談の類たぐいでない                          ││
│  │    所に東洋人の血を大きく搏うつ                   ← L2 text  ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  OR (when YouTube player hasn't reported time yet):             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │           Subtitles are not available for this video yet.    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Component Tree

```text
SubsSearchResults
├── <div> card container (rounded-xl border shadow-sm)
│   ├── Nav bar
│   │   ├── <span> video counter (t('msg.video_n_of_total'))
│   │   ├── <button> exact-match toggle (only when formCount > 1)
│   │   ├── <Link> "Watch" → /[l1]/[l2]/watch/[youtubeId]
│   │   └── <Button> "List All" → opens modal
│   ├── YouTubePlayer (ref={playerRef}, startTime, autoplay)
│   ├── Playback controls
│   │   ├── <Button> SkipBack (prev video, disabled at index 0)
│   │   ├── <Button> ChevronUp (previous subtitle line)
│   │   ├── <Button> Play/Pause toggle
│   │   ├── <Button> ChevronDown (next subtitle line)
│   │   └── <Button> SkipForward (next video, disabled at last)
│   └── SubtitleDisplay (mode="singleline", initialLines, highlightTerms)
│
└── Result List Modal (conditional, fixed overlay)
    ├── Backdrop (bg-black/50, click to close)
    ├── Sheet (max-h-[80vh], rounded-2xl)
    │   ├── Header ("Videos matching '{term}'" + X close button)
    │   ├── Toolbar (search filter input + sort <select>)
    │   └── Scrollable list
    │       └── per-item <button>
    │           ├── Thumbnail (<img> youtubeThumbnail + time badge)
    │           ├── Title (truncate)
    │           └── Context lines (prev line, match line highlighted, next line)
    └── (closes on backdrop click or X button)
```

### States

| State | Condition | Rendered |
|---|---|---|
| **Loading** | `loading === true` | Skeleton: pulsing placeholders for nav bar, player area, subtitle line, controls |
| **Error** | `error !== null` | `<p>` with error message |
| **Empty** | `videos.length === 0` after fetch | Nav bar preserved (toggle still accessible), player placeholder with Search icon + "No results" |
| **Active** | `videos.length > 0` | Full player UI as diagrammed above |

### Subtitle Display States (Singleline Mode)

| State | Condition | Rendered |
|---|---|---|
| **No lines** | `l2Lines.length === 0` | "Subtitles are not available for this video yet." |
| **No active line** | `activeIndex < 0` (player hasn't reported time yet) | "Subtitles are not available for this video yet." |
| **Active** | `activeIndex >= 0` | `TokenizedText` with highlighted search forms, text scale 1.5 |

┌─────────────────────────────────────────────────────────────────┐
│                     PYTHON BACKEND                              │
│  app_subs_search.py                                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Stage 1: MySQL FULLTEXT search (ngram, BOOLEAN MODE)       │  │
│  │   MATCH(subs_l2) AGAINST ('類い 類ん …' IN BOOLEAN MODE)   │  │
│  │   → Returns ~170 candidate videos (many false positives)   │  │
│  │                                                             │  │
│  │ Stage 2: reduce_video_subs_to_context()                    │  │
│  │   csv.reader → regex match on "line" column only           │  │
│  │   → Keeps ±context lines around matches                   │  │
│  │   → Videos with 0 matches → header-only CSV (payload opt)  │  │
│  │                                                             │  │
│  │ Caching: disk-based, keyed by l2+terms+category+…          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        │ JSON response (170 items → ~89 with actual subtitle lines)
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NEXT.JS CLIENT                              │
│  SubsSearchResults (subs-search-results.tsx)                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. parseSubsL2() — PapaParse CSV → SubtitleLine[]          │  │
│  │ 2. findMatchLine() — first line containing any search form  │  │
│  │ 3. Client-side filter — remove videos with 0 matching lines │  │
│  │ 4. Sort lines by starttime (required by SubtitleDisplay)    │  │
│  │ 5. Pass sorted lines → SubtitleDisplay (singleline mode)    │  │
│  │ 6. YouTubePlayer with startTime={matchLine.starttime}       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

> **Historical note:** the `## Backend: app_subs_search.py` section below documents
> the **Classic/MySQL** path (`/subs-search-classic`). Since SPEC-039 the live
> `GET /subs-search` endpoint runs on **Postgres/Supabase** via
> `utils_content.subs_search` — see the next section.

## Backend (current): `utils_content.subs_search` on Supabase

Since SPEC-039 5.5 (and optimized by SPEC-044 + SPEC-045), `GET /subs-search`
runs the Postgres path in `zerotohero-python-server/utils_content.py`. The
API response shape is unchanged, so web/mobile/Classic call sites keep working.

### Language routing

`public.subs_tsv_config(l2)` is the single source of truth for how a language
is matched:

| Language group | Phase-1 matching | Fallback on 6 s walk timeout |
|---|---|---|
| Word-based (en, fr, de, ru, es, it, …) | `to_tsvector(subs_tsv_config(l2), subs_l2) @@ websearch_to_tsquery(config, 'a OR b')` | tsvector GIN bitmap (`youtube_videos_subs_tsv_idx`), no trigram, no full scan |
| Vietnamese (`vi`) | FTS (`simple` config) | pg_trgm ILIKE bitmap |
| Continua scripts (zh/ja/th/km/lo/my/bo/dz, Sinitic variants) **with the SPEC-045 n-gram index built** | `subs_ngram_tsv @@ websearch_to_tsquery('simple', …)` on unique 1-char/2-char tokens | n-gram GIN bitmap (`youtube_videos_subs_ngram_tsv_idx`) |
| Continua scripts **before the SPEC-045 migration** (or wildcard/whitespace terms) | ILIKE + pg_trgm (`youtube_videos_subs_l2_trgm_idx`) | — (trigram is the primary path) |
| Wildcards (`*`, `?`) or terms with whitespace — any language | ILIKE | — (explicit user intent) |

The routing auto-detects the SPEC-045 migration: the token path is used only
when the `subs_ngram_tsv` column exists and the partial GIN index is valid;
otherwise continua languages keep the ILIKE/trigram path. No feature flag.

### Two-phase query

Phase 1 returns only matching ids ordered by views (`LIMIT 100`), walking the
`idx_youtube_videos_l2_views` index for common terms. Phase 2 fetches the full
rows (including the multi-KB `subs_l2` blobs) only for the limited id set.
`_reduce_subs_to_context` then rechecks every candidate line against the full
literal term (regex, `re.escape`d — see below) and keeps ±context lines.

### SPEC-045: continua n-gram token index

1-2 char terms — the common case for Chinese/Japanese/Thai dictionary lookups —
are barely indexable by pg_trgm (no usable trigram), so the ILIKE path was
slow (`中国` ~31 s, rare 1-2 char terms >30 s). SPEC-045 adds:

- **`subs_ngram_tsv tsvector`** — a stored column of unique 1-char and 2-char
  tokens per continua-language video, extracted from the `line` column only
  (metadata can never produce candidates). Tokens are split on `\S+` runs so
  spaces never cross token boundaries.
- **Partial GIN index** `youtube_videos_subs_ngram_tsv_idx` over the continua
  language list (same list as `subs_tsv_config()`'s NULL branch).
- **Query:** 1-2 char terms are single lexemes; 3+ char terms are the AND of
  overlapping bigrams (`对不起` → `对不 不起`); terms are OR-joined with
  `websearch_to_tsquery('simple', …)`.
- **Invalidation trigger** `youtube_videos_invalidate_ngram_tsv` sets the
  column NULL on subtitle writes; `backfill_subs_ngram_tsv.py` (nightly)
  repopulates it. The backfill must run **before** the index build.

`_reduce_subs_to_context` uses `re.escape` on each term before building the
match regex (so terms like `c++` can't raise `multiple repeat`), then converts
the search wildcards back to regex tokens (`*` → any run, `?`/`_` → any single
char) to stay consistent with the ILIKE path.

Measured plan gates (SPEC-045 verification): common terms → `(l2, views)` walk
stopping at LIMIT; rare/zero-match terms → Bitmap Index Scan on the n-gram GIN
index; no full `l2` index scans for plain continua terms.

### Caching

Results are cached in the shared subs-search cache (namespaced `pg` so they
never collide with the Classic MySQL keys). Walk timeouts are **not** cached as
"no matches".

## Backend: `app_subs_search.py`

### Entry Point

```
GET /subs-search?terms=類い,類ん,…,類させられる&l2=ja&limit=500&context=3
```

The `terms` parameter is a comma-separated list of inflected forms (generated by the inflections hook on the client). The server splits on commas, deduplicates, and searches.

### Stage 1: SQL FULLTEXT Search

```sql
SELECT … FROM youtube_videos_7
WHERE l2 = 2780
  AND MATCH(subs_l2) AGAINST ('類い 類ん 類た …' IN BOOLEAN MODE)
LIMIT 500
```

MySQL InnoDB uses an ngram fulltext parser (`ngram_token_size=2`) for Japanese. This tokenizes the entire `subs_l2` column (CSV text including timestamps, headers, and line content) into character bigrams. Space-separated terms in `BOOLEAN MODE` are implicitly OR-ed.

**Key caveat:** The FULLTEXT index searches the ENTIRE raw CSV string — not just the subtitle text. A term like `tagui` (romanization of たぐい) gets ngram-tokenized into `ta`, `ag`, `gu`, `ui`. These bigrams can accidentally match against unrelated English text (e.g., "s**ta**rtime", "**gu**est") or CSV structure, producing false positives. This is why ~48% of results (81 of 170 in typical queries) have zero actual matches in their subtitle lines.

The fallback when FULLTEXT is unavailable (languages without ngram indexes, wildcard terms, or terms shorter than minimum length) is `LIKE '%term%'`, which is slower but precise.

### Stage 2: `reduce_video_subs_to_context()`

```python
def reduce_video_subs_to_context(videos, terms, context):
    term_patterns = '|'.join(terms)  # regex: .*(term1|term2|...).*
    term_patterns = re.compile(r'.*(' + term_patterns + r').*', re.IGNORECASE | re.DOTALL)

    for video in videos:
        reader = list(csv.reader(StringIO(video['subs_l2'])))
        line_index = reader[0].index('line')  # dynamic column detection

        matched_indices = []
        for index, row in enumerate(reader):
            if len(row) > line_index and term_patterns.search(row[line_index]):
                matched_indices.append(index)

        # Keep ±context lines around each match
        matched_indices_with_context = …
        matched_rows = [reader[i] for i in matched_indices_with_context]

        # Reassemble reduced CSV
        video['subs_l2'] = csv_writer_output(header + matched_rows)
```

**Key behaviors:**

- **Parsing**: Uses Python's `csv.reader` which correctly handles quoted fields with embedded newlines (unlike `split('\n')`).
- **Column detection**: Dynamically finds the `line` column from the CSV header — handles both `starttime,line` and `starttime,duration,line` formats.
- **Matching**: Regex against ONLY the `line` column (not timestamps or other fields). Uses the exact terms received in the query string.
- **Context**: ±`context` lines around each match are preserved. Non-matching lines are discarded to reduce payload.
- **Empty results**: Videos where FULLTEXT matched but the regex found 0 line-column matches are emitted with a header-only CSV (`"starttime,line\r\n"`). These are ~16–25 byte payloads vs the original 10–260 KB. The client-side filter discards them.
- **Line order**: Preserves the database row order. Lines are NOT sorted by `starttime`. This matters for the frontend (see caveat below).

### Caching

Results are disk-cached in `cache/subs_search/` keyed by `l2_code + sorted_terms + category + tv_show + limit + sort + context`. Cache is checked before SQL and written after context reduction. Cache invalidation is manual — delete the cache files to force a fresh query.

### FULLTEXT vs LIKE Fallback

| Condition | Strategy |
|---|---|
| No wildcards + language has ngram index + all terms ≥ min length | `MATCH … AGAINST … IN BOOLEAN MODE` (fast, fuzzy) |
| Wildcards (`*`, `_`, `?`) present | `LIKE '%term%'` (slow, exact) |
| Language without ngram FULLTEXT index | `LIKE '%term%'` |
| Term shorter than minimum length (2 for CJK, 3 for others) | `LIKE '%term%'` |

### FULLTEXT False Positive Mechanism

The ngram parser (token_size=2) splits both search terms and indexed text into character bigrams. A search term like `tagui` produces bigrams `ta`, `ag`, `gu`, `ui`. These same bigrams appear in unrelated English text within the CSV:

- `ta` → in "s**ta**rtime" (CSV header), "Lo**re**tt**a**" (names), "S**ta**rting" (English translation text)
- `gu` → in "**gu**est", "lan**gu**age"
- `ui` → in "introd**ui**ce", "b**ui**ld"

MySQL BOOLEAN MODE considers these scattered bigram matches sufficient to return the row, even though the actual search term never appears in the subtitle text. This is an inherent limitation of ngram FULLTEXT on mixed-language content — the index doesn't know which bigrams belong to which language.

## Frontend: `SubsSearchResults`

### Component Hierarchy

```
SubsSearchResults
├── Nav bar (video counter, exact-match toggle, Watch link, List All button)
├── YouTubePlayer (embedded iframe, autoplay, startTime=matched line)
├── Playback controls (prev/next video, prev/next line, play/pause)
├── SubtitleDisplay (singleline mode, sorted initialLines, highlightTerms)
└── Result list modal (filter by text, sort by views/likes/date/length/context)
```

### Data Flow

1. **Fetch**: `GET /subs-search?terms=…&l2=ja&limit=500&context=3`
2. **Parse**: `parseSubsL2()` (PapaParse) converts CSV → `SubtitleLine[]`. Handles embedded newlines in quoted fields.
3. **Match**: `findMatchLine(lines, term)` returns index of first line containing any search form.
4. **Filter**: Client-side removes videos where zero lines match (the ~81 header-only results from the server).
5. **Sort**: Lines sorted by `starttime` ascending — **required** by `SubtitleDisplay`'s sequential active-index logic.
6. **Display**: Sorted lines passed as `initialLines` to `SubtitleDisplay` in singleline mode.

### YouTube Player Integration

The mini-player is embedded with `startTime={matchLine.starttime}`, which is applied in the YouTube IFrame API's `onReady` callback (guaranteed to work — unlike `seekTo()` calls before the API initializes). A backup `seekTo` via `setTimeout(600ms)` is also in place for navigation between videos.

### SubtitleDisplay (Singleline Mode)

In singleline mode, `SubtitleDisplay` shows only the current subtitle line based on `currentTime` from the YouTube player:

```tsx
// activeIndex is computed by iterating syncedLines sequentially:
for (let i = 0; i < syncedLines.length; i++) {
  if (syncedLines[i].starttime <= currentTime) idx = i;
  else break;  // ← breaks on first line > currentTime
}
```

**Critical requirement:** Lines MUST be sorted by `starttime` ascending. The `SubsSearchResults` component sorts `subtitleInitialLines` before passing them in. Without sorting, the loop breaks at the first out-of-order line and never finds the correct active line.

## Key Files

| File | Role |
|---|---|
| `zerotohero-python-server/app_subs_search.py` | Backend: SQL query + context reduction + caching |
| `apps/web/src/components/video/subs-search-results.tsx` | Frontend: fetch, parse, filter, sort, player + subtitle display |
| `apps/web/src/components/video/subtitle-display.tsx` | Singleline subtitle rendering with active-index tracking |
| `apps/web/src/components/video/youtube-player.tsx` | YouTube IFrame API wrapper with `startTime` support |
| `packages/utils/src/subs-csv.ts` | `parseSubtitleCSV()` — PapaParse-based CSV parser |
| `apps/web/src/app/[l1]/[l2]/dictionary/entry/…/page.tsx` | Dictionary entry page embedding `SubsSearchResults` |
| `apps/web/src/components/dictionary-entry-card.tsx` | Compact entry card also embedding `SubsSearchResults` |

## Caveats & Known Issues

### 1. Unsorted Subtitle Lines

The server's `reduce_video_subs_to_context()` preserves database row order, which is NOT chronological. Lines must be sorted by `starttime` on the client before passing to `SubtitleDisplay`. The `SubsSearchResults` component handles this via `lines.sort((a, b) => a.starttime - b.starttime)`.

### 2. FULLTEXT False Positives (48% Waste)

~81 of ~170 results returned by the server have header-only `subs_l2` (zero matching lines in the `line` column). These are MySQL ngram FULLTEXT false positives — bigrams from search terms accidentally match bigrams in unrelated CSV content (English translation text, timestamps, CSV headers).

**Impact**: ~48% of the JSON response payload is wasted on videos that get filtered out client-side.

**Potential fix**: Filter videos with 0 regex matches server-side instead of emitting header-only CSVs. This would require restructuring the query (e.g., use `LIKE` instead of FULLTEXT, or add a post-filter before caching).

### 3. YouTube IFrame API Timing

The YouTube IFrame API's `seekTo()` and `playVideo()` methods silently fail if called before `onReady` fires. The component passes `startTime` to `YouTubePlayer`, which applies it during `onReady`. The 600ms `setTimeout` seek is a backup for video-to-video navigation.

### 4. No Translation in Singleline Mode

`SubtitleDisplay` disables translation when `mode="singleline"`. The subtitle lines come from the subs-search response (limited context around matches), not the full subtitle track, so translation would be of limited value and is intentionally skipped.

### 5. Embedded Newlines in Subtitle Text

The `line` field in the subtitle CSV often contains embedded newlines (the subtitle text itself wraps across lines in the original data). PapaParse handles these correctly via its quoted-field parser. The old hand-rolled `split('\n')` parser tore these apart, causing garbled subtitle text and "Subtitles unavailable" errors.

### 6. Cache Invalidation

The server's disk cache for subs-search results has no automatic invalidation. If subtitle data is updated in Directus, the cache must be manually cleared:

```bash
find cache/subs_search -type f -delete
```
