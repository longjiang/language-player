# SPEC-031: Web Reader Reading Suggestions

## Metadata
- **Spec ID**: SPEC-031
- **Feature**: Curated + derived reading suggestions for the Web Reader
- **Status**: in-progress
- **Created**: 2026-08-02
- **ROADMAP Phase**: Phase 4 (Reading)
- **See also**: [SPEC-009 Reader Layout](./009-reader-layout.md)

## Overview

The Web Reader's empty state suggests online content in the user's L2 so they
don't have to find a URL themselves. Suggestions are a two-layer model:

1. **Curated per-language lists** (`packages/shared/src/reading-suggestions/data/*.json`)
   for languages where we hand-pick links (currently Japanese).
2. **Derived defaults** for every other L2 with a live Wikipedia edition — the
   Wikipedia front page, which the reader's HTML→markdown pipeline converts
   cleanly via `#mw-content-text`.

## Content Categories

| Category | Key | Content |
|---|---|---|
| Wikipedia | `title.wikipedia` | Wikipedia main page, featured/good articles, topic articles |
| News | `title.news` | Current-events summaries, news front pages |
| Fiction | `title.fiction` | Short stories, classic literature, web novels |
| Articles | `title.articles` | Non-Wikipedia encyclopedia and magazine articles |
| Guides | `title.guides` | Travel and reference guides |
| Blogs | `title.blogs` | Personal blogs, opinion and essay columns |

## Data Model

`packages/shared/src/reading-suggestions/`:

```ts
interface ReadingSuggestionItem {
  url: string;   // absolute URL, public + server-rendered
  title: string; // target-language label (content, not translated)
}

type ReadingSuggestions = Partial<Record<ReadingCategory, ReadingSuggestionItem[]>>;
```

`ja.json` example:

```json
{
  "stories": [
    { "title": "吾輩は猫である", "url": "https://ja.wikisource.org/wiki/吾輩は猫である" }
  ]
}
```

## Loading Logic

`getReadingSuggestions(l2Code)` in `packages/shared/src/reading-suggestions/index.ts`:

- Curated JSON wins when the current L2 has a file (imported explicitly and
  validated at compile time with `satisfies`).
- Otherwise fall back to `derivedWikipediaSuggestions(l2Code)`, which returns
  the Wikipedia front page only for languages on a verified allowlist.

## UI Placement

The suggestions render inside the Web Reader's empty state
(`apps/web/src/app/[l1]/[l2]/web-reader/page.tsx`): a "Suggested reading" heading
with one card per category, and each link calling the existing `handleLoad(url)`
pipeline (proxy → markdown → tokenized reader). Category labels come from
translation keys; link labels stay in the target language.

## Maintenance Workflow

**Add a curated language:**

1. Create `packages/shared/src/reading-suggestions/data/{code}.json`.
2. Import it in `packages/shared/src/reading-suggestions/index.ts` and add it to
   `CURATED`.
3. Verify each URL before shipping:
   - Returns 200 to a plain GET with the proxy's `LanguagePlayer/1.0` UA, no
     cookies, no JS execution.
   - HTML contains `<article>` or `id="mw-content-text"` for clean extraction.
   - Not behind a login/paywall, and not a client-rendered SPA shell.

**Extend the derived allowlist:** verify `https://{sub}.wikipedia.org` exists
before adding a code to `LIVE_WIKIPEDIA_LANGS`.

**Category labels:** add/translate `title.{category}` keys through the standard
`translations.csv` payload workflow.
