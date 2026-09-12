# SPEC-095: Interactive Textbook

## Metadata

- **Spec ID**: SPEC-095
- **Feature**: Hierarchical interactive textbook (`book > unit > lesson > task`) — tokenized L2 text with inline interactive blanks, audio playback, and per-activity stimulus widgets
- **Status**: draft
- **Created**: 2026-09-11
- **ROADMAP Phase**: Phase 5 (Content Features)
- **Web ref**: `apps/web/src/app/[l1]/[l2]/tasks/` (new), `apps/web/src/components/tokenized-text.tsx`, `apps/web/src/app/docs/doc-sidebar.tsx` (TOC pattern)
- **Mobile ref**: `apps/mobile/app/(tabs)/(vocab)/tasks.tsx` (new), `apps/mobile/components/TokenizedText.tsx`
- **Source content**: `tmp/interactive-text/` (workbook PDF, answer key PDF, audio transcript PDF, 47 mp3)
- **Related ADRs**: ADR-0043 (asset hosting), ADR-0044 (exercise state & attempt recording), ADR-0045 (mock apps as sandboxed self-contained HTML behind a bridge), ADR-0003 (no shared UI components), ADR-0041 (inline content seam in `TokenizedText`), ADR-0034 (Pro gating)

> **Note on scope**: Classic/Nuxt (`zerotohero-nuxt/`) is treated as **out of scope** for this feature by explicit product decision. This spec is grounded in the source workbook and the active web/mobile codebase only.

## Overview

An interactive textbook turns a printed course workbook into a playable activity stream. Content is hierarchical — **book → unit → lesson → task** — and each task is a small interactive exercise the student picks, listens to, and completes in place.

The first book is the HSK 4 TBLT course *Tasks for Life in China* (the workbook in `tmp/interactive-text/`). One unit of it — 第六单元 交通出行, lessons 六A–六E, tasks ➊–➏ — is the pilot corpus: 23 workbook pages, 47 audio files, plus a machine-readable answer key and an audio transcript.

The defining property of this content, and therefore of this feature, is that **the primary interaction is a blank embedded inside running L2 text**. Across the pilot unit every activity resolves to that one pattern, parameterised by where its options come from:

| Lesson / Task | Stimulus | Response | Answer source |
|---|---|---|---|
| A ➊ | map of China (image) | ~9 blanks at city pins | lettered picture set A–J |
| A ➋ | 7 audio broadcasts | blanks ①–⑦ | lettered picture set A–G |
| A ➌ | photo sets + table | two blanks per row | picture sets A–E and a–e |
| A ➍ | audio dialogue | inline blanks in a passage | parenthesised word bank |
| B ➊ | table | letter blanks ③–⑥ | global bank a–f |
| B ➋ | comparison table | inline blanks in a passage | global bank (4 words) |
| B ➍ | **12306 app screens** | 6 questions ②–⑥ | typed answers |
| B ➎ / ➏ | 小红书 article | inline `插图 ___` slots + blanks | picture set A–F, statement set A–G |
| C | dialogue | inline blanks in dialogue | lettered set |
| D ➊ / ➋ | audio | blanks + sequence numbers | bank A–I, compound |
| E ➊ / ➋ | audio + picture bank | **boxed char-count dictation** | typed, N boxes |
| E ➍ | model post | free writing | — |

Consequently the feature is **not** 60 bespoke activity components. It is **two primitives** — stimulus and response — composed per task, rendered inside a shared task shell so heterogeneous tasks feel like one product.

## User Stories

- As a Chinese learner, I want to open a unit, pick a task, and hear the audio while I answer, so I can practise listening comprehension the way the workbook intends.
- As a learner doing a cloze passage, I want to click the blank and choose from the given word bank, so I don't have to recall the exact spelling before I understand the grammar.
- As a learner doing a free-recall task, I want a blank that shows me how many characters are expected, so I know what shape of answer to produce.
- As a learner, I want to tap any word in the passage to see its definition mid-task, so I can unblock myself without losing my answers.
- As a learner, I want my answers to survive closing the app, so I can stop mid-unit and resume.
- As a learner, I want to see which blanks were right and wrong when I submit, so I can learn from the attempt.

## Non-Goals

Decided, not deferred — these are out of scope deliberately:

- **Textbook performance does not feed SRS.** Completing tasks does not create review cards, and incorrect blanks are not auto-saved as words. This is a product decision, not a phasing one. `scoreTestResult` is reused only for its scoring shape.
- **Exercise state is local only.** Answers, completion and attempt history live on the device (ADR-0044). There is no server-side exercise table, no sync, and no cross-device continuity — and none is planned here.
- **No pagination.** Long reading passages (B ➎, E ➌) render as a single continuous scrolling block. The existing paginated reader (`apps/web/src/components/reader/paginated-reader.tsx`, SPEC-087) is **not** integrated, and its measuring-window contract is not a dependency of this feature.
- **No free-form conversation production or scoring** (see Phasing).
- **No authoring UI.** Content is authored as files in the repository and validated in CI; there is no CMS screen for it.

## Content Hierarchy and Identifiers

Four levels, with stable, human-readable, sortable IDs:

```
book        tblt-hsk4                    Tasks for Life in China (HSK 4)
└─ unit     06                           第六单元 交通出行
   └─ lesson   A                         六A 你是怎么去的
      └─ task    t4                     ➍ (listening, 12 blanks)
```

- **Book ID**: short slug, e.g. `tblt-hsk4`.
- **Unit**: zero-padded number, `u06`.
- **Lesson**: single letter `A`–`E` (the workbook's own 六A–六E scheme).
- **Task**: `t{n}` matching the workbook's task numeral ➊ = `t1`.
- **Question**: within a task, the workbook's circled numerals ①②③ are question indices used to look answers up in the answer key. They are not lengths and not ids of anything else — a blank's id (`b1`) mirrors its question index.
- **Blank**: `b{n}`, unique within a task; sub-items (e.g. `(2) ①`) are ordinary blanks.

Canonical task key: `tblt-hsk4.u06.A.t4`.

Each lesson carries a **CAN-DO statement** (the workbook prints one per lesson, e.g. *能听懂日常交谈中关于交通出行的问题和介绍*). It is content, not chrome, and is displayed at the top of the lesson.

## Task Types

```ts
type TaskType = 'listening' | 'reading' | 'conversation' | 'writing';

interface TextbookTask {
  id: string;              // tblt-hsk4.u06.A.t4
  number: string;          // ➍  (display glyph)
  type?: TaskType;         // optional
  sourcePage?: number;     // workbook page, for human audit
  // ...
}
```

`type` is **optional** and affects presentation only (task icon and the lesson-grouping affordance in the task picker). It must not change the interaction mechanics — the same blank primitive serves all four types. The four values are a product decision; `listening` exists because a large share of the pilot unit's tasks are audio-primary.

## Content Model: Stimulus × Response

Every task is one or more **stimulus** blocks plus a **response** surface.

### Stimulus kinds

| Kind | Used by | Notes |
|---|---|---|
| `audio` | A ➊–➍, B, D, E | one or more tracks; each track may bind to a blank or a question |
| `passage` | A ➍, B ➋, C, D ➊ | running L2 text carrying inline blanks |
| `dialogue` | C, D | speaker-labelled lines carrying inline blanks |
| `pictureSet` | A ➋, A ➌, B ➎, E | lettered image grid the blanks reference by letter |
| `imageMap` | A ➊ | image with positioned pins, each pin holding a blank |
| `dataTable` | A ➌, B ➊, B ➋, B ➌ | tabular data, cells optionally blank |
| `mockApp` | B ➍ | a self-contained HTML mock app, referenced by id; owns its own UI and goals (see below) |
| `inlineImageSlot` | B ➎, B ➏ | an inline image placeholder inside a passage, filled by assigning a letter |

### Response kinds

| Kind | Notes |
|---|---|
| `blank:choose` | pick one option from a bank, a picture set, or an inline option list |
| `blank:type` | typed entry, optionally boxed by `expectedLength` |
| `blank:given` | worked example; pre-filled and non-editable |
| `freeWrite` | open writing surface, ungraded |

## Task Schema

Content is authored as YAML (diffable, reviewable, validator-friendly) and compiled to typed JSON. A restricted inline marker `{{bN}}` places a blank at an exact character offset in the text.

```yaml
# packages/textbooks/content/tblt-hsk4/u06/lesson-a.yaml
book: tblt-hsk4
unit: u06
lesson: A
title: 你是怎么去的
canDo: 能听懂日常交谈中关于交通出行的问题和介绍。

tasks:
  - id: tblt-hsk4.u06.B.t2
    number: ➋
    type: listening
    sourcePage: 7
    audio: [ u06/B/t2.mp3 ]
    instructions: 看看上面的信息，然后用给出的选项在（　）中填入合适的词。
    body:
      - kind: passage
        text: >-
          和谐号和复兴号的主要区别是，复兴号比较{{b1}}，比较{{b2}}，而且比较舒适。
          比如，复兴号全车都有{{b3}}，方便上网。另外，复兴号的每个座位都有{{b4}}，
          手机没电的时候真的很有用。
    blanks:
      b1: { kind: given,  answer: 快 }
      b2: { kind: choose, answer: 新,         bank: w1 }
      b3: { kind: choose, answer: 免费Wi-Fi,  bank: w1 }
      b4: { kind: choose, answer: 充电口,     bank: w1 }
    banks:
      w1: { items: [ 快, 免费Wi-Fi, 充电口, 新 ], allowReuse: false }
```

A typed blank with an explicit length hint and accepted alternates:

```yaml
    blanks:
      b2: { kind: type, answer: 商务座, accept: [ 商务座 ], expectedLength: 3 }
```

A mock-app task references its app by id and declares no blank answers — the app owns its own goals:

```yaml
  - id: tblt-hsk4.u06.B.t4
    number: ➍
    type: reading
    sourcePage: 9
    instructions: 这个周末，你想从北京坐高铁去杭州玩。参照下面"铁路12306"APP 的截图，回答问题。
    body:
      - kind: mockApp
        app: railway-12306          # → /mock-apps/railway-12306/index.html
        fallbackImage: u06/B/t4.png # workbook screenshot, shown if the frame fails
        # no `data:` and no `blanks:` — the app is self-contained
```

### Schema rules

1. **Every blank has a resolution.** Either an `answer`, or `kind: given`. The validator rejects a blank with neither.
2. **`given` blanks are real.** The answer key deliberately omits blanks the workbook pre-fills (e.g. B ➊ prints `① a` and `② b` with no key entry). Modelled as `given` so the UI pre-fills them and the key parser does not report them missing.
3. **`allowReuse` is per bank and defaults to `false`.** Do not assume each option is consumed once: in B ➊ the key reuses letter `a` for both ① and ⑤. It is a task-level fact, not a global rule.
4. **`expectedLength` defaults to `answer.length`.**
   This was originally read as being indicated by the small circled numerals the workbook prints above some blanks — **that reading was wrong.** Circled numerals (①②③) are **question indices**, matching the numbering in the answer key so a student can find the corresponding answer; they carry no length information. Blank ids align with them (`b1` ↔ ①) precisely because they share that indexing role.
   The genuine length indicator is different and appears only in the dictation tasks (E ➊ / ➋), where the workbook prints one visible box per expected character. So `expectedLength` is set explicitly for dictation tasks and otherwise left to default to `answer.length`.
5. **`accept[]`** lists additional correct surface forms (see Grading).
6. **`sourcePage`** is mandatory where the task was transcribed from the workbook, so a reviewer can audit any task against the print original.
7. **A `mockApp` stimulus carries no `data:` and no `blanks:`.** Its dataset, goals and expected answers live inside the app's HTML (see "The Mock App Stimulus"), and the validator cross-checks the answers the app declares against the task's expected answers.

### Instructions

Task instructions are **L2 text, rendered as tokenized text** — not plain strings.
This is deliberate: instructions are the first thing a student reads, so they must
carry ruby and must be tappable for a definition like any other L2 text.

```yaml
    instructions: 看看上面的信息，然后用给出的选项在（　）中填入合适的词。
```

The L1 rendering under them is **machine-translated on the spot**, not authored.

- There is deliberately **no `instructionsL1` field**. Authoring it would mean 17
  extra strings per task for a line the student reads once, and the translation
  would drift the moment the L2 instruction is edited.
- `translateTexts` in `@langplayer/utils` calls the existing `/translate_array`
  endpoint (the same one the readers use), caches per language pair in memory, and
  returns `null` on any failure rather than throwing. The L2 instructions are
  always shown and are the exercise; the translation is support beneath them, so a
  missing translation degrades to showing the L2 line alone.
- An echo of the source is treated as "could not translate" and hidden — showing
  the L2 line twice is worse than showing it once.
- It is gated by the per-L2 `display.translation` setting
  (`packages/shared/src/types.ts:1010`), not a textbook-specific toggle.
- Instructions live in the task, above the stimulus, in `TaskShell` — so every
  task type gets the same treatment.

## Inline Blanks Inside Tokenized Text

This is the core technical decision of the feature.

`TokenizedText` (`apps/web/src/components/tokenized-text.tsx`, `apps/mobile/components/TokenizedText.tsx`) has **no custom token-render prop**. Reading a file confirms there is no `renderToken`, `renderWord`, or children-override. There are exactly **two seams** that place arbitrary content *between* tokens:

1. **Note badges** (ADR-0041) — `extractNoteMarkers` strips `[n]` markers from the text *before* tokenization, then `renderItems` (`tokenized-text.tsx:548–569`) re-interleaves `{kind: 'note'}` items at the recorded character offsets.
2. **Inline images** — a `FormatRange` of `type: 'image'` replaces its alt-text tokens in the flow (`:1099–1112`).

### Decision

Extract both marker kinds in a **single pass** (`extractInlineMarkers`) and
render blanks through the same `renderItems` interleave as note badges.

> **As built.** The original plan here was to extend the `FormatRange` union with
> a `blank` type mirroring the inline-`image` mechanism. Implementation showed
> that is the wrong seam: `FormatRange` exists for *styling ranges computed by
> the markdown parser*, whereas `{{bN}}` is an inline marker whose position is
> only known by scanning the text. The notes mechanism (strip markers, record
> offsets, interleave) is the right shape and is what shipped.
>
> The one-pass detail matters: `extractNoteMarkers` and `extractBlankMarkers`
> each compute offsets in their own cleaned text, so running them in sequence
> leaves the first one's offsets stale as soon as a marker of the other kind
> precedes it. `extractInlineMarkers` scans once and records each offset against
> the output being built, so both sets are valid in the same final string.

- Marker syntax `{{bN}}` is stripped from the text before tokenization, exactly as `[n]` is today. The lemmatizer only ever sees clean text.
- Extraction is opt-in per kind: notes via the `notes` prop, blanks via a task context. Outside a textbook task, `TokenizedText` behaves exactly as before.
- The blank renders as a **sibling of** `TokenSpan`, never inside it. Adjacent tokens therefore remain dictionary-clickable — a student stuck on a blank can tap 舒适 for its definition without losing their answers.
- A char-offset reconstruction guard already exists: format mapping bails out (`return null`) when `Σ token.text.length !== text.length`, so formatting can never corrupt token alignment. The blank mechanism respects the same invariant.
- On mobile the native single-attributed-string paragraph path cannot host an interactive inline widget, so a passage containing blanks is forced onto the JS flex path — the same fallback note badges already trigger — and the plain `inline` path renders blanks read-only.

### Why not a wrapper component that splits the text

Splitting a passage into a `TokenizedText` per segment between blanks would:
- re-trigger lemmatization per fragment (each fragment is a distinct cache key `${l2Code}:${text}`);
- break sentence-level context for saved-word attribution and dictionary lookup, since each segment loses the surrounding sentence;
- defeat the mobile memoisation described below.

The offset-interleave keeps one tokenization call per passage and one continuous text for context.

## The Mobile Re-render Boundary (critical constraint)

`apps/mobile/components/TokenizedText.tsx` exports `memo(TokenizedTextImpl, tokenizedTextPropsEqual)`. The comparator (`:2022–2059`) is a **hand-written allow-list of ~30 props**. The documented reason (`:2014–2018`) is that re-rendering a block's full token tree — thousands of NativeWind Views — blocked the JS thread for **up to ~47 seconds**; `tokenized-text-spans.tsx` records 4.6s for a single ~300-token block.

Two consequences are mandatory for this feature:

1. **Blank state must not be a prop on `TokenizedText`.** If each keystroke changed a prop, the comparator would either re-render the whole token tree (unusable) or, if the prop were omitted from the comparator, silently render stale values — a student would type and see nothing, with no error.
2. **`renderItems` carries only a stable `blankId`.** The token tree is a pure function of the task schema, which never changes during an attempt. Each blank component subscribes to its own slice of a per-task store (`useSyncExternalStore` on web, equivalent on mobile) and re-renders alone.

**As built:** no new prop was added, so `tokenizedTextPropsEqual` was not touched. The task is read through a context whose value is created once per task, which is safe precisely because it never changes identity during an attempt — a context read bypasses the comparator, so an unstable value would re-render every token tree on every keystroke.

Any future prop added to `TokenizedText` for this feature **must** be added to `tokenizedTextPropsEqual`, and compared by stable reference only.

## Tokenization: Runtime, Parent-Owned

Both apps obtain tokens from Flask — `POST /lemmatize-normalized` (`zerotohero-python-server/routes/text_routes.py:184`) and `POST /lemmatize-normalized/batch` (`:219`), the latter reached on web via `enqueueLemmatize` (`apps/web/src/lib/lemmatize-queue.ts:36`, batch size 12 / 60 ms flush, cache key `${l2Code}:${text}`).

**Nothing is tokenized at authoring time.** Content files store text only — no token blobs, no build step, and nothing to keep in sync when a passage is edited or re-transcribed.

Instead the `TaskShell` is the lemmatization authority for its task, exactly as the paginated reader is for its page. It calls the batch endpoint once for the passages a task renders and hands the result to each `TokenizedText` through the existing seams: the `tokens` prop skips both the API and the `IntersectionObserver` lazy-tokenization gate (`tokenized-text.tsx:598`), and `deferTokenization` exists precisely so a parent can own lemmatization instead of the child starting its own queue request.

Consequences to accept:

- **Web needs the server in order to tokenize.** Web has no client-side tokenizer at all — no kuromoji/jieba/snowball dependency exists in `apps/web`. Mobile degrades better: it has a Chinese offline path (`zh: { needsDictSegmentation: true }`, `packages/shared/src/constants.ts:337`, implemented as jieba-compatible max-matching over the downloaded dictionary's headword set in `apps/mobile/lib/tokenizer.ts:265`).
- This costs little in practice, because a task already needs the network for its audio and images (ADR-0043). The textbook is **online-first by construction** — tokenization is not the only thing that would fail offline.
- A task's passage is short (a few sentences), so it resolves in a single batch flush rather than a per-line storm.

### Render the passage only once its tokens have arrived

This is a direct consequence of tokenizing at runtime and it is easy to get wrong. While `TokenizedText` is tokenizing it returns **plain text** — and that text already has the `{{bN}}` markers stripped. So rendering the passage before tokens land shows the passage with **no blanks at all**, and the blanks then pop in. It does not show placeholders.

`TaskShell` therefore fetches the task's tokens and renders the passage only once they are available, showing the task skeleton until then. The transition is skeleton → complete passage, never skeleton → blankless passage → blanks.

## Grading

The answer key is machine-structured and already states which blanks exist in which task (e.g. `B课 ➊: ③ f; ④ c; ⑤ a; ⑥ d.`). It is ingested into the `answer` field of each blank, and its omissions are how `given` blanks are detected.

Grading runs **locally on submit** (no server round-trip required to show correctness).

Normalization rules:

1. Trim whitespace; strip surrounding punctuation and full-width/half-width variants.
2. Accept listed alternates in `accept[]`.
3. Accept traditional/simplified equivalence via the existing pure helpers `scriptVariants` and `bestScriptSimilarity` in `packages/utils/src/srs-test-mode.ts` — a student typing 車 for 车 must be correct.
4. Choice blanks compare option identity, not free text.

Reusable pure-TS helpers already in `packages/utils/src/srs-test-mode.ts` (platform-agnostic, already shared by both apps):

| Need | Helper |
|---|---|
| Score correct/total/time → rating band | `scoreTestResult` (`:108`) |
| Traditional/simplified acceptance | `scriptVariants`, `bestScriptSimilarity` |
| Cloze text derivation | `spellBlankText`, `spellSurfaceInContext` |
| Character-count hint | spell-mode box sizing (`expectedLength`) |

`scoreTestResult` is reused for its scoring shape, not to connect textbook results to the review deck — **textbook performance does not feed SRS** (see Non-Goals).

## Authoring-Time Validation

A validator must run over every content file and fail on:

- a blank with neither `answer` nor `kind: given`;
- a `choose` blank referencing a `bank` or `optionSet` that does not exist;
- a bank option never referenced, or a `choose` answer absent from its bank;
- `expectedLength` inconsistent with `answer.length` where both are set;
- an `audio` key with no corresponding asset in the manifest;
- a task missing `sourcePage` (transcription provenance);
- a `{{bN}}` marker in text with no matching entry in `blanks`, or vice versa;
- a `mockApp` stimulus whose `app` id has no HTML file at `/mock-apps/<id>/index.html`;
- a `mockApp` app whose declared expected answers disagree with the task's answers in the answer key;
- a `mockApp` app missing a required hook (`define`, `goals`) or declaring a bridge version the frame cannot speak;
- a `mockApp` app loading a third-party library that is not on the pinned allowlist.

## Assets

Binary media does **not** go in the repository. The pilot unit alone is ~29 MB (a 3.5 MB workbook PDF, 47 mp3 files, plus key and transcript PDFs); a book is ~6 units, and this platform expects many books and levels.

- Media is served from the existing PHP shared host behind a single **`ASSET_BASE_URL`** constant — see ADR-0043. No CDN or object-storage service exists in this project today, and none is being introduced here.
- `ASSET_BASE_URL` defaults to the shared host in **both development and production**; there is no local-path default, because one pointing at a path nothing serves would render fallbacks while looking configured. Point `NEXT_PUBLIC_ASSET_URL` / `EXPO_PUBLIC_ASSET_URL` elsewhere to work offline. The URL is defined once, in `packages/textbooks/src/assets.ts`, so the two apps cannot drift — they previously did, with web defaulting to a local path and mobile to a folder that does not exist.
- Content files store **relative asset keys** (`u06/B/t2.mp3`), never absolute URLs, so the base can change without touching content.
- Stimulus images are extracted from the workbook PDF at 2–3× and re-encoded; audio is re-encoded once.
- The **vision** path already exists for pages whose content is embedded in images: `POST /vision` (`zerotohero-python-server/routes/core.py:124–150`), with `IMAGE_OCR_PROMPT` in `packages/shared/src/markdown/vision.ts` and a working caller for PDF pages (`apps/web/src/lib/pdf-book.ts:143 pdfPageToMarkdown`). Extraction reuses this rather than building new tooling.

### Do not bundle content as a generated TS module

`packages/shared/src/docs.ts` is a **2.1 MB / 28,481-line tracked generated file** reachable from the shared barrel that both apps import. Textbook content must not repeat that mistake.

The pattern to imitate is `packages/shared/src/sample-content/loaders.ts`, which keeps one module per language behind a `Record<ContentL2, () => Promise<{ default: SampleContent }>>` lazy loader map with a runtime completeness guard, so each entry is a separate chunk fetched on demand on web. Applied to textbooks the axis is the unit rather than the language: one module per unit, behind a loader map keyed by book and unit, so opening one unit does not download the whole book.

## Navigation and Information Architecture

The feature is reached from **`Study` > `Tasks`**, where `Study` is the existing top-level nav group **renamed** from `Vocab`, and `Tasks` is added **below `Review`**.

So the nav change is two edits to an existing group, not a new group:

| Group | Before | After |
|---|---|---|
| Media | explore, live-tv, tv-shows, channels, local-media | unchanged |
| Reading | reader, web-reader, epub, image-reader | unchanged |
| **Study** (was `Vocab`) | dictionary, review | dictionary, review, **tasks** |

| Platform | Where the groups are declared |
|---|---|
| Web | `apps/web/src/components/layout/header.tsx:25–49` |
| Mobile | `apps/mobile/components/layout/NavBar.tsx` (`NAV_GROUPS`, MD/tablet dropdown) and `apps/mobile/components/layout/HamburgerDrawer.tsx` (phones) |

Both mobile surfaces need the change — they are two presentations of the same list, and a link added to only one would be unreachable on the other form factor. `Tasks` also needs an icon entry in each (`sf` SF Symbol in `NavBar.tsx`, `NAV_ICONS` in both files).

### Translation keys

The group label is **not** just a display string — it is used as a translation
key suffix:

```tsx
t(`nav.${group.label.toLowerCase()}` as any)   // header.tsx, NavBar.tsx, HamburgerDrawer.tsx
```

So renaming the group to `Study` requires a `nav.study` key to exist, or the nav
renders an unresolved key. This is what actually had to change:

- **`nav.vocab` → `nav.study`** (English value `Study`, all 18 locales), because
  the derived lookup is `nav.<label>`. `nav.vocab` was **not** a dead key: it is
  listed in `scripts/find-dead-keys.mjs`'s `MUST_BE_ALIVE` set for exactly this
  reason, and that list was updated with the rename.
- **`title.tasks` is genuinely new** — nothing in the CSV has the English value
  `Tasks` and there is no near-miss `Practice`/`Exercises`/`Activities` key to
  reuse — so it was added with all 18 locales.
- Two other `Vocab` keys (`title.vocab`, `label.vocab`) remain genuinely unused;
  they were left alone rather than folded into this change.

**Do not assume a nav label change is cosmetic.** The label, the key, and the
`MUST_BE_ALIVE` list must move together.

### Mobile route group: keep `(vocab)`

`Tasks` lives in the existing `(vocab)` route group rather than a new one, so **no new `Stack.Screen` is needed** in `apps/mobile/app/(tabs)/_layout.tsx`.

The directory is **not** renamed to `(study)`: parenthesised route groups do not appear in URLs, so renaming it would be invisible to users while touching 22 references — including `apps/mobile/lib/web-url-mapper.ts`, which maps web path segments (`saved-words`, `review`, `dictionary`) onto this group and is the deep-link path (SPEC-069). Renaming the user-facing label without renaming the internal directory is the intended outcome, and any future `(study)` rename should be a separate, deliberate change.

Screens:

1. **Textbook picker** — the entry screen. Only one textbook exists today, so this is a single-item list rather than a real choice; it exists now so a second book is a content change, not a navigation change.
2. **Task TOC** — units → lessons → tasks. This mirrors the **docs UI**: `apps/web/src/app/docs/doc-sidebar.tsx` renders collapsible categories that are expanded when they contain the active child (`useState(!!hasActiveChild)`), with a chevron per group. Units and lessons are collapsible in exactly that way.
3. **Task view** — the same TOC remains in the sidebar with the **current lesson expanded**; the selected task renders in the main pane. This is the docs layout, not a separate reading mode.

So units and lessons are the two collapsible levels, and the task list is the leaf.

## Routes

### Web

```
apps/web/src/app/[l1]/[l2]/tasks/
├── layout.tsx                                    # TOC sidebar (docs-style) + main pane
├── page.tsx                                      # textbook picker
└── [bookId]/[unitId]/[lessonId]/[taskId]/page.tsx
```

The route is `tasks` to match the menu item. It is a deliberate, small naming choice — if the menu item is renamed, the path should be renamed with it.

- `[l1]`/`[l2]` are validated by `apps/web/src/app/[l1]/[l2]/layout.tsx:24–29`.
- Rename the `Vocab` group label to `Study` and add `{ key: 'title.tasks', href: 'tasks' }` below `review` in `apps/web/src/components/layout/header.tsx:25–49`.
- Auth gating: add `tasks` to `AUTH_REQUIRED_SEGMENTS` in `apps/web/src/proxy.ts` if the pilot is Pro-only (ADR-0034); otherwise add it to `GUEST_NAV_FREE_SEGMENTS`.
- Note: the `/learn/:rest*` and `/learning-path` patterns are currently redirect targets away from the web app (`apps/web/src/lib/classic-route-redirect.ts:296,356–357`), so this feature introduces its own `tasks` path and leaves those redirects untouched.

### Mobile

```
apps/mobile/app/(tabs)/(vocab)/_layout.tsx
apps/mobile/app/(tabs)/(vocab)/tasks.tsx                        # textbook picker + TOC
apps/mobile/app/(tabs)/(vocab)/tasks/[unitId]/[lessonId]/[taskId].tsx
```

- `Tasks` extends the existing `(vocab)` route group — **no new `Stack.Screen`** is required in `apps/mobile/app/(tabs)/_layout.tsx`, and the directory is **not** renamed (see "Mobile route group" above).
- Register the new screens in `apps/mobile/app/(tabs)/(vocab)/_layout.tsx`.
- Rename the group label to `Study` and add the `Tasks` link below `review` in **both** `apps/mobile/components/layout/NavBar.tsx` (`NAV_GROUPS`, tablets/MD) and `HamburgerDrawer.tsx` (phones), with an `sf` symbol and a `NAV_ICONS` entry in each.
- **Not a bottom tab.** The mobile app has no bottom tab bar: `apps/mobile/app/(tabs)/_layout.tsx` renders a `Stack` despite the directory name, and navigation is the top `Header` plus those two menus. `Tasks` follows the existing pattern rather than introducing a new navigation shell.

### Initial L2 scope

Chinese only (`l2 = zh`). The model is language-agnostic, but the pilot corpus, the answer key, and the ruby/pinyin rendering are all Chinese. Non-Chinese books must not be advertised until a second corpus exists.

## Components

Per ADR-0003, UI components are **not shared** between web and mobile; logic and types are. Each component below exists twice (web + mobile), backed by pure-TS logic in `packages/textbooks`.

### Shared logic (`packages/textbooks`, pure TS)

- **Schema + types** — task/blank/bank/stimulus types, and the YAML → JSON compiler.
- **`gradeTask(task, responses)`** — normalisation, alternate acceptance, script-variant matching.
- **Task store** — per-task, per-blank response state with subscribe/select, so blank components re-render independently of the token tree.
- **Progress store** — local persistence of attempts (ADR-0044).
- **Asset resolver** — relative key → absolute URL via `ASSET_BASE_URL`.

### Views (paired)

| Component | Responsibility |
|---|---|
| `TextbookPicker` | Entry screen: choose a textbook (single item today) |
| `TaskToc` | Docs-style collapsible TOC of units → lessons → tasks; current lesson expanded |
| `TaskShell` | Task number, type icon, audio, L2 tokenized instructions (+ L1 translation when enabled), submit/reveal, result banner — the consistency anchor |
| `AudioPlayer` | Task audio: play/pause, scrub, replay, per-track selection |
| `BlankField` | The inline blank: `given` / `choose` / `type`, sized by `expectedLength` |
| `WordBank` | The option pool a `choose` blank draws from; dims consumed options when `allowReuse` is false |
| `PictureSet` | Lettered image grid referenced by blanks |
| `ImageMap` | Image with positioned pins, each holding a blank |
| `DataTable` | Tabular stimulus with optionally blank cells |
| `MockAppFrame` | Host frame + bridge for a self-contained mock-app HTML file (see below) |
| `InlineImageSlot` | In-passage image placeholder assigned a letter |
| `DialoguePassage` | Speaker-labelled L2 lines carrying inline blanks |
| `DictationField` | Boxed per-character entry for dictation tasks |
| `FreeWrite` | Ungraded writing surface |

`MockAppFrame` is the one component whose payload is **not** authored in the task schema — a mock app is its own HTML file behind a frozen bridge contract (see "The Mock App Stimulus").

### Reuse

- **`SpellCharInput`** already exists on **both** platforms (`apps/web/src/components/review/spell-char-input.tsx`, `apps/mobile/components/review/SpellCharInput.tsx`) and is exactly the boxed per-character control the dictation tasks need. Its props include `expectedLength` (drives box count), `firstCharPlaceholder` (type-over hint for the first box), `value`/`onChange`/`onSubmit`, and `disabled`. It is deliberately IME-safe: one real text field whose value is distributed one character per box, so pinyin composition is never broken. `DictationField` wraps it.
- **`scoreTestResult`** and the other pure helpers in `packages/utils/src/srs-test-mode.ts` (see Grading).
- **`TokenizedText`** itself, for all L2 text, with the `blank` format ranges.

## The Mock App Stimulus

B ➍ shows two screenshots of the Railway 12306 app and asks six questions derived entirely from the data visible in them (fastest train, cheapest, which are 复兴号, which are sold out, which have 商务座, which have sleepers). The natural interactive form of that task is not a screenshot at all: it is a **working mock of the 12306 app** the student filters, scrolls and taps.

The same applies to future books — a hotel booking flow, or an ATM task that has to mock up a physical cash dispenser. These UIs have almost nothing in common.

A host-side declarative renderer is the wrong shape for that: its schema would accumulate a union of every app's UI and still need a bespoke escape hatch for the cash dispenser. Instead, **each mock app is a self-contained HTML file** (the "one-page app" model, authorable by an LLM), and the host provides only a frame and a bridge.

Per ADR-0045, mock apps are sandboxed and hosted same-origin.

### Three layers, and which one grows

| Layer | Lives in | Grows per new app? |
|---|---|---|
| `MockAppFrame` — frame, bridge, TaskShell integration, host chrome | `apps/web` (iframe), `apps/mobile` (WebView) | **No** |
| `mock-app-runtime.js` — help mode, token rendering, hint, progress, completion | repo, same-origin, version-pinned | **No** |
| The app itself — HTML/CSS, dataset, goals | one file per app | Yes — and it is irreducible |

Adding an app therefore costs **zero host code, zero content-schema fields, and zero translation keys**. That is the whole point of the design: the shared behaviour lives in the runtime and the contract, never in a per-app host component.

### The bridge contract

Versioned and transport-agnostic, so the same protocol rides web `postMessage` and RN WebView:

```js
// host → app
{ v:1, type:'init',      payload:{ l2:'zh', l1:'en', helpMode:false } }
{ v:1, type:'help-mode', payload:{ on:true } }
{ v:1, type:'hint' } | { v:1, type:'reset' }
{ v:1, type:'tokens',    payload:{ map:{ '北京南':[ LemmatizedToken, … ] } } }   // reply to 'tokenize'

// app → host
{ v:1, type:'ready',    payload:{ app:'railway-12306', version:'1.0.0', goals:[ { id, prompt } ] } }
{ v:1, type:'tokenize', payload:{ texts:[ '北京南', '二等座' ] } }
{ v:1, type:'lookup',   payload:{ text, lemma, rect, sentence } }
{ v:1, type:'progress', payload:{ done:[ 'cheapest' ], total: 6 } }
{ v:1, type:'complete', payload:{ goalId:'fastest', answer:'G49' } }
{ v:1, type:'resize',   payload:{ height: 640 } }
```

`MockAppFrame` refuses a mismatched major version. This message set is the entire host surface.

### Goals: one artifact for hint, evaluation and progress

Each app declares its **goals**, and a goal is an acceptance predicate over its own dataset rather than a hardcoded correct answer:

```js
MockApp.define({
  id: 'railway-12306',
  data: { services: [ /* … */ ] },
  goals: [
    { id:'fastest', prompt:'哪次列车最快？',   accept:(el, d) => el.dataset.no === fastest(d) },
    { id:'sleeper', prompt:'哪次列车有卧铺？', accept:(el, d) => el.dataset.sleeper === 'true' },
  ],
  mount(root, data) { /* render the app's own UI from data */ },
});
```

From that single declaration the runtime derives all three shared behaviours:

- **Evaluation** — the task is complete when every goal is satisfied. Evaluation must run app-side, because only the app has the data.
- **Progress** — `done / total`, reported to `TaskShell` for a progress indicator.
- **Hint** — highlight the candidate elements of the **first unmet goal**. This is why a completion path must exist for each answer: the hint is not a separate authored asset, it is the goal list read in order.

This covers both shapes uniformly. A single-goal sequenced app (the ATM: card → PIN → amount → take cash) is an ordered goal list whose acceptance conditions encode the sequencing. And B ➍'s six questions become six goals — a better design than modelling them as blanks in `TaskShell`, because the student answers them *against the app* rather than transcribing from a screenshot.

A mock app may also be a **pure stimulus with no goals** (a reference screen with nothing to do). `complete` is therefore optional, and such an app reports only tokens and lookups.

### Help mode

Help mode renders the app's words as tokenized text — **with lemmas but without ruby** — and tapping a token opens the same dictionary popup as everywhere else in the app.

The host remains the tokenization authority, consistent with the runtime-tokenization decision above. On entering help mode the app sends its tokenizable strings in one `tokenize` message; the host resolves them through the existing `/lemmatize-normalized/batch` pipeline plus `lemmatizeCache`, and returns a token map the runtime uses to wrap text nodes in spans.

Tapping a token sends `lookup` with the token text, its lemma, its rect and its sentence; the host renders **the existing `DictionaryPopup`** — not a lookalike. Its props are already exactly what the bridge carries (`token`, `l1Code`, `l2Code`, `position`, `context`, `onClose`, `apps/web/src/components/dictionary-popup.tsx:32`), so the work is a small popup-host provider, since the anchoring logic currently lives inside `TokenizedText` rather than in a provider. The token rect must be mapped from iframe coordinates to host viewport coordinates (frame offset + token rect).

Two details worth getting right:

- **Not every string is vocabulary.** Prices, times, train numbers and seat counts should not become tokens. The runtime auto-detects CJK text nodes and honours a `data-no-tokenize` opt-out.
- **Ruby is deliberately suppressed** in help mode; the token map carries `pronunciation`, the runtime simply does not render `<rt>`.

### The floor

The proof that this does not bloat is how little an app must write:

```html
<script src="/mock-apps/runtime.v1.js"></script>
<script>
MockApp.define({
  id: 'railway-12306',
  data: { services: [ /* … */ ] },
  goals: [ /* … */ ],
  mount(root, data) { /* render rows from data */ },
});
</script>
```

Beyond its own HTML and CSS, an app writes a dataset, a few predicates and a mount function. **Phase 0 should ship a "hello world" mock app** specifically to prove this floor before a real one is authored.

### Keeping the screen and the answer key from drifting

The host cannot verify a goal it cannot evaluate, so the cross-check happens at **authoring** time instead: each app declares its derived expected answers, and the validator compares them against the content answer key (see Authoring-Time Validation). A build cannot execute the app's JS, but it can compare two declared values.

### Authoring and supply-chain rules

- Mock apps are **code, not media**, so ADR-0043 does not apply to the HTML itself: it is committed, reviewed and served same-origin. This matters because these files will largely be LLM-generated — executable code shipping inside the app must be reviewed source in git, never fetched from a mutable URL at runtime.
- Media *inside* a mock app (photographs) still uses the asset host via `ASSET_BASE_URL`, but mock chrome and branding should prefer inline SVG/CSS so most apps remain genuinely one file.
- Third-party libraries loaded via `<script>`/`<link>` tags are permitted but must be **allowlisted and pinned**, or vendored. Each remote tag is a supply-chain surface, a runtime dependency, and an origin the sandbox CSP must explicitly permit.
- Mock-app text is **diegetic content** (a Chinese railway app is in Chinese) and does **not** belong in `translations.csv`. Host chrome — the help-mode and hint controls — does.

This is the highest-effort, lowest-reuse stimulus in the pilot and is scheduled last.

## Data Flow

1. Student opens **Study → Tasks** (`/[l1]/[l2]/tasks`), picks the textbook, and the unit → lesson → task TOC loads.
2. Student picks a task → task JSON loads and asset URLs resolve. `TaskShell` requests tokens for the task's passages (`/lemmatize-normalized/batch`) and holds the skeleton until they arrive.
3. `TaskShell` renders the stimulus (audio, picture set, table, map, mock app) and the passage/dialogue via `TokenizedText` with `blank` format ranges. For a `mockApp`, this means mounting `MockAppFrame` and waiting for the app's `ready` handshake.
4. Student responds. Two shapes, one store:
   - **Blank tasks** — each `BlankField` writes to its slice of the task store. The token tree never re-renders.
   - **Mock-app tasks** — the app owns its own state; `TaskShell` renders goal progress from the app's `progress` messages and the host chrome (help mode, hint) forwards over the bridge.
5. The attempt resolves — by explicit submit for blank tasks, or by the app reporting `complete` for goal-based ones. `gradeTask` runs locally wherever there are blanks; the app's declared answers cover the goal case. Correct/incorrect is shown and the attempt is persisted locally (ADR-0044).

## States

- **Loading**: task skeleton from when the task is selected until its tokens resolve. The passage is deliberately **not** rendered before then — see "Render the passage only once its tokens have arrived" above.
- **Empty**: a unit with no tasks renders the lesson list only; a lesson with no tasks is not reachable.
- **Error**: a task whose audio or image fails to load still renders the text and blanks, with an inline retry on the failing stimulus — a broken asset must never block the exercise. A `mockApp` that fails to load, errors, or never completes its `ready` handshake degrades to its fallback image (the original workbook screenshot) so the task stays answerable in `TaskShell`.
- **Offline**: **a task cannot be tokenized on web without the server** — there is no client-side tokenizer in `apps/web` — and its audio and images are remote in any case (ADR-0043). The textbook is therefore online-first, and offline is a **degradation, not a mode**: a previously-loaded task's saved answers remain readable and resumable from the local store (ADR-0044), and mobile renders tokenized text offline for Chinese via its dict-segmentation fallback. Media that fails to load degrades with an explicit notice rather than blocking the exercise.
- **Already attempted**: show previous answers and result; offer "try again".
- **Submitted but incomplete**: submit is allowed; unanswered blanks are marked as such rather than silently graded wrong.
- **Autoplay blocked**: audio requires an explicit tap; never autoplay.
- **Edge cases**: audio-less task with `type: listening` (validator flag); a `choose` blank whose bank has one remaining option; `given` blanks excluded from scoring; a task with zero blanks (pure `freeWrite`); a `mockApp` with no goals (pure stimulus — showing a submit/completion affordance would be wrong); a `mockApp` whose bridge major version the frame cannot speak (refuse, fall back to the image); a very long passage (continuous scroll — no pagination, see Non-Goals).

## Phasing

> **Implementation status.** Phases 0–3 are implemented. Unit 6 lessons A–E are
> authored; the workbook's remaining tasks for lessons B (➎/➏), C (➌) and D (➊–➎)
> are not yet transcribed. Media is not published, so picture sets and the mock-app
> fallback render their graceful fallbacks; the manifest lists every key that must
> be uploaded. Mobile audio and the mobile mock-app frame are unverified on a
> device.

- **Phase 0 — the spine.** Content schema + compiler + validator; `packages/textbooks` (types, task store, grading, asset resolver); the `blank` format-range seam in `TokenizedText` on web and mobile; `extractBlankMarkers`; `BlankField` + `WordBank`; `TaskShell` including **runtime tokenization** (batch request + hold-until-ready, see the tokenization section) and **L2 tokenized instructions** with the optional L1 translation; the **`Vocab` → `Study` rename** plus the `Tasks` nav entry on both platforms, `TextbookPicker` and `TaskToc`; answer-key ingestion; `ASSET_BASE_URL`. Ship **one task end-to-end** — B ➋ is the recommendation (self-contained, global bank, exercises the highest-leverage primitive with no stimulus widget).
- **Phase 1 — stimulus widgets.** `AudioPlayer`, `PictureSet`, `DataTable`, `DialoguePassage`. Unlocks A ➋/➌, B ➊, C, D ➊.
- **Phase 2 — bespoke stimuli.** `ImageMap` (A ➊), then `MockAppFrame` + `mock-app-runtime.js` + a "hello world" mock app to prove the per-app floor (B ➍).
- **Phase 3 — writing lesson.** `DictationField` (wrapping `SpellCharInput`), `FreeWrite`, note-capture.
- **Deferred**: free-form **conversation** production and its scoring. Note that dialogue *cloze* (lesson C) is not deferred — it is the same blank primitive over a `dialogue` stimulus and lands in Phase 1.

Audio is a from-scratch build on both platforms: there is no audio-file playback path today (web's `playAudio` in `use-speech.ts` is dead code with no callsite, mobile has no `playAudio` at all, Flask has no audio route, and there are zero audio files in either app). Mobile also needs an audio dependency added — `expo-av`/`expo-audio` are not currently installed.

## Dependencies

- **ADR-0043** — asset hosting (`ASSET_BASE_URL`). Must be settled before any content file references an asset key.
- **ADR-0044** — exercise state model and attempt recording.
- **ADR-0041** — the `notes` inline seam this feature's `blank` seam mirrors.
- **ADR-0045** — mock apps as sandboxed, self-contained HTML behind a frozen bridge; supplies the bridge contract, the sandbox and hosting rules, and the design-token carve-out.
- **ADR-0003** — UI not shared between web and mobile.
- **SPEC-066** — SRS review; source of the reusable pure grading/question helpers. Note the reuse is one-directional: textbook results do not feed the deck (see Non-Goals).
- **ADR-0034** — Pro gating, if the pilot textbook is Pro-only.

## Resolved Decisions

All six questions this spec opened with were settled on 2026-09-11. Recorded here so they are not re-litigated:

| Question | Decision | Specified in |
|---|---|---|
| Instructions language | L2, rendered as **tokenized text**; L1 translation below, gated by the per-L2 `display.translation` setting | Instructions |
| Does textbook performance feed SRS? | **No** — a product decision, not phasing | Non-Goals, Grading |
| Attempt recording scope | **Local only** for now; no server-side exercise table or sync | Non-Goals, ADR-0044 |
| Multi-book catalogue | Reached from **`Study` > `Tasks`**: the existing `Vocab` nav group is **renamed to `Study`** and `Tasks` is added **below `Review`** — no new top-level group, and not a bottom tab. Then a textbook picker, then a docs-style collapsible TOC of units → lessons → tasks, side-by-side with the task | Navigation and Information Architecture |
| `expectedLength` semantics | Circled numerals are **question indices** for answer-key lookup, **not** length hints. `expectedLength` defaults to `answer.length` and is set explicitly only for dictation (E ➊/➋), where the workbook prints one box per character | Schema rules #4 |
| Pagination | **Not needed** — long passages render as one scrolling block | Non-Goals |

## Open Questions

1. **Mock app accessibility.** ADR-0045 leaves keyboard and assistive-technology behaviour unspecified for a mock app rendered inside a frame. It will have to be specified per app rather than inherited from the host.
2. **Second-textbook picker behaviour.** The picker is currently a single-item screen. Its shape once a second book exists (level grouping via the existing `SCALES` registry, ordering, licensing) is unaddressed.
