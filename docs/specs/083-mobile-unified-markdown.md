# Feature Specification: Unified Markdown Parsing & Rendering — Web + Mobile (SPEC-083)

## Metadata
- **Spec ID**: SPEC-083
- **Feature**: One markdown engine, one block model, one parse entry point (`parseMarkdownBlocks()`) in `packages/shared`, consumed by **both** `apps/web` and `apps/mobile`; every markdown surface renders through it
- **Status**: complete
- **Created**: 2026-08-18
- **Completed**: 2026-08-18 (all 6 tasks committed separately; web swap + cleanup landed in the final commit)
- **ROADMAP Phase**: Mobile parity — Reading / Vocab / Docs

## Overview

Markdown text reaches users through many surfaces — the web reader, the EPUB
reader, the docs screens, the "Let DeepSeek Explain" cards, and backend
translation strings — and today each app parses it with a different engine:

| App | Engine | Where |
|---|---|---|
| Web | `remark-parse`/`unified` + `remark-gfm` | `apps/web/src/lib/parse-markdown.ts` (reader blocks) + ReactMarkdown in 7 files (AI explain, docs, readers, subs) |
| Mobile | `marked` v18 | `apps/mobile/lib/parse-markdown.ts` (reader blocks) |
| Mobile | `react-native-markdown-display` (3rd-party) | `apps/mobile/components/MarkdownText.tsx` (docs) |
| Mobile | hand-rolled regex | `components/dictionary/MarkdownExplanation.tsx` (AI explain), `lib/inline-markdown.tsx` (translations) |

**Goal**: web and mobile use the **exact same markdown parsing library and
logic**, via a shared core in `packages/shared/src/markdown/`, and every
surface — readers, EPUB, docs, AI explain, translations — funnels through one
pipeline: **`(html?) → markdown → parseMarkdownBlocks() → render`**. The
EPUB reader joins the web-reader path (EPUB content is already HTML → convert
it to markdown like any fetched article, instead of a parallel native
HTML→blocks converter). Web's proven remark-based reader logic is *relocated*
into the shared core, not rewritten, so web behavior is preserved by
construction and mobile gains parity.

## Engine Decision — why `remark-parse` (and the options compared)

The spec was initially drafted around `marked` (mobile's existing dependency).
The "exact same library" requirement forced an actual comparison, because web
already renders markdown through the **remark/unified ecosystem everywhere**
(ReactMarkdown = remark-parse under the hood, in 7 web files, plus the reader
block parser). Candidates considered (all pure JS, RN/Metro/Hermes- and
worker-safe):

| Parser | In repo today | Disk (node_modules) | GFM (tables/strikethrough/autolinks) | AST | Notes |
|---|---|---|---|---|---|
| **remark-parse** (+ unified, micromark, remark-gfm) | **Web** (reader blocks + all ReactMarkdown) | ~780K total (remark-parse 40K, unified 172K, micromark 420K, mdast-util-from-markdown 148K) | via remark-gfm (already a web dep) | mdast — structured `strong`/`emphasis`/`link`/`inlineCode` children | The ecosystem we already live in (ReactMarkdown, MDX, Next.js). Web's format-extraction and `repairDelimiters` are mdast-shaped. |
| **marked** v18 | Mobile (reader blocks only) | ~460K | built-in | flat token stream with `.tokens` | Fast, tiny, proven — but web uses it nowhere. Choosing it forces web to run **two** engines (ReactMarkdown stays remark) or migrate 7 ReactMarkdown surfaces. |
| **markdown-it** | nowhere | ~1.0M | built-in options | flat token stream | Powerful inline ruler, fast, but a **third** engine — pure downside for consistency. |
| micromark direct | (part of remark tree) | — | via plugins | events | Too low-level; remark is built on it. |
| commonmark.js | nowhere | small | no | — | Reference implementation, slow, no GFM. Rejected. |

**Decision criteria, in order:**

1. **One engine across every surface on both apps** — remark wins outright:
   web changes **zero** rendering code (ReactMarkdown and the reader parser are
   remark today), and mobile converges to it. Choosing marked would leave web
   with two engines unless all 7 ReactMarkdown surfaces migrate.
2. **Proven in this codebase** — web's `parse-markdown.ts`
   (`repairDelimiters`, mdast→formats walker, raw reconstruction) is
   production-proven; the shared core is a **relocation + extension** of that
   file, so web's current behavior is preserved by construction.
3. **GFM** — tie (remark needs the `remark-gfm` plugin; marked has it built
   in; `remark-gfm` is already a web dependency).
4. **RN/worker compatibility** — tie (all pure JS).
5. **Size/perf** — marked is smaller (~460K vs ~780K) and faster; remark's
   micromark is a thorough CommonMark implementation, but parse cost for
   reader chapters (tens of KB) is a non-issue on device, and the remark tree
   is shared with web's existing usage.
6. **Ecosystem/maintenance** — remark/unified is the most widely adopted
   markdown stack in the JS/TS world (MDX, VitePress, Next.js tooling).

**Verdict: `remark-parse` + `remark-gfm` throughout.** Mobile drops `marked`;
web keeps remark everywhere. The cost is a slightly larger mobile bundle and
slower parsing than marked — tracked as an Open Question, not a blocker.

## User Stories

- As a user of any markdown surface on any device, I want the same input to
  render the same way — same engine, same block model, same fixes.
- As a mobile reader user, I want the DeepSeek card, docs, articles, and EPUBs
  to render headings, lists, code, tables, and bold like the web does, not as
  raw markers or with three different engines' quirks.
- As a mobile EPUB reader, I want `#fragment` TOC jumps and internal links to
  keep working after the reader moves to the single markdown pipeline.
- As a maintainer, I want one testable `parseMarkdownBlocks()` that both apps
  call, so a fix lands on both platforms at once.

## Current State (gaps per surface)

### `apps/web/src/lib/parse-markdown.ts` (web reader blocks — the parity target)
remark-parse → `ReaderBlock = TextBlock | MarkdownBlock`. Already has:
`repairDelimiters` (CJK flanking fix), format extraction from mdast
(bold/italic/code/link), raw-markdown reconstruction (`reconstructNode`) for
tables/code/images/hr rendered via ReactMarkdown. Gaps vs the target model:
tables/code/images/hr are `MarkdownBlock` (raw) rather than typed blocks;
headings keep formats; no `listDepth`; no strikethrough styling.

### `apps/mobile/lib/parse-markdown.ts` (mobile reader blocks)
`marked`-based. Gaps (carry over from the earlier draft):
1. `code`, `hr`, `html` lexer tokens are **silently dropped**.
2. Headings strip inline formats (`plainText()`).
3. Mixed text+image paragraphs lose the image.
4. No CJK `repairDelimiters` port.
5. No strikethrough; no nested-list depth; no tests.

### `apps/mobile/lib/epub-parser.ts` (`convertHtmlToBlocks`)
Native HTML→`ContentBlock` converter with `srcElementId` (own or nearest
ancestor — SPEC-049 §9.1), link formats (SPEC-049 §9.7), archive image
resolution, spine metadata, and Haodoo `<br><br>` paragraph splitting. It
already emits `type: 'pre'` blocks that `PaginatedReader` renders as
**nothing** (no branch matches — verified). **Replaced** by the single
pipeline in this spec; its id-tracking behavior is preserved via id anchors
(see Target Architecture).

### `apps/mobile/components/MarkdownText.tsx` (docs)
`react-native-markdown-display` — a third engine with its own styling; only
consumer is `app/(tabs)/(me)/docs.tsx` (passes `rules` for TOC onLayout).

### `apps/mobile/components/dictionary/MarkdownExplanation.tsx` (AI explain)
Hand-rolled regex (backticks, `**bold**`, `*italic*` only) — DeepSeek replies
with `##` headings or `-` bullets show raw markers (motivated this spec).

### `apps/mobile/lib/inline-markdown.tsx` (translations)
Hand-rolled regex `parseInlineMarkdownRanges()` / `renderInlineMarkdown()` —
fine for short L1 translation strings, but duplicates inline logic.

### Dead code
`apps/mobile/components/AiExplanation.tsx` uses `MarkdownText` but is imported
nowhere — delete it.

## Target Architecture

### A. Shared core — `packages/shared/src/markdown/` (pure TS, no React/RN/Next imports)

- **`types.ts`** — the unified block model (superset of both apps' models):
  - `TextBlock` — `paragraph | heading | list-item | blockquote`; `text`,
    `formats` (always present), `depth?` (heading level), `listDepth?`
    (0 = top), `ordered?`/`start?` (list items); EPUB-only fields
    (`srcElementId`, `spineIndex`, `startsNewSpine`) optional, untouched.
  - `CodeBlock` (new: `language?`, `text`), `ThematicBreakBlock` (new),
    `HtmlBlock` (new: raw source, rendered muted — RN never executes HTML),
    `ImageBlock` (`uri`, `alt?`), `TableBlock` (`header`, `rows`).
  - `FormatRange` — `bold | italic | code | link | strikethrough | highlight`
    with `start`/`end`/`url?` (extends web's `FormatRange`; adds
    `strikethrough`).
- **`parser.ts`** — `parseMarkdownBlocks(md, opts?): ContentBlock[]`:
  - `unified().use(remarkParse).use(remarkGfm).parse()` + the existing web
    walkers (`makeTextBlock`, `extractTextAndFormats`, `repairDelimiters`),
    relocated verbatim, extended for: `code` → `CodeBlock`, `thematicBreak` →
    `ThematicBreakBlock`, `html` → `HtmlBlock`, nested lists → flat items with
    `listDepth`/`ordered`/`start`, mixed text+image paragraphs → one text block
    with the image as an inline `image` format range (a paragraph of only
    images stays a set of standalone `ImageBlock`s; web renders the inline
    range, mobile splits it back until native inline drawing lands),
    strikethrough (`delete`) → `strikethrough` format.
  - **Id-anchor mapping** (EPUB fragment support through markdown): an HTML
    token `<a id="sec1"></a>` (emitted by the converter) preceding a block
    assigns `srcElementId: "sec1"` to that block. CommonMark-compliant
    (inline HTML passthrough), so fragments survive the HTML→MD→blocks path.
- **`reconstruct.ts`** — `reconstructRaw(node)` (web's `reconstructNode` +
  `toMarkdownBlock` + `isEmptyMarkdown`, relocated) so web can keep rendering
  markdown-kind blocks through ReactMarkdown with zero behavior change.
- **`html-to-markdown.ts`** — `htmlToMarkdown(html, opts)` (mobile's
  `lib/html-to-markdown.ts`, relocated and extended):
  - `opts.preserveIds` — emit `<a id="…"></a>` anchors before blocks that
    carry an element id (EPUB path).
  - `opts.resolveImage(path) -> uri` — rewrite image `src` (EPUB archive
    images).
  - Same noise-stripping, entity decoding, list/heading/code/blockquote
    conversion as today. Web keeps turndown for now (see Out of Scope).
- **`inline.ts`** — pure `parseInlineRanges(text)` (the regex walker from
  `lib/inline-markdown.tsx`), so translations/corpus highlighting shares one
  implementation; the RN `renderInlineMarkdown` wrapper stays app-side.

### B. One pipeline — `(html?) → markdown → parseMarkdownBlocks() → render`

```
web reader:    fetch HTML → htmlToMarkdown(html) ─┐
EPUB (mobile): chapter HTML → htmlToMarkdown(html, {preserveIds, resolveImage})
                                                 └─→ parseMarkdownBlocks() → MarkdownBlocks/PaginatedReader render
docs / AI:     markdown text ────────────────────┘
```

- **EPUB ingestion** (`apps/mobile/lib/epub-parser.ts`): `convertHtmlToBlocks`
  is **replaced**. Each spine document goes through
  `htmlToMarkdown(html, { preserveIds: true, resolveImage })` →
  `parseMarkdownBlocks()`. The caller tags `spineIndex` and `startsNewSpine`
  (first block of each spine) after parsing — book-level metadata, not
  markdown concerns. Haodoo `<br><br>` splitting works naturally (`<br>` →
  `\n`, two breaks → paragraph). TOC/nav parsing (`parseNavList`) stays
  HTML-based — it reads the nav document, not the reader content.
- **`#fragment` resolution** keeps working: TOC href `chapter.xhtml#sec1` →
  block with `srcElementId === "sec1"` (via id anchors). `[text](#sec1)`
  internal links carry the fragment in `FormatRange.url` and resolve the same
  way.
- **Web reader** (`apps/web/src/lib/parse-markdown.ts`): becomes a thin
  re-export of the shared `parseMarkdownBlocks`/`reconstructRaw`. Its
  `MarkdownBlock`-kind rendering path (ReactMarkdown) keeps working via
  `reconstructRaw`; migrating web's reader to render the typed blocks natively
  is a follow-up (see Out of Scope).

### C. Renderer — `apps/mobile/components/markdown/MarkdownBlocks.tsx`

One native renderer for `ContentBlock[]` (design tokens only; `TokenizedText`
for text blocks so L2 tokenization, translations, and formats keep working):

- Headings sized by `depth`; paragraphs; blockquotes (left border + muted);
  list items — flat blocks indented by `listDepth`, bullets `•`/`◦`/`▪` by
  depth, ordered items number from `start..` (nested-list decision, see Open
  Questions); `CodeBlock` (mono + muted bg); `ThematicBreakBlock` (1px rule);
  `TableBlock` (reuse `PaginatedReader`'s table markup); `ImageBlock`
  (contain, 60% width); `HtmlBlock` (muted mono source).
- Inline formats → `TokenizedText` `formats` (add `strikethrough` →
  line-through in `TokenizedText.tsx`'s `tokenFormatMap`).
- Props: `blocks`, `l2Code?`, `streaming?`, `onOpenLink?`, `textScale?`,
  `ruleOverrides?` (docs TOC heading onLayout hooks).

### D. Surfaces become thin consumers

| Surface | After |
|---|---|
| Readers (`PaginatedReader`) | consumes the extended model (code/hr/html render; EPUB `pre` blocks fixed; heading formats; strikethrough; depth-aware lists) |
| Docs (`MarkdownText.tsx`) | thin wrapper: `parseMarkdownBlocks(content)` → `<MarkdownBlocks ruleOverrides>`; `react-native-markdown-display` removed |
| AI explain (`MarkdownExplanation.tsx`) | streaming phase unchanged (plain lines); finished → `parseMarkdownBlocks` → `<MarkdownBlocks>` with `codeSpans: 'tokenize'` (backticked L2 spans stay interactive); the finished render passes `textScale={0.875}` + `lineHeightScale={1.625}` so the body text keeps the streaming phase's `text-sm leading-relaxed` size and leading (14px / 1.625) instead of jumping to MarkdownBlocks' 16px / 2.0 defaults — web renders both phases through the same prose styles, so the size must not change when the stream finishes (`4725d6bc`; `MarkdownBlocks` gained a `lineHeightScale` prop, default 2.0) |
| Translations | `renderInlineMarkdown` wraps shared `parseInlineRanges` (identical output) |
| Web reader | `parse-markdown.ts` re-exports shared core; ReactMarkdown raw path unchanged |
| EPUB (mobile) | `htmlToMarkdown({preserveIds, resolveImage})` → shared parser (single path) |

## Implementation Plan

### Task 1 — Shared core in `packages/shared`
1. Create `packages/shared/src/markdown/{types,parser,reconstruct,html-to-markdown,inline}.ts`; add deps to `packages/shared`: `unified`, `remark-parse`, `remark-gfm` (web's versions); export from the package index.
2. Relocate web's `parse-markdown.ts` walkers + `repairDelimiters` + reconstruction verbatim; extend for `code`/`hr`/`html` tokens, nested-list `listDepth`/`ordered`/`start`, mixed-image paragraph splitting, `strikethrough` format, id-anchor mapping.
3. Relocate mobile's `html-to-markdown.ts`; add `preserveIds` and `resolveImage` opts.
4. Tests: add a vitest script to `packages/shared` (core is pure TS, Node-safe). Golden fixtures: web's current parse outputs (seeded **before** the swap as a parity gate), tables, strikethrough, autolinks, fenced/indented code, `hr`, raw HTML, CJK flanking (`**調理時間：**20分`), nested emphasis offsets, mixed text+image paragraphs, ordered lists (`start`), nested lists (`- a⏎  - b⏎    - c` → `listDepth` 0/1/2; mixed `1. a⏎   - b`), id anchors (`<a id="sec1"></a>` → `srcElementId`), and the format-offset invariant (`formats` ⊆ `text.length`) that `TokenizedText` relies on.

### Task 2 — Mobile renderer + docs
1. `apps/mobile/components/markdown/MarkdownBlocks.tsx` (design tokens only).
2. Rewrite `MarkdownText.tsx` as parse→render wrapper; keep `rules` → `ruleOverrides` so `docs.tsx` TOC hooks work.
3. Remove `react-native-markdown-display` from mobile deps (after Task 6 confirms no other importers).

### Task 3 — AI explain migration
1. Rewrite `components/dictionary/MarkdownExplanation.tsx`: streaming → current plain lines; finished → blocks + `<MarkdownBlocks codeSpans="tokenize">`.
2. Regression-check the SPEC-035 Synonyms reply (bold headwords, `/pron/`, bullets, backticked examples).
3. Delete dead `apps/mobile/components/AiExplanation.tsx`.

### Task 4 — Reader + EPUB single path
1. `PaginatedReader.tsx`: render branches for `CodeBlock`/`ThematicBreakBlock`/`HtmlBlock`; route EPUB's `type: 'pre'` blocks to the code branch (they render nothing today); depth-aware list markup; keep `onBlockLayout` measurement on every block (pagination unaffected).
2. `TokenizedText.tsx`: add `strikethrough` to `tokenFormatMap` + line-through style.
3. `lib/epub-parser.ts`: replace `convertHtmlToBlocks` with `htmlToMarkdown({preserveIds, resolveImage})` → `parseMarkdownBlocks`, tagged with `spineIndex`/`startsNewSpine`; keep nav/TOC parsing; keep `EpubFormatRange` as the format alias.
4. `lib/html-to-markdown.ts`: thin re-export of the shared converter.
5. `use-epub-pagination.ts`/`use-epub.ts`: unchanged signatures (blocks still arrive as `ContentBlock[]`).

### Task 5 — Inline consolidation
1. `parseInlineRanges` in shared core; `renderInlineMarkdown`/`parseInlineMarkdownRanges` re-export from it (same signatures); repoint the six call-site files (`TextActionMenu`, `SubtitleDisplay` — two call sites, `SubsSearchRow`, `settings/display.tsx`, `corpus/examples.tsx`, `corpus/collocations.tsx`); delete `lib/inline-markdown.tsx`. Golden tests for `markBold` true/false.

### Task 6 — Web swap + cleanup + verification
1. `apps/web/src/lib/parse-markdown.ts` → re-export of shared core; delete local walkers; parity fixtures must pass unchanged.
2. Remove `marked` from `apps/mobile` deps; delete `components/AiExplanation.tsx`.
3. `npx turbo typecheck` (both apps) + run `packages/shared` vitest suite.
4. Manual QA matrix: web reader (headings/bold/code fences/hr/tables/images), web docs/AI explain (unchanged), mobile web-reader, mobile EPUB (`#fragment` TOC jumps, internal links, images, code blocks, Haodoo `<br><br>`), mobile docs (all block kinds + TOC), mobile AI explain (Synonyms/Morphemes replies, regenerate/copy, stream→finish), translation modals + corpus (`markBold`).

## Dependencies

- `packages/shared` gains: `unified` ^11, `remark-parse` ^11, `remark-gfm` ^4 (already web deps); `marked` and `react-native-markdown-display` leave mobile.
- Web parity reference stays `apps/web/src/lib/parse-markdown.ts` until Task 6 relocates it.
- No backend changes; no `translations.csv` changes (no user-facing strings).

## Out of Scope

- **Web native block renderer** — web keeps ReactMarkdown for markdown-kind
  rendering (via shared `reconstructRaw`) after the parser swap; rendering the
  typed blocks with dedicated DOM components is a follow-up (rendering stays
  per-platform; parsing is now identical).
- **Web turndown → shared `htmlToMarkdown`** — web's web-reader ingestion
  keeps DOMParser+turndown for now (its output quality is well-tested; the
  shared converter serves mobile's two ingestion paths). Adoption is a
  follow-up with its own fixtures. Web's turndown path resolves relative
  `<img>` srcs (and `<a>` hrefs) against the page URL via `new URL(src,
  baseUrl)` — parity with the shared converter's `resolveImgSrc`, so e.g.
  Aozora Bunko's `../../../gaiji/2-88/…` character tiles render instead of
  showing a broken image.
- **Web EPUB ingestion unification** — web keeps its native EpubBlock +
  1:1 bridge (`epub-reader-blocks.ts`); it already ends at the shared block
  stream. A later task can move web EPUB to the shared
  `htmlToMarkdown({preserveIds})` path too.
- **Live markdown while streaming AI replies** — mobile renders plain lines
  during the stream (web live-renders); see Open Questions.

## Open Questions

1. ~~Nested lists~~ — **Decided (2026-08-18): keep flat, carry depth.** Items
   stay top-level blocks (pagination, tokenization, search stay simple) but
   carry `listDepth` + `ordered`/`start`; renderer indents by depth with
   alternating bullet glyphs (`•`/`◦`/`▪`) or `start..` numbering.
2. **remark vs marked bundle/perf on mobile** — remark tree is ~780K disk vs
   marked ~460K and slower parsing. Accepted for consistency (web already
   pays this cost); revisit only if a bundle audit shows real impact.
3. **Strikethrough in tokenized reader text** — web parses `delete` but drops
   styling. Include `strikethrough` on mobile + web shared model (recommended;
   free once the model has it).
4. **Raw HTML blocks** — render as muted source text (recommended) or drop
   them like today? Rendering source is more robust (nothing silently
   disappears).
5. **Live markdown while streaming AI replies** — keep plain-line streaming
   (recommended — avoids re-parse flicker per token) or throttle-parse?
