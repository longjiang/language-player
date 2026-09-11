# SPEC-095: Interactive Textbook

## Metadata

- **Spec ID**: SPEC-095
- **Feature**: Hierarchical interactive textbook (`book > unit > lesson > task`) — tokenized L2 text with inline interactive blanks, audio playback, and per-activity stimulus widgets
- **Status**: draft
- **Created**: 2026-09-11
- **ROADMAP Phase**: Phase 5 (Content Features)
- **Web ref**: `apps/web/src/app/[l1]/[l2]/textbook/` (new), `apps/web/src/components/tokenized-text.tsx`
- **Mobile ref**: `apps/mobile/app/(tabs)/(reading)/textbook.tsx` (new), `apps/mobile/components/TokenizedText.tsx`
- **Source content**: `tmp/interactive-text/` (workbook PDF, answer key PDF, audio transcript PDF, 47 mp3)
- **Related ADRs**: ADR-0043 (asset hosting), ADR-0044 (exercise state & attempt recording), ADR-0003 (no shared UI components), ADR-0041 (inline content seam in `TokenizedText`), ADR-0034 (Pro gating)

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
- **Task**: `t{n}` matching the workbook's circled numeral ➊ = `t1`.
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
| `mockApp` | B ➍ | a rendered app screen driven by a dataset (see below) |
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

### Schema rules

1. **Every blank has a resolution.** Either an `answer`, or `kind: given`. The validator rejects a blank with neither.
2. **`given` blanks are real.** The answer key deliberately omits blanks the workbook pre-fills (e.g. B ➊ prints `① a` and `② b` with no key entry). Modelled as `given` so the UI pre-fills them and the key parser does not report them missing.
3. **`allowReuse` is per bank and defaults to `false`.** Do not assume each option is consumed once: in B ➊ the key reuses letter `a` for both ① and ⑤. It is a task-level fact, not a global rule.
4. **`expectedLength`** defaults to `answer.length`. The workbook annotates some blanks with a small circled numeral that appears to indicate expected character count; that reading must be confirmed during authoring before any explicit hint value is trusted over the answer length.
5. **`accept[]`** lists additional correct surface forms (see Grading).
6. **`sourcePage`** is mandatory where the task was transcribed from the workbook, so a reviewer can audit any task against the print original.

## Inline Blanks Inside Tokenized Text

This is the core technical decision of the feature.

`TokenizedText` (`apps/web/src/components/tokenized-text.tsx`, `apps/mobile/components/TokenizedText.tsx`) has **no custom token-render prop**. Reading a file confirms there is no `renderToken`, `renderWord`, or children-override. There are exactly **two seams** that place arbitrary content *between* tokens:

1. **Note badges** (ADR-0041) — `extractNoteMarkers` strips `[n]` markers from the text *before* tokenization, then `renderItems` (`tokenized-text.tsx:548–569`) re-interleaves `{kind: 'note'}` items at the recorded character offsets.
2. **Inline images** — a `FormatRange` of `type: 'image'` replaces its alt-text tokens in the flow (`:1099–1112`).

### Decision

Extend the existing `FormatRange` union with a `blank` type carrying a `blankId`, mirroring the `image` mechanism, and render it through the same `renderItems` interleave.

- Marker syntax `{{bN}}` is stripped from the text before tokenization, exactly as `[n]` is today. The lemmatizer only ever sees clean text.
- The blank renders as a **sibling of** `TokenSpan`, never inside it. Adjacent tokens therefore remain dictionary-clickable — a student stuck on a blank can tap 舒适 for its definition without losing their answers.
- A char-offset reconstruction guard already exists: format mapping bails out (`return null`) when `Σ token.text.length !== text.length`, so formatting can never corrupt token alignment. The blank mechanism must respect the same invariant.

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

Any future prop added to `TokenizedText` for this feature **must** be added to `tokenizedTextPropsEqual`, and compared by stable reference only.

## Tokenization: Precomputed at Authoring Time

Both apps obtain tokens from Flask — `POST /lemmatize-normalized` (`zerotohero-python-server/routes/text_routes.py:184`) and `POST /lemmatize-normalized/batch` (`:219`), the latter reached on web via `enqueueLemmatize` (`apps/web/src/lib/lemmatize-queue.ts:36`, batch size 12 / 60 ms flush, cache key `${l2Code}:${text}`).

Crucially, **web has no client-side tokenizer at all** — no kuromoji/jieba/snowball dependency exists in `apps/web`. Mobile has a local fallback chain (`apps/mobile/lib/tokenizer.ts`), but web is online-only.

Textbook prose is static, so:

- **Pre-tokenize each passage at authoring time** via `/lemmatize-normalized/batch` and store the resulting `LemmatizedToken[]` (`packages/shared/src/types.ts:186`) in the content payload.
- Pass them via the existing `tokens` prop, which **skips the API entirely** (`tokenized-text.tsx:598`) and also skips the `IntersectionObserver` lazy-tokenization gate.

This makes the textbook render instantly, removes per-line network chatter, and — critically — makes web textbook content work **offline**, which is otherwise impossible.

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

`scoreTestResult` is deliberately reused so a future "textbook results feed SRS" step maps onto ratings without inventing a second scoring scheme.

## Authoring-Time Validation

A validator must run over every content file and fail on:

- a blank with neither `answer` nor `kind: given`;
- a `choose` blank referencing a `bank` or `optionSet` that does not exist;
- a bank option never referenced, or a `choose` answer absent from its bank;
- `expectedLength` inconsistent with `answer.length` where both are set;
- an `audio` key with no corresponding asset in the manifest;
- a task missing `sourcePage` (transcription provenance);
- a `{{bN}}` marker in text with no matching entry in `blanks`, or vice versa.

## Assets

Binary media does **not** go in the repository. The pilot unit alone is ~29 MB (a 3.5 MB workbook PDF, 47 mp3 files, plus key and transcript PDFs); a book is ~6 units, and this platform expects many books and levels.

- Media is served from the existing PHP shared host behind a single **`ASSET_BASE_URL`** constant — see ADR-0043. No CDN or object-storage service exists in this project today, and none is being introduced here.
- Content files store **relative asset keys** (`u06/B/t2.mp3`), never absolute URLs, so the base can change without touching content.
- Stimulus images are extracted from the workbook PDF at 2–3× and re-encoded; audio is re-encoded once.
- The **vision** path already exists for pages whose content is embedded in images: `POST /vision` (`zerotohero-python-server/routes/core.py:124–150`), with `IMAGE_OCR_PROMPT` in `packages/shared/src/markdown/vision.ts` and a working caller for PDF pages (`apps/web/src/lib/pdf-book.ts:143 pdfPageToMarkdown`). Extraction reuses this rather than building new tooling.

### Do not bundle content as a generated TS module

`packages/shared/src/docs.ts` is a **2.1 MB / 28,481-line tracked generated file** reachable from the shared barrel that both apps import. Textbook content must not repeat that mistake.

The pattern to imitate is `packages/shared/src/sample-content/loaders.ts`, which keeps one module per language behind a `Record<ContentL2, () => Promise<{ default: SampleContent }>>` lazy loader map with a runtime completeness guard, so each entry is a separate chunk fetched on demand on web. Applied to textbooks the axis is the unit rather than the language: one module per unit, behind a loader map keyed by book and unit, so opening one unit does not download the whole book.

## Routes

### Web

```
apps/web/src/app/[l1]/[l2]/textbook/
├── layout.tsx                      # textbook chrome (lesson nav, progress)
├── page.tsx                        # book → unit → lesson → task picker
└── [unitId]/[lessonId]/[taskId]/page.tsx
```

- `[l1]`/`[l2]` are validated by `apps/web/src/app/[l1]/[l2]/layout.tsx:24–29`.
- Register in the `Reading` group in `apps/web/src/components/layout/header.tsx:25–49`, with a new `title.textbook` key.
- Auth gating: add `textbook` to `AUTH_REQUIRED_SEGMENTS` in `apps/web/src/proxy.ts` if the pilot is Pro-only (ADR-0034); otherwise add it to `GUEST_NAV_FREE_SEGMENTS`.
- Note: the `/learn/:rest*` and `/learning-path` patterns are currently redirect targets away from the web app (`apps/web/src/lib/classic-route-redirect.ts:296,356–357`), so the textbook introduces its own `/textbook` path and leaves those redirects untouched.

### Mobile

```
apps/mobile/app/(tabs)/(reading)/textbook.tsx
apps/mobile/app/(tabs)/(reading)/textbook/[unitId]/[lessonId]/[taskId].tsx
```

- Register each screen in `apps/mobile/app/(tabs)/(reading)/_layout.tsx`.
- Add the entry to `apps/mobile/components/layout/NavBar.tsx` and `HamburgerDrawer.tsx`.

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
| `TextbookShell` | Book/unit/lesson navigation and task picker |
| `TaskShell` | Task number, type icon, audio, instructions, submit/reveal, result banner — the consistency anchor |
| `AudioPlayer` | Task audio: play/pause, scrub, replay, per-track selection |
| `BlankField` | The inline blank: `given` / `choose` / `type`, sized by `expectedLength` |
| `WordBank` | The option pool a `choose` blank draws from; dims consumed options when `allowReuse` is false |
| `PictureSet` | Lettered image grid referenced by blanks |
| `ImageMap` | Image with positioned pins, each holding a blank |
| `DataTable` | Tabular stimulus with optionally blank cells |
| `MockApp` | Data-driven app-screen stimulus (see below) |
| `InlineImageSlot` | In-passage image placeholder assigned a letter |
| `DialoguePassage` | Speaker-labelled L2 lines carrying inline blanks |
| `DictationField` | Boxed per-character entry for dictation tasks |
| `FreeWrite` | Ungraded writing surface |

### Reuse

- **`SpellCharInput`** already exists on **both** platforms (`apps/web/src/components/review/spell-char-input.tsx`, `apps/mobile/components/review/SpellCharInput.tsx`) and is exactly the boxed per-character control the dictation tasks need. Its props include `expectedLength` (drives box count), `firstCharPlaceholder` (type-over hint for the first box), `value`/`onChange`/`onSubmit`, and `disabled`. It is deliberately IME-safe: one real text field whose value is distributed one character per box, so pinyin composition is never broken. `DictationField` wraps it.
- **`scoreTestResult`** and the other pure helpers in `packages/utils/src/srs-test-mode.ts` (see Grading).
- **`TokenizedText`** itself, for all L2 text, with the `blank` format ranges.

## The Mock App Stimulus (B ➍)

B ➍ shows two screenshots of the Railway 12306 app and asks six questions derived entirely from the data visible in them (fastest train, cheapest, which are 复兴号, which are sold out, which have 商务座, which have sleepers).

Because the answers are *derived from the screen*, the stimulus is modelled as a **declarative dataset**, and both the rendered screen and the expected answers come from that single source:

```yaml
      - kind: mockApp
        app: railway-12306
        data:
          services:
            - { no: G871, from: 北京南, to: 杭州东, dep: "16:13", arr: "22:04", price: 630.5,
                classes: [二等, 一等, 商务], soldOut: false }
            - { no: K1275, from: 北京, to: 杭州, dep: "23:37", arr: "20:38", price: 189.5,
                classes: [硬座, 硬卧, 软卧], soldOut: false }
```

`MockApp` renders this through a small screen spec (tabs, filter chips, result rows, detail sheet). One renderer serves every future mock app; a second activity of this kind should cost near zero. The answers are validated against the dataset so the screen and the key cannot drift.

This is the highest-effort, lowest-reuse stimulus in the pilot and is scheduled last.

## Data Flow

1. Student opens `/[l1]/[l2]/textbook` → book index loads (units → lessons → tasks).
2. Student picks a task → task JSON loads, including precomputed `tokens` and resolved asset URLs.
3. `TaskShell` renders the stimulus (audio, picture set, table, map, mock app) and the passage/dialogue via `TokenizedText` with `blank` format ranges.
4. Student responds; each `BlankField` writes to its slice of the task store. The token tree never re-renders.
5. Student submits → `gradeTask` runs locally → per-blank correct/incorrect is shown → the attempt is persisted (ADR-0044).
6. Optional (not in this spec): incorrect blanks feed the SRS deck.

## States

- **Loading**: task skeleton with the passage as plain text; `TokenizedText` already falls back to plain text while tokenizing, but precomputed tokens make this near-instant.
- **Empty**: a unit with no tasks renders the lesson list only; a lesson with no tasks is not reachable.
- **Error**: a task whose audio or image fails to load still renders the text and blanks, with an inline retry on the failing stimulus — a broken asset must never block the exercise.
- **Offline**: text, blanks, and grading work from cached content; audio and uncached images degrade with an explicit notice. (Web has no client-side tokenizer, so precomputed tokens are what makes this possible.)
- **Already attempted**: show previous answers and result; offer "try again".
- **Submitted but incomplete**: submit is allowed; unanswered blanks are marked as such rather than silently graded wrong.
- **Autoplay blocked**: audio requires an explicit tap; never autoplay.
- **Edge cases**: audio-less task with `type: listening` (validator flag); a `choose` blank whose bank has one remaining option; `given` blanks excluded from scoring; a task with zero blanks (pure `freeWrite`); very long passages (chunked rendering / pagination reuse).

## Phasing

- **Phase 0 — the spine.** Content schema + compiler + validator; `packages/textbooks` (types, task store, grading, asset resolver); the `blank` format-range seam in `TokenizedText` on web and mobile; `extractBlankMarkers`; `BlankField` + `WordBank`; `TaskShell`; answer-key ingestion; `ASSET_BASE_URL`. Ship **one task end-to-end** — B ➋ is the recommendation (self-contained, global bank, exercises the highest-leverage primitive with no stimulus widget).
- **Phase 1 — stimulus widgets.** `AudioPlayer`, `PictureSet`, `DataTable`, `DialoguePassage`. Unlocks A ➋/➌, B ➊, C, D ➊.
- **Phase 2 — bespoke stimuli.** `ImageMap` (A ➊), `MockApp` (B ➍).
- **Phase 3 — writing lesson.** `DictationField` (wrapping `SpellCharInput`), `FreeWrite`, note-capture.
- **Deferred**: free-form **conversation** production and its scoring. Note that dialogue *cloze* (lesson C) is not deferred — it is the same blank primitive over a `dialogue` stimulus and lands in Phase 1.

Audio is a from-scratch build on both platforms: there is no audio-file playback path today (web's `playAudio` in `use-speech.ts` is dead code with no callsite, mobile has no `playAudio` at all, Flask has no audio route, and there are zero audio files in either app). Mobile also needs an audio dependency added — `expo-av`/`expo-audio` are not currently installed.

## Dependencies

- **ADR-0043** — asset hosting (`ASSET_BASE_URL`). Must be settled before any content file references an asset key.
- **ADR-0044** — exercise state model and attempt recording.
- **ADR-0041** — the `notes` inline seam this feature's `blank` seam mirrors.
- **ADR-0003** — UI not shared between web and mobile.
- **SPEC-066** — SRS review; source of the reusable pure grading/question helpers.
- **ADR-0034** — Pro gating and the SRS daily cap, if textbook progress feeds review.

## Related Data That Is Not a Dependency

The dictionary database contains a populated HSK curriculum index, `hsk_curriculum` (`zerotohero-python-server/import_dict_to_sqlite.py:166–174`), surfaced on every dictionary entry as `studyMaterials` (`utils_dictionary.py:617–628`; type `StudyMaterialCoverage` at `packages/shared/src/types.ts:359–370`) and already rendered in both apps.

It is **not** usable as a per-lesson vocabulary list, and this spec does not depend on it:

- `entry_id` is the `PRIMARY KEY` and the import is `INSERT OR IGNORE`, so a word appearing in multiple lessons stores only its first appearance — the table is lossy.
- There is no reverse "lesson → words" query, and the only index is on `entry_id`, so a `WHERE book=? AND lesson=?` lookup would need a new index.
- `lesson` is `TEXT` and not always numeric (it contains values such as `补充`).
- The row count documented in `docs/arch/004-python-dictionary-db-schema.md` (5,746) does not match the source CSV (5,462 data rows).

A future "words in this lesson" panel would require a migration (surrogate key or composite primary key). Out of scope here.

## Open Questions

1. **Instructions language.** Workbook instructions are L2 (Chinese). Should UI-level instructions be translated per L1 locale (via `translations.csv`), or remain L2 with the L2 text carrying ruby for support? Content-authored instructions are currently modelled as L2-only.
2. **Does textbook performance feed SRS?** Incorrect blanks could become saved words or review cards. This is attractive but is deliberately not in this spec; it needs its own decision on attribution and on the daily-cap interaction (ADR-0034).
3. **Attempt recording scope.** Answer-level history is greenfield — no answer/attempt/exercise table exists anywhere, and the only stored artefact today is a derived FSRS rating. ADR-0044 proposes the local-first model; whether answers ever sync server-side is left open.
4. **Multi-book catalogue.** The content model supports many books; the picker, level targeting (via the existing `SCALES` registry), and licensing are not addressed here.
5. **`expectedLength` semantics.** Confirm whether the workbook's small circled numerals above blanks are character-count hints before trusting them over `answer.length`.
6. **Pagination.** Long reading passages (B ➎, E ➌) may need the existing paginated reader. Whether to integrate it in this spec or defer is unresolved.
