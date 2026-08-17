# Feature Specification: Subs Search "Sort by AI" — Meaning/Pattern Grouping

## Metadata
- **Spec ID**: SPEC-081
- **Feature**: Subs search "Sort by AI" — LLM-grouped results by meaning & syntax patterns
- **Status**: draft
- **Created**: 2026-08-17
- **ROADMAP Phase**: Media — Subtitle Search

## Overview
The subs-search results component (`SubsSearchResults`) currently sorts hits by
views / likes / date / length / left-context / right-context. This spec adds a
new sort option, **AI**, that uses an LLM to group the top results by the
*meaning and syntax pattern* of the searched term. For example, for the Japanese
term っぽっち the LLM returns a group headed **"Not even a little bit:
noun + っぽっち + も + negative"** and lists the video ids whose matched line
uses that pattern. Hits the LLM can't categorize go under **Other Patterns**;
hits beyond the analyzed set (more than 50 results) go under **Other**. The
grouped result list reuses the existing collapsible group-header UI (counts,
Collapse All / Expand All, player queue follows the displayed order).

## User Stories
- As a learner, I want to see example sentences grouped by the *meaning* of the
  word I searched, so I can quickly see the most common usages.
- As a learner, I want each group to show a short explanation of the meaning +
  the syntax pattern in the target language, so I understand *why* those
  sentences group together.
- As a learner, I want group headings written in my native language (L1) while
  the subtitle examples stay in the language I'm learning (L2).
- As a learner, I want to collapse a meaning group I don't care about, so I can
  focus on the usage I'm studying.

## How It Works in Classic (Nuxt)
Classic has no AI grouping for subs search. The subs search UI lives in
`zerotohero-nuxt/components/SearchSubsComp.vue` and offers only plain sort
options; the LLM grouping is a Next.js-only feature.

## How It Works in GO (React Native)
Not ported in this spec. `apps/mobile/components/video/SubsSearchResults.tsx`
shares `SubsSearchVideo` and could adopt the same AI grouping later.

## Implementation Plan (Next.js)

### Route
No route changes. `SubsSearchResults` is embedded in the dictionary entry tabs
(`apps/web/src/components/dictionary-entry-tabs.tsx`); the new sort option and
grouped rendering live entirely inside `SubsSearchResults` and its helpers.

### Data Flow
1. User selects **AI** from the sort dropdown (new `SortKey` member `'ai'`).
2. The component snapshots the current result list `videos` (already filtered
   by the content-filter pills and the free quota). It takes the **first 50**
   entries — the most popular ones, since `videos` preserves the server's
   default popularity order — and serializes them as a **CSV payload**: one
   record per video, exactly two fields, with a header row (see
   [CSV Payload Format](#csv-payload-format)).
3. The component POSTs a prompt to the existing Flask endpoint
   `POST /chatgpt` (see API Endpoints) with `{ prompt, cache: true }`. The
   prompt embeds the L1 name, the L2 name, the term, and the 50 lines, and
   demands a strict-JSON reply (see Prompt Design).
4. The response `{status: 'success', response: '<llm text>'}` is parsed: strip
   markdown code fences if present, `JSON.parse`, then validate the shape.
5. A per-video group map is built:
   - ids returned under a pattern → that pattern's group;
   - ids present in the input but missing from every pattern → **Other Patterns**;
   - videos from `videos` beyond the first 50 → **Other** (kept in original order);
   - hallucinated ids not in the input are dropped.
6. The component renders the grouped list in the LLM's pattern order (patterns
   first, then Other Patterns, then Other). The text filter (`listSearch`) is
   applied on top of the grouping (it narrows rows inside each group); the
   player's prev/next queue follows the grouped order because it already
   follows `filteredVideos`.
7. If the user toggles away from AI sort and back, the parsed result is reused
   from a client-side cache keyed by `l2 + term + first-50 ids` (no re-request);
   the server-side `/chatgpt` cache is a second layer keyed by the prompt.

### CSV Payload Format

The {n} lines are sent to the LLM as a two-column CSV with a header row:

```
id,"line"
20418,"今未練なんかこれっぽっちも無い"
321,"I'm not even a little bit sorry."
9871,"…"
```

Field rules (exactly what `buildAiPayload` must produce):

- **`id`** — the video's numeric id, taken verbatim from the subs-search
  response (`v.id`, the same id used for the row keys and the player queue).
  Written bare, never quoted. Always an integer.
- **`"line"`** — the matched L2 subtitle line (the one containing the term,
  `v.subs_l2[v.matchLineIndex].line`). Always wrapped in double quotes, even
  when the line has no special characters.
- **Escaping inside the quoted field** (standard CSV):
  - an embedded double quote is **doubled** (`""`), e.g. the line
    `He said "hi"` becomes `"He said ""hi"""`;
  - a literal backslash is written as `\\`;
  - newline (`\n`) and carriage return (`\r`) inside the line are written as
    the two-character escape sequences `\n` and `\r` so each record occupies
    exactly one physical row of the payload (they are *preserved* — the LLM
    sees them as escapes, not lost);
  - a literal `<br>` stays as-is (it's already inline text);
  - commas need no escaping because the field is quoted.
- **Encoding**: the whole payload is UTF-8 (matches L2 subtitles; the CSV
  itself carries no BOM).
- **Row count**: exactly `min(50, videos.length)` data rows — one per analyzed
  video — plus the header row. The header row is always `id,"line"`.

Example of an escaped record (the actual payload is one physical line):

```
5482,"彼は""すごい""って言ってた\n今日は行けない\r\n<br>また明日"
```

### LLM Prompt Design

The prompt is built from a new localized translation key `prompt.subs_ai_group`
(English source below) plus the L1/L2 language names, the term, and the line
payload. The key point, stated explicitly in the prompt: **headings must be in
L1 (the user's native language), while the subtitles and pattern examples are
in L2.**

English source text (to be localized for all 18 CSV locales via the standard
CSV workflow):

> You are a language-learning assistant. Below are {n} subtitle lines from
> videos, each in {l2Name}, that contain the term "{term}".
>
> id,"line"
> {lines}
>
> Identify the distinct meanings and syntax patterns of "{term}" across these
> lines. Group the line ids by meaning/pattern. Then reply with ONLY strict
> JSON (no markdown, no commentary) in this exact shape:
>
> {"patterns": [{"heading": "<meaning in {l1Name}>", "pattern": "<syntax pattern, written in {l2Name} with placeholders>", "video_ids": [<ids>]}], "other_ids": [<ids>]}
>
> Rules:
> - "heading" must be in {l1Name}; it is the group's display title, e.g.
>   "Not even a little bit" for っぽっち.
> - "pattern" describes the grammar in {l2Name}, e.g.
>   "noun + っぽっち + も + negative".
> - Every input id must appear exactly once across all "video_ids" arrays and
>   "other_ids". Lines that don't fit any clear pattern go to "other_ids".
> - Order patterns from most common to least common.
> - Never invent ids; only use ids from the input.

The `heading` is used as the group's L1 title; `pattern` is shown under it in
L2. `other_ids` becomes the **Other Patterns** group client-side.

### Components
- `apps/web/src/components/video/subs-search-results.tsx` — main integration:
  - extend `SortKey` with `'ai'` and add it to `sortOptions` (label from a new
    `sort.ai` key);
  - when `listSort === 'ai'`, build the 50-line payload from `videos`,
    call `/chatgpt`, and store the parsed grouping
    (`{ patternGroups: {key, heading, pattern, ids}[] }` + `otherIds` +
    `beyond50Ids`);
  - derive an `aiGroupKeyFor(video)` that returns the group key per video
    (`ai-0`, `ai-1`, …, `other-patterns`, `other`) and an ordered
    `filteredVideos` (LLM pattern order, then other groups);
  - extend `renderGroupHeader` so that in AI mode the bar shows the L1
    `heading` (badge replaced by the heading text) plus the L2 `pattern` line
    and the count; collapse state, Collapse All / Expand All, and the count
    pill keep working unchanged;
  - states: loading skeleton while the LLM call is in flight; on error show a
    message + keep the previous order; abort in-flight requests when `term` /
    sort changes (existing `cancelled` pattern).
- `apps/web/src/lib/subs-ai-grouping.ts` (new) — pure helpers:
  `buildAiPayload(videos, term)` (serialize the first 50 videos as the
  two-column CSV described in [CSV Payload Format](#csv-payload-format):
  header `id,"line"`, bare integer id, double-quoted line with `""` /
  `\\` / `\n` / `\r` escaping), `buildAiPrompt(...)` (assemble the localized
  prompt), `parseAiResponse(text)` (strip fences, parse,
  validate/intersect ids, return typed grouping or `null` on malformed
  output).
- `apps/web/src/components/video/video-queue-panel.tsx` — no changes needed
  (the group header is a render prop; AI headers are supplied by
  `renderGroupHeader`).
- `packages/shared/src/types.ts` — optional: a
  `SubsAiPatternGroup { key; heading; pattern; videoIds: number[] }` type.

### API Endpoints
- Reuse `POST /chatgpt` (Flask, `zerotohero-python-server/routes/core.py`) —
  non-streaming, `ask_with_cache` (server-side cache keyed by prompt), no auth,
  rate-limited 60/min. Body: `{ prompt: string, cache: true }`. Response:
  `{ status: 'success', response: string }`. The 60/min limit is ample for
  per-search grouping; the client cache avoids repeat calls anyway.
- No new backend endpoint. If the prompt+response ever needs to become
  server-side (e.g. tighter validation or a different model), a
  `/subs-search/ai-group` route could be added to Flask later.

### States
- **Loading**: the nav bar (forms toggle + pills + sort) stays visible; the
  list area shows the existing skeleton rows while the LLM call runs.
- **Empty**: unchanged (`msg.no_results`).
- **Error**: show `msg.ai_grouping_failed` (new key) with a retry affordance;
  the list falls back to the default views order so results are never hidden.
- **Edge cases**:
  - fewer than 50 results → analyze all of them; no **Other** group;
  - more than 50 results → analyze the first 50, rest under **Other**;
  - free users (quota 5) → only 5 analyzed; no **Other** group;
  - LLM returns a syntactically invalid or schema-invalid response → treat as
    error, fall back to default order;
  - LLM omits input ids → they go to **Other Patterns**; LLM invents ids →
    dropped;
  - term / sort changes mid-flight → abort (existing `cancelled` guard),
    stale responses discarded;
  - content-filter pill change → `videos` changes, so the AI payload key
    changes and a new (server-cached) request fires.

## Dependencies
- Existing Flask `POST /chatgpt` endpoint and `app_chatgpt` cache.
- Existing grouping infrastructure in `SubsSearchResults` /
  `VideoQueuePanel` (group keys, collapsible headers, counts, Collapse All /
  Expand All) — built in prior commits.
- Existing player-queue-follows-`filteredVideos` behavior (committed in
  `c7d78c56`).
- New translation keys (all 18 locales, via `scripts/add-translation-key.mjs`
  + `sync-translations.mjs`): `sort.ai`, `label.other_patterns`,
  `label.other`, `msg.ai_grouping_failed`, `prompt.subs_ai_group`.
- `languageName()` from `apps/web/src/lib/language-data.ts` for L1/L2 names.

## Open Questions
- Should AI pattern groups be ordered by the LLM's "most common first" order
  or by descending group count (like the context sorts)? Default: LLM order.
- Should the AI analysis use the first 50 of `videos` (post-quota, post
  content-filter) or the first 50 of the raw fetched pool for Pro users with
  `expandSubsSearch` (500 hits)? Default: `videos` (what the user actually
  sees).
- Pro users only: with > 50 results, should the "Other" group be collapsible
  as one bucket, or should the app offer "analyze more" (e.g. a second 50
  batch)? Default: single "Other" bucket.
- Should the grouping result be persisted (localStorage) per
  `term + l2 + ids`, or is in-memory caching enough? Default: in-memory.
