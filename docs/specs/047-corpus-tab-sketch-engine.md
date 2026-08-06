# SPEC-047 — Corpus Tab (Sketch Engine) in the Web Dictionary

## Metadata

- **Spec ID**: SPEC-047
- **Feature**: "Corpus" tab in `DictionaryEntryTabs` with Collocations / Examples / Related / Mistakes pills
- **Status**: complete (implemented 2026-08-05)
- **Created**: 2026-08-05
- **ROADMAP Phase**: Phase 4 (Dictionary)
- **Scope**: Web (`apps/web`) consuming the Flask `/sketch-engine/*` endpoints
- **See also**: [ARCH-020 (Sketch Engine Architecture)](../arch/020-sketch-engine-architecture.md), Classic `zerotohero-nuxt/components/{Collocations,Concordance,EntryRelated,Mistakes}.vue`

## Overview

The web dictionary entry page (`DictionaryEntryTabs`) gained a **Corpus** tab that
surfaces the four Sketch Engine corpus features behind a row of pills:

| Pill | Flask endpoint | Data shown |
|---|---|---|
| Collocations | `GET /sketch-engine/collocations?word=&l2=` | Word sketch — collocates grouped by grammatical relation |
| Examples | `GET /sketch-engine/examples?word=&l2=&l1=` | Corpus example sentences (+ parallel L1 translation + ref) |
| Related | `GET /sketch-engine/thesaurus?word=&l2=` | Related words, sorted by score |
| Mistakes | `GET /sketch-engine/mistakes?word=` | Chinese learner mistakes — **zh only** |

The backend does all the parsing (ARCH-020 §7), so the web client consumes
ready-to-render JSON and contains no Sketch Engine parsing logic.

## Decisions

1. **New "Corpus" tab, not a pill inside an existing tab.** The four features are
   conceptually one group (corpus data) and there was no existing tab to attach
   them to. The tab renders `CorpusPanel` which owns the pill state.
2. **Pills, not nested tabs.** Inside the panel, `CorpusPanel` renders a row of
   pill buttons (same styling as `QueryPills` in image-search) and keeps every
   section mounted-but-hidden, so each section fetches exactly once when the
   panel opens (mirrors the prefetch strategy of `DictionaryEntryTabs`).
3. **Mistakes hidden for non-Chinese.** `baseCode(l2Code) === 'zh'` gates the
   Mistakes pill because the backend only queries the `guangwai` Chinese
   learner corpus.
4. **Direct `fetch(PYTHON_API_URL + ...)`** for the unauthenticated
   `/sketch-engine/*` endpoints — the same pattern as subs-search and image
   search. No auth token is needed (ARCH-020 §4), so the shared
   `apiClient` (which attaches tokens) is not used here.
5. **Shared types live in `@langplayer/shared`** (`SketchCollocationsResponse`,
   `SketchExamplesResponse`, `SketchThesaurusResponse`, `SketchMistakesResponse`
   + item types) so mobile can reuse them when this feature is ported.

## Files

| File | Role |
|---|---|
| `apps/web/src/components/dictionary-entry-tabs.tsx` | Adds the `corpus` tab (label `title.corpus`, `Library` icon) to both tab lists and renders `CorpusPanel` |
| `apps/web/src/components/dictionary/corpus/corpus-panel.tsx` | Pill row + section visibility; decides which pills to show |
| `apps/web/src/components/dictionary/corpus/{collocations,examples,related,mistakes}.tsx` | Per-pill fetch + render |
| `apps/web/src/components/dictionary/corpus/use-corpus-fetch.ts` | Shared fetch hook (loading/error/cancellation) |
| `apps/web/src/components/dictionary/corpus/corpus-footer.tsx` | "Corpus data provided by Sketch Engine" + corpus name attribution |
| `apps/web/src/components/dictionary/corpus/highlight-term.tsx` | Highlights the queried term in collocations/examples |
| `packages/shared/src/types.ts` | Sketch Engine response types (ARCH-020) |

## Translation keys

Added to `translations.csv` (all 31 locales): `title.corpus`, `title.collocations`,
`title.examples`, `title.related`, `title.mistakes`, `corpus.provided_by`,
`corpus.corpus_name`, `corpus.mistake_description`, `msg.no_collocations_found`,
`msg.no_examples_found_corpus`, `msg.no_related_found`, `msg.no_mistakes_found`.

## Notes & Gotchas

- **Gramrel descriptions** contain a literal `{word}` placeholder from the
  backend (e.g. `modifier of "{word}"`) — the client replaces `{word}` with the
  queried term before rendering.
- **Collocation pills show `cm`** (the full collocation phrase, e.g. `学习 知识`)
  with the term highlighted, matching Classic's `Collocation.vue`, rather than
  the bare `word` field.
- **Collocations are collapsible per category**: each grammatical-relation group
  shows 3 words by default with a per-category `Show more (N)` / `Show less`
  toggle (reusing `action.show_more` / `action.show_less`), mirroring Classic's
  per-card `ShowMoreButton`.
- **Stale dev-server messages**: new CSV keys require a restart of the web dev
  server to appear in the `packages/shared/locales/*.json` module (Turbopack
  caches the shared-package JSON import). The code and generated JSONs are
  correct on disk; only a running dev server that predates the sync serves old
  messages.
