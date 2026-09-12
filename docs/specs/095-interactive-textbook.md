# SPEC-095: Interactive Textbook

## Metadata

- **Spec ID**: SPEC-095
- **Feature**: Hierarchical interactive textbook (`book > unit > lesson > task`) — tokenized L2 text with inline interactive blanks, audio playback, and per-activity stimulus widgets
- **Status**: implemented (phases 0–3), with every requirement in this spec built — see
  [Known Gaps Against This Spec](#known-gaps-against-this-spec), which is where anything
  outstanding would be listed
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

| Task | Stimulus | Response | Answer source |
|---|---|---|---|
| **A ➊** | map of China | 10 blanks at city pins, 1 given | picture set A–J |
| **A ➋** | 7 transport announcements | 7 numbered blanks, 1 given | picture set A–G |
| **A ➌** | two 5-row tables (how they went, where they went) | 2 picture-letter blanks per row | picture sets A–E and a–e |
| **A ➍** | ➌'s five recordings, one per sub-item | 17 word blanks, 4 given | one combined bank |
| **B ➊** | train comparison table | 4 letter blanks, 2 given | bank a–f with descriptions |
| **B ➋** | comparison table + passage | 3 word blanks, 1 given | bank of 4 words |
| **B ➌** | two price tables + seat photographs | 4 questions, 1 given; ③ takes two picks | two seat-class banks |
| **B ➍** | the 12306 app as a mock app | 5 goals, 1 given | the app reports, the host grades |
| **B ➎** | 小红书 article | 6 illustration slots, 1 given | picture set A–F |
| **B ➏** | the same article | 6 text blanks, 1 given | statement bank A–G |
| **C ➊ / ➋** | 4 recordings + 4 photos | 3 numbered blanks each, 1 given | picture letters |
| **C ➌** | the booking recording | 3 comprehension questions | free text (the key prints model sentences) |
| **C ➍** | the same recording + its transcript | 4 word blanks, 1 given | bank A–E |
| **D ➊** | 6 recordings, one per paragraph | 8 word blanks, 1 given | one combined bank A–I |
| **D ➋** | the Vancouver recording | per topic, its order 1–5 **and** its description | number bank + description bank |
| **D ➌** | the same recording | 11 typed blanks, 1 given | typed |
| **D ➍** | the same recording + transcript | read along — no response | — |
| **D ➎** | the same recording | 5 note cards, 1 printed as a worked example | free text |
| **D ➏** | — | 5 note cards (a draft) | free text |
| **D ➐** | ➏'s draft, recalled | 1 self-check note; the recording is out of band | — |
| **E ➊ / ➋** | recordings + picture sets | boxed per-character dictation | typed, one box per character |
| **E ➌** | a model social-media post | read it — no response | — |
| **E ➍** | — | free writing (the model post is ➌'s) | — |

Every answer above is cross-checked against the printed key, and 19 of the 25 tasks carry
that key verbatim in `answerKeyRaw` — the validator proves the two agree blank by blank.

The other six are the tasks the key has nothing to grade in: D ➍, D ➎, D ➏, D ➐, E ➌ and
E ➍ are read-along, note-taking, drafting, self-check, reading a model and free writing.
C ➌ is the interesting case — its key *does* print answers, as model sentences rather
than fixed strings — so its three blanks are recorded and not scored rather than graded
against wording the student has no reason to reproduce.

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
book        tblt-hsk4                     Tasks for Life in China (HSK 4)
└─ unit     u06                           第六单元 交通出行
   └─ lesson   A                          六A 你是怎么去的
      └─ task    t4                      ➍ (listening, 12 blanks)
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

These are the members of the `Stimulus` union in `packages/textbooks/src/types.ts`. A task's `body` is an ordered list of them, rendered in that order by `TaskShell`.

| Kind | Used by | Notes |
|---|---|---|
| Kind | Used by | Notes |
|---|---|---|
| `passage` | A ➍, B ➋, B ➌, B ➎, B ➏, C ➌, D ➊, D ➌, D ➍, E ➌ | running L2 text carrying inline `{{bN}}` blanks |
| `dialogue` | C ➍ | speaker-labelled lines carrying inline blanks |
| `pictureSet` | A ➊, A ➋, A ➌, B ➎, C ➊, C ➋, E ➊, E ➋ | lettered image grid the blanks reference by letter |
| `imageMap` | A ➊ | image with positioned pins, each pin holding a blank |
| `dataTable` | A ➌, B ➊, B ➋, B ➌, D ➋ | tabular data; cells are L2 text and may carry blanks |
| `numberedBlanks` | A ➋, C ➊, C ➋ | a `① ___ ② ___` row, for tasks with no passage |
| `mockApp` | B ➍ | a self-contained HTML mock app, referenced by id; owns its own UI and goals (see below) |
| `dictation` | E ➊, E ➋ | numbered items typed into boxed per-character fields |
| `freeWrite` | D ➐, E ➍ | an open writing surface |
| `noteCards` | D ➎, D ➏ | titled note fields |
| `audio` | — | ad-hoc placement of recordings; see [Audio](#audio). No task needs it yet: every recording so far belongs to a task, an item or a block |
| `recall` | D ➐ | shows what the student wrote in an earlier task, read from the local store |

Most stimulus kinds may also carry `audio` for their own recording — a `passage` block, a
`dialogue`, a `dataTable` row, a map pin. See [Audio](#audio) for which level to use.

There is **no** `inlineImageSlot` stimulus kind, and none is needed: a `choose` blank
answering from a `pictureSet` renders as an illustration slot, showing the chosen picture
in the box the booklet prints. The interaction is the one A ➊ already uses — tap the slot,
then tap a picture — so this is a rendering variant of `BlankField`, not a kind of its
own.

### Response kinds

Two surfaces answer a task: inline **blanks**, and the free-text fields behind `freeWrite` / `noteCards`.

| Kind | Notes |
|---|---|
| `given` | worked example; pre-filled, non-editable, **not scored** |
| `choose` | pick one option — from a `Bank`, or from a `pictureSet` via `optionSet` |
| `type` | typed entry, boxed by `expectedLength` where the workbook prints boxes |
| `goal` | answered **inside a mock app**, never by a blank widget; the app reports an answer the host grades |
| `free` | free prose (notes, free writing); **recorded but never scored**. Carries `answer: ''` — the field is required for every kind, and "nothing to grade" is expressed by the kind, not by absence |

## Task Schema

A lesson is one TypeScript module under
`packages/textbooks/src/content/<book>/<unit>/`; a book is one module per lesson
plus a manifest. Content is plain data, typed by `types.ts` and checked by
`schema.ts` in tests and CI.

A restricted inline marker `{{bN}}` places a blank at an exact character offset in
the text.

### Why TypeScript and not YAML

The original design called for content authored as YAML and compiled to typed JSON.
It was changed to TypeScript modules for four reasons, in order of weight:

1. **No build step, so no generated artefact.** YAML needs parse → validate →
   compile, and the output has to live somewhere. This repo already has the
   cautionary example: `packages/shared/src/docs.ts` is a 2.1 MB tracked generated
   file (see [Do not bundle content as a generated TS module](#do-not-bundle-content-as-a-generated-ts-module)).
   TS modules *are* the typed data.
2. **Errors surface earlier.** A missing `id` or a bad `kind` is an editor squiggle
   and a CI type error. With YAML the first line of defence is runtime validation,
   which only runs if something remembers to run it.
3. **It matches the house pattern.** `packages/shared/src/sample-content/` is
   exactly "one TS module per key behind a lazy loader map", which this imitates.
4. **Both apps consume it directly** through that loader. A YAML route needs either
   build-time generation or a YAML parser shipped to both bundles.

**What this costs:** prose legibility. A Chinese passage needs string concatenation
to wrap, which is noisier than a YAML block scalar, and an author without a
TypeScript editor would struggle — which is exactly the reader YAML was aiming at.

**When to revisit:** when either a second book lands or a non-engineer starts
authoring — not on principle. The migration is cheap because the model is
format-agnostic: `types.ts`, `schema.ts`, `grading.ts` and every widget are
unaffected, since only the *authoring surface* moves. It would need a
`content:build` script plus a CI check that regeneration is a no-op, so the
generated module cannot drift from its source.

### A lesson

```ts
// packages/textbooks/src/content/tblt-hsk4/u06/lesson-b.ts
export const lessonB: LessonMeta = {
  id: 'B',
  letter: 'B',
  title: '开票一秒就空了',
  canDo: '能看懂关于交通出行内容的一般性介绍或短文故事。',
  tasks: [
    {
      id: 'tblt-hsk4.u06.B.t2',
      number: '➋',
      type: 'reading',
      sourcePage: 7,
      instructions: '看看上面的信息，然后用给出的选项在（　）中填入合适的词。',
      body: [
        { kind: 'dataTable', id: 't2-compare', columns: ['', '和谐号', '复兴号'], rows: [/* … */] },
        {
          kind: 'passage',
          text: '和谐号和复兴号的主要区别是，复兴号比较{{b1}}，比较{{b2}}，而且比较舒适。',
        },
      ],
      blanks: {
        b1: { id: 'b1', kind: 'given', answer: '快' },
        b2: { id: 'b2', kind: 'choose', answer: '新', bank: 'w1' },
      },
      banks: [{ id: 'w1', items: ['快', '免费Wi-Fi', '充电口', '新'], allowReuse: false }],
      // Kept verbatim from the printed key so the validator can prove agreement.
      answerKeyRaw: '② 新; ③ 免费Wi-Fi; ④ 充电口。',
    },
  ],
};
```

### Banks

Banks are an **array** keyed by `id`, not a map. An option may carry a label the
blank does not record — B ➊ prints each letter with a description, and the answer is
the letter alone:

```ts
banks: [
  {
    id: 'w1',
    items: ['a', 'b', 'c', 'd', 'e', 'f'],
    optionLabels: { a: '高速动车组列车', b: '动车组列车', c: '直达特快列车' },
    allowReuse: false,
  },
],
```

### Audio

A recording can be declared at three levels, depending on what it belongs to. All three
render through the same control, so a task that needs audio in one place and not another
pays nothing for the others.

| Level | Declared as | Rendered |
|---|---|---|
| **Per task** | `task.audio[]` | the task's audio row, above the stimulus |
| **Per item** | `audio` on the item | with that item, wherever it appears |
| **Ad-hoc** | an `audio` stimulus in `body` | wherever it is placed in the reading order |

`task.audio[]` is sugar for an `audio` block placed first: one rendering path, two ways
to declare it. The field exists so the common case — a listening task whose recordings
are a numbered set — always appears in the same position without each author placing it.

**Only one track plays at a time.** Letting a student start item 4 while item 2 is still
playing produces answers to the wrong question, so playback is owned by one provider per
task and shared by every control on the page.

**Never autoplays.** A browser blocks it anyway, and a task that starts speaking the
moment it opens is hostile in a classroom.

#### Per item

| Item | Field | Example |
|---|---|---|
| A numbered slot, or a dictation item | `BlankSpec.audio` | A ➋, C ➊/➋, E ➊/➋ |
| A table row | `TableRow.audio` | A ➌ |
| A passage or dialogue block | `PassageStimulus.audio` / `DialogueStimulus.audio` | D ➊, A ➍ |
| A map pin | `ImageMapPin.audio` | not used — A ➊ is task-level |

`audio` is an array everywhere, so an item may carry more than one recording.

D ➊ is the case that shows why a block is an item: six paragraphs, six recordings, nine
blanks, unevenly distributed (one, one, one, three, two, one). Each paragraph is its own
`passage` block carrying its own recording, so no paragraph structure is needed inside a
passage and no recording has to reference a blank:

```ts
body: [
  {
    kind: 'passage',
    audio: [{ key: 'tblt-hsk4/u06/六D ➊ 1.mp3' }],
    text: '现在好多地方的公共交通都需要先办卡，然后给里面（{{b1}}）。但是充得太多，钱剩下来了也挺浪费。',
  },
  {
    kind: 'passage',
    audio: [{ key: 'tblt-hsk4/u06/六D ➊ 4.mp3' }],
    text: '我去过一次东京。那儿的地铁和电车，哎呀，太（{{b4}}）了！完全不明白，一不小心就坐错。不过，日本的列车确实很（{{b5}}），而且不需要（{{b6}}），可以直接上车。',
  },
  // … four more
]
```

A table row is an item in the same sense, so A ➌ puts the speaker's recording on their
row. `rows` is therefore `TableRow[]`, not `string[][]`:

```ts
rows: [
  { cells: ['李婷婷', '{{b1}}', '{{b2}}'], audio: [{ key: 'tblt-hsk4/u06/六A ➌（1）卢沟桥.mp3' }] },
  { cells: ['金敏俊', '{{b3}}', '{{b4}}'], audio: [{ key: 'tblt-hsk4/u06/六A ➌（2）日本.mp3' }] },
]
```

#### Per task

A run of recordings for the task as a whole. A ➊ has nine, one per city, played from the
row while the student works on the map — nine controls on the pins would crowd a map that
already carries ten blanks, and the recordings name their city aloud, so a button needs no
label to be unambiguous:

```ts
audio: [
  { key: 'tblt-hsk4/u06/六A ➊ 上海.mp3', label: '上海' },
  { key: 'tblt-hsk4/u06/六A ➊ 北京.mp3', label: '北京' },
  // … seven more
],
```

It is also the level for a single recording that covers a whole task: C ➍ replays C ➌'s
audio, and B ➎ has one recording of its article read aloud.

#### Ad-hoc

For audio that belongs to neither the task nor an item, declare an `audio` block where it
should appear:

```ts
{ kind: 'audio', label: '听录音，回答问题。', tracks: [{ key: 'tblt-hsk4/u06/…mp3' }] }
```

`label` is optional and renders as a heading above the controls — useful when a recording
covers a long text and needs naming.

#### `AudioTrack`

```ts
interface AudioTrack {
  key: string;      // asset key
  label?: string;   // authoring metadata; also the control's accessible name
}
```

**`label` is never displayed as button text.** It identifies a track in the content file
and becomes the accessible name; the audio row shows `① ② ③` from each track's position
(`indexToCircled(index + 1)`) and an item's control is an icon. This is deliberate: in the
dictation tasks the label *is* the answer (`转机`, `门票`, `选择`), so displaying it would
give the exercise away.

### Blank variants worth showing

A typed blank with a length hint and accepted alternates. `expectedLength` is set
**only** where the workbook prints one box per character (dictation, E ➊/➋);
elsewhere it defaults to `answer.length` (see Schema rules #4):

```ts
b2: { id: 'b2', kind: 'type', answer: '商务座', accept: ['商务座'], expectedLength: 3 },
```

Options that come from a `pictureSet` rather than a bank, and the answer-key item
the blank is checked against — needed because one key item can cover several
blanks, as in A ➌:

```ts
b3: { id: 'b3', kind: 'choose', answer: 'C', optionSet: 'sights', keyIndex: 3, keyLabel: '③' },
```

### A mock-app task

The app is referenced by id and the task declares no blank answers — the app owns
its goals, and each goal links to the `goal` blank it answers:

```ts
{
  id: 'tblt-hsk4.u06.B.t4',
  number: '➍',
  type: 'reading',
  sourcePage: 9,
  instructions: '这个周末，你想从北京坐高铁去杭州玩。参照下面"铁路12306"APP 的截图，回答问题。',
  body: [
    {
      kind: 'mockApp',
      app: 'railway-12306',                           // → /mock-apps/railway-12306/index.html
      fallbackImage: 'tblt-hsk4/u06/b4-fallback.jpg', // workbook screenshot, if the frame fails
      goals: [/* … */],
    },
  ],
  // no `data:` — the app is self-contained; the host grades from the goal answers
}
```

### Asset keys

Content stores **relative keys**, never URLs: `<book>/<unit>/<file>`. Audio keeps
the workbook's own filename (`tblt-hsk4/u06/六A ➊ 上海.mp3`) so publishing is an
upload with **no rename step**; images are `<lesson><task>-<letter>.<ext>`
(`tblt-hsk4/u06/a2-c.jpg`). See [Assets](#assets).

### Schema rules

1. **Every *scored* blank has a resolution.** Either a non-empty `answer`, or `kind: given`. `free` blanks are the documented exception — recorded and never scored, so an empty `answer` is correct for them — and `given` blanks are excluded from scoring too. `goal` blanks are answered inside a mock app: they carry an answer for the host to grade, and the validator additionally requires each to be linked from a mock-app goal.
2. **`given` blanks are real.** The answer key deliberately omits blanks the workbook pre-fills (e.g. B ➊ prints `① a` and `② b` with no key entry). Modelled as `given` so the UI pre-fills them and the key parser does not report them missing.
3. **`allowReuse` is per bank and defaults to `false`.** It is a task-level fact, not a global rule. When false, each platform's `WordBank` dims options already used elsewhere in the task, so a student can see what is left; when true, an option may be picked any number of times. Every bank in the pilot unit sets it to `false`, and B ➊ is the case that shows why the flag has to exist at all: its six options map to six distinct answers (`③ f; ④ c; ⑤ e; ⑥ d`, with ① and ② pre-filled as `given`), so a bank *could* legitimately need reuse in another task and the behaviour must not be hard-coded.
4. **`expectedLength` defaults to `answer.length`**, and is set explicitly only for the dictation tasks (E ➊ / ➋), where the workbook prints one box per expected character.
   Circled numerals (①②③) are **question indices** — the numbering the answer key uses, so a student can find the corresponding answer — and carry no length information. Blank ids mirror them (`b1` ↔ ①) because they share that indexing role.
5. **`accept[]`** lists additional correct surface forms (see Grading).
6. **`sourcePage`** is mandatory where the task was transcribed from the workbook, so a reviewer can audit any task against the print original.
7. **A `mockApp` stimulus carries no `data:` and no blank answers of its own.** Its dataset, goals and expected answers live inside the app's HTML (see [The Mock App Stimulus](#the-mock-app-stimulus)). The app derives its expected answers from its own dataset with the same predicates its goals use, and `mock-app-files.test.ts` compares them against the content's answer key — the frame cannot execute the app's JS, but a test can.

### Instructions

Task instructions are **L2 text, rendered as tokenized text** — not plain strings.
This is deliberate: instructions are the first thing a student reads, so they must
carry ruby and must be tappable for a definition like any other L2 text.

```ts
instructions: '看看上面的信息，然后用给出的选项在（　）中填入合适的词。',
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

## Tokenization: Runtime, Per Surface

Both apps obtain tokens from Flask — `POST /lemmatize-normalized` (`zerotohero-python-server/routes/text_routes.py:184`) and `POST /lemmatize-normalized/batch` (`:219`), the latter reached on web via `enqueueLemmatize` (`apps/web/src/lib/lemmatize-queue.ts:36`, batch size 12 / 60 ms flush, cache key `${l2Code}:${text}`).

**Nothing is tokenized at authoring time.** Content files store text only — no token blobs, no build step, and nothing to keep in sync when a passage is edited or re-transcribed.

**Each text surface tokenizes itself.** `TokenizedText` requests its text through the batched queue and renders when it arrives; `TaskShell` takes no part. The queue's shared cache and 60 ms flush coalesce a task's texts into one round-trip anyway, so a task does not make one request per surface — and no component has to know what its siblings render.

`TaskShell` deliberately does **not** own lemmatization. A parent authority would have to enumerate every text in a task — passages, dialogue lines, every table cell, note-card titles — so adding a widget that renders text would mean changing the shell. The `tokens` prop and `deferTokenization` remain available for a parent that genuinely needs to own it, which is how the paginated readers work: there the page's lines must resolve together, whereas a task's surfaces are independent.

While tokens load, a surface renders its plain-text fallback: the text, with any `{{bN}}` markers stripped, so a passage carrying blanks shows as running text and the blanks appear when the tokens land. That is accepted rather than hidden behind a skeleton — the window is one batch flush, the text is real L2 the student can start reading, and a skeleton would trade a brief reflow for a delay before anything is readable.

Consequences to accept:

- **Web needs the server in order to tokenize.** Web has no client-side tokenizer at all — no kuromoji/jieba/snowball dependency exists in `apps/web`. Mobile degrades better: it has a Chinese offline path (`zh: { needsDictSegmentation: true }`, `packages/shared/src/constants.ts:337`, implemented as jieba-compatible max-matching over the downloaded dictionary's headword set in `apps/mobile/lib/tokenizer.ts:265`).
- This costs little in practice, because a task already needs the network for its audio and images (ADR-0043). The textbook is **online-first by construction** — tokenization is not the only thing that would fail offline.
- A task's passage is short (a few sentences), so it resolves in a single batch flush rather than a per-line storm.

## Grading

The answer key is machine-structured and already states which blanks exist in which task (e.g. `B课 ➊: ③ f; ④ c; ⑤ e; ⑥ d.`). It is ingested into the `answer` field of each blank, and its omissions are how `given` blanks are detected.

Grading runs **locally on submit** (no server round-trip required to show correctness).

Normalization rules:

1. Trim whitespace; strip surrounding punctuation and full-width/half-width variants.
2. Accept listed alternates in `accept[]`.
3. Accept traditional/simplified equivalence — a student typing 車 for 车 must be correct. Each app expands `accept[]` with its lazy-loaded OpenCC converter when a task's L2 is `zh` (`expandAcceptedVariants`), so the comparison stays a pure string check. The srs-test-mode helpers originally named here, `scriptVariants` / `bestScriptSimilarity`, do not handle Chinese at all — `scriptVariants` returns `[text]` unchanged for `zh` — which is why this expands the answer instead.
4. Choice blanks compare option identity, not free text.

Reusable pure-TS helpers (platform-agnostic, already shared by both apps):

| Need | Helper | Lives in |
|---|---|---|
| Score correct/total/time → rating band | `scoreTestResult` (`:108`) | `packages/utils/src/srs-test-mode.ts` |
| Traditional/simplified acceptance | `expandAcceptedVariants` — pure, takes a converter; both apps pass OpenCC's `toTraditional` | `packages/textbooks/src/grading.ts` |
| Cloze text derivation | `spellBlankText`, `spellSurfaceInContext` | `packages/utils/src/srs-test-mode.ts` |
| Boxed per-character entry for dictation | spell-mode box sizing driven by `expectedLength` | `packages/utils/src/srs-test-mode.ts` |

`expandAcceptedVariants` had to be written rather than reused: the srs-test-mode pair it
replaces does not handle Chinese (see normalization rule 3). It is called once per task,
in each app's task provider, before the response store is built.

`scoreTestResult` is reused for its scoring shape, not to connect textbook results to the review deck — **textbook performance does not feed SRS** (see Non-Goals).

## Authoring-Time Validation

`validateBook` (`packages/textbooks/src/schema.ts`) runs over every content file in
tests and CI. It is pure TS, so it can check the content model exhaustively but
cannot read the filesystem or execute an app's JS — which is the line the two lists
below fall either side of.

**Enforced today:**

- a scored blank with neither `answer` nor `kind: given` (`free` blanks are exempt — they are never scored);
- a `choose` blank referencing a `bank` or `optionSet` that does not exist;
- a bank option never referenced, or a `choose` answer absent from its bank;
- `expectedLength` inconsistent with `answer.length` where both are set;
- any asset reference — text, picture, map image, or a recording declared at **any** level (task, item, row, block, or an `audio` block) — with no corresponding entry in the manifest;
- a blank carrying `audio` that lives in a `passage` or `dialogue`, where the block owns the recording rather than the blank;
- each pick of a `multiple` blank being an option of its bank, with the key compared as a set so `硬卧和软卧` and `硬卧、软卧` agree;
- a task missing `sourcePage` (transcription provenance);
- a `{{bN}}` marker in text with no matching entry in `blanks`, or vice versa;
- a `mockApp` goal referencing a missing blank, a duplicate goal id, or a `goal` blank no goal links to;
- a `recall` pointing at a task the book does not have — a wrong id renders nothing at all, silently.

**Enforced by `mock-app-files.test.ts`** — these need to read
`apps/web/public/mock-apps/`, which the pure validator cannot, so they live in a test
with filesystem access:

- a `mockApp` stimulus whose `app` id has no HTML file at `/mock-apps/<id>/index.html`;
- a `mockApp` app that does not declare the id the content references;
- a `mockApp` app missing the goals the content links to, or declaring goals no blank can grade (both directions, with a positive control on the parse);
- a `mockApp` app loading a runtime whose major version the frame cannot speak, or a third-party library that is not on the pinned allowlist;
- a `mockApp` app whose declared expected answers disagree with the task's answers — the app derives them from its own dataset with the same predicates its goals use, so an edit that changes an answer without the content following fails here. It found two real defects on its first run (see below).

## Assets

Binary media does **not** go in the repository. The pilot unit alone is ~31 MB once extracted (25 MB of audio, 6 MB of images); a book is ~6 units, and this platform expects many books and levels.

- Media is served from the existing PHP shared host behind a single **`ASSET_BASE_URL`** constant — see ADR-0043. No CDN or object-storage service exists in this project today, and none is being introduced here.
- Content files store **relative asset keys** (`tblt-hsk4/u06/a1-map.png`), never absolute URLs, so the base can change without touching content.
- The **vision** path already exists for pages whose content is embedded in images: `POST /vision` (`zerotohero-python-server/routes/core.py:124–150`), with `IMAGE_OCR_PROMPT` in `packages/shared/src/markdown/vision.ts` and a working caller for PDF pages (`apps/web/src/lib/pdf-book.ts:143 pdfPageToMarkdown`). Extraction reuses this rather than building new tooling.

### Where media lives, and the one step to publish it

```
local:   <Dropbox>/Work/Language Player/zerotohero-server-data/interactive-textbook/
server:  dh_5rvnrz@server.chinesezerotohero.com:/home/dh_5rvnrz/zerotohero-server-data/interactive-textbook
public:  https://server.chinesezerotohero.com/data/interactive-textbook/
```

That directory is the shared host's `data/` root — its siblings are served at `data/char-stroke-svgs/` and `data/word-images/` (`zerotohero-nuxt/lib/utils/servers.js:38-39`) — so its contents are public under `/data/` unchanged.

The layout mirrors the keys exactly: `<book>/<unit>/<file>`. Audio keys are the workbook's own filenames, so publishing is a straight upload with **no rename step**, and each key stays traceable to the file it came from.

```bash
rsync -avz --progress \
  "$HOME/Dropbox/Work/Language Player/zerotohero-server-data/interactive-textbook/" \
  dh_5rvnrz@server.chinesezerotohero.com:/home/dh_5rvnrz/zerotohero-server-data/interactive-textbook/
```

**Uploading is the only step.** `ASSET_BASE_URL` already points at the public URL, in **development and production alike** — there is no sync step, no symlink and no local copy to keep in step, so media goes live the moment the bytes land.

There is deliberately **no local-path default.** One was tried and removed: it pointed at a path nothing served, which is worse than no default, because the app then looks configured while silently degrading to the placeholder fallbacks. For offline work, or to check a re-extraction before uploading, override it:

```bash
NEXT_PUBLIC_ASSET_URL=http://localhost:8000 npm run dev -w apps/web
EXPO_PUBLIC_ASSET_URL=http://localhost:8000 npx expo start
# from the folder above: python3.10 -m http.server 8000   (serves the keys unchanged)
```

The URL is defined **once**, as `DEFAULT_TEXTBOOK_ASSET_BASE_URL` in `packages/textbooks/src/assets.ts`; each app's `lib/asset-url.ts` only adds its own env read. ADR-0043's "one constant per app" is about the per-app export, which is unchanged — the point of sharing the value is that the two apps **did** drift once (web defaulted to a local path, mobile to a folder that does not exist), and a shared literal plus a test makes that impossible again.

### Formats and manifest validation

The extension follows whichever encoding is actually smaller for that image, measured rather than assumed: **JPEG for pictures** (PNG came out 5–7× larger for all 45 picture assets, including the cartoon sets that look flat) and **PNG only for the flat vector map**.

`assets.ts` in the book's content directory is the **authored** manifest of every key a task needs, and it is authored rather than derived precisely so that it *can* disagree with the content: a test asserts agreement **in both directions** — no content reference to an unpublished asset, and no declared asset that nothing references. Every key a task references is declared, and the test also proves the reverse — that nothing is declared without a task using it.

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
├── layout.tsx                                                       # page padding only
├── page.tsx                                                         # textbook picker
└── [bookId]/
    ├── layout.tsx                                                   # TOC sidebar (docs-style) + main pane
    ├── page.tsx                                                     # book overview / "pick a task" empty state
    └── [unitId]/[lessonId]/[taskId]/page.tsx                        # the task
```

The TOC lives on the `[bookId]` layout rather than the top `tasks` layout, because it
needs the book to build the tree — and the picker at `tasks/page.tsx` must render
**without** a sidebar. Putting it on the `tasks` layout would have shown the picker
inside a TOC it has not chosen yet.

The route is `tasks` to match the menu item. It is a deliberate, small naming choice — if the menu item is renamed, the path should be renamed with it.

- `[l1]`/`[l2]` are validated by `apps/web/src/app/[l1]/[l2]/layout.tsx:24–29`.
- The `Vocab` group label is `Study`, with `{ key: 'title.tasks', href: 'tasks' }` below `review` in `apps/web/src/components/layout/header.tsx`.
- Auth gating: add `tasks` to `AUTH_REQUIRED_SEGMENTS` in `apps/web/src/proxy.ts` if the pilot is Pro-only (ADR-0034); otherwise add it to `GUEST_NAV_FREE_SEGMENTS`. **Not decided yet** — `tasks` is currently in neither list.
- Note: the `/learn/:rest*` and `/learning-path` patterns are currently redirect targets away from the web app (`apps/web/src/lib/classic-route-redirect.ts:296,356–357`), so this feature introduces its own `tasks` path and leaves those redirects untouched.

### Mobile

```
apps/mobile/app/(tabs)/(vocab)/_layout.tsx
apps/mobile/app/(tabs)/(vocab)/tasks/index.tsx                                  # textbook picker
apps/mobile/app/(tabs)/(vocab)/tasks/[bookId]/index.tsx                         # TOC (units → lessons → tasks)
apps/mobile/app/(tabs)/(vocab)/tasks/[bookId]/[unitId]/[lessonId]/[taskId].tsx  # the task
```

Mobile carries `bookId` in the path, matching web, so a shared URL maps to the same
screen on both. The TOC is a screen of its own rather than a sidebar, because a phone
has no room for a persistent sidebar beside the task.

- `Tasks` extends the existing `(vocab)` route group — **no new `Stack.Screen`** is required in `apps/mobile/app/(tabs)/_layout.tsx`, and the directory is **not** renamed (see "Mobile route group" above).
- Screens are registered as-is by the existing `(vocab)` stack; there is no per-screen config to add.
- Rename the group label to `Study` and add the `Tasks` link below `review` in **both** `apps/mobile/components/layout/NavBar.tsx` (`NAV_GROUPS`, tablets/MD) and `HamburgerDrawer.tsx` (phones), with an `sf` symbol and a `NAV_ICONS` entry in each.
- **Not a bottom tab.** The mobile app has no bottom tab bar: `apps/mobile/app/(tabs)/_layout.tsx` renders a `Stack` despite the directory name, and navigation is the top `Header` plus those two menus. `Tasks` follows the existing pattern rather than introducing a new navigation shell.

### Initial L2 scope

Chinese only (`l2 = zh`). The model is language-agnostic, but the pilot corpus, the answer key, and the ruby/pinyin rendering are all Chinese. Non-Chinese books must not be advertised until a second corpus exists.

## Components

Per ADR-0003, UI components are **not shared** between web and mobile; logic and types are. Each component below exists twice (web + mobile), backed by pure-TS logic in `packages/textbooks`.

### Shared logic (`packages/textbooks`, pure TS)

- **Schema + types** — task/blank/bank/stimulus types, plus the validator (`validateBook`) and the loader map. **Not** a YAML→JSON compiler: see [Task Schema](#task-schema) for why content is TypeScript.
- **`gradeTask(task, responses)`** — normalisation and alternate acceptance. Script-variant matching is *not* in here: `expandAcceptedVariants` runs first, in the app, and adds the converted form to each blank's `accept[]` so grading itself stays a pure string comparison (and works offline, which matters on mobile).
- **Task store** — per-task, per-blank response state with subscribe/select, so blank components re-render independently of the token tree.
- **Attempt persistence** — per-task attempts in local storage (ADR-0044).
- **Progress** — `bookProgress` / `summarizeProgress` roll the saved per-task attempts up through the book's own hierarchy, without a second store: the picker shows `complete/total`, each lesson a count, and each task a tick or a dot. The latest un-voided attempt is the one that counts, so a student who got it wrong and then right has completed it.
- **Asset resolver** — relative key → absolute URL via `ASSET_BASE_URL`, plus the shared default base URL constant.
- **`assetKeysIn(task)`** — every asset key a task references, wherever it is declared (task, blank, table row, block, map pin, bank option, mock-app fallback), each with the location that declared it. The validator and the manifest test both call it, so a new declaration point cannot make the two disagree.
- **Grading helpers** — `normalizeAnswer`, `acceptedAnswers`, `isBlankCorrect` (set comparison for `multiple`), `isBlankScoreable`, `expandAcceptedVariants`.
- **Answer-key parsing** — `parseAnswerKey` for the three flat shapes, `parseGroupedAnswerKey` for A ➍'s nested one (its sub-items each restart at ①), and `parseLabelledAnswerKey` for A ➊'s label-keyed map.

### Views (paired)

| Component | Responsibility |
|---|---|
| `TextbookPicker` | Entry screen: choose a textbook (single item today) |
| `TextbookToc` | Docs-style collapsible TOC of units → lessons → tasks; current lesson expanded |
| `TaskShell` | Task number, type icon, audio, L2 tokenized instructions (+ machine-translated L1 when enabled), submit/reveal, result banner — the consistency anchor. **Also the task context provider**: `TaskProvider` wraps it so blanks read state without a prop (see the mobile re-render boundary) |
| `TaskAudioProvider` | Owns the task's single player and active track, so every control shares it and only one track plays at a time |
| `AudioPlayer` | A set of recordings as a row: play/pause, per-track selection, and a transport — scrub bar with elapsed time and replay on web, ±10 s steppers and replay on mobile (React Native has no range input) |
| `InlineTrackButton` | The compact play/pause control an item renders beside itself. Renders nothing when the item has no recording, so a widget can place it unconditionally |
| `RecallCard` | Renders another task's saved answers, read from the local store (ADR-0044) |
| `BlankField` | The inline blank: `given` / `choose` / `type` / `free`, sized by `expectedLength`. A `goal` blank never renders a widget — it is filled by a mock app |
| `WordBank` | The option pool a `choose` blank draws from; dims consumed options when `allowReuse` is false |
| `PictureSet` | Lettered image grid referenced by blanks |
| `ImageMap` | Image with positioned pins, each holding a blank |
| `DataTable` | Tabular stimulus with optionally blank cells |
| `MockAppFrame` | Host frame + bridge for a self-contained mock-app HTML file (see below) |
| `InlineImageSlot` | In-passage illustration slot: a `choose` blank answering from a `pictureSet` renders here, showing the chosen picture. Rendered by `BlankField` rather than by `TaskStimulus`, since it sits inside running text |
| `DialoguePassage` | Speaker-labelled L2 lines carrying inline blanks |
| `NumberedBlanks` | A `① ___ ② ___` row for tasks whose answers have no surrounding passage (A ➋, C ➊/➋) |
| `DictationField` | Boxed per-character entry for dictation tasks |
| `FreeWrite` | Ungraded writing surface |
| `NoteCards` | Titled note fields (D ➏). Lives in `free-write.tsx` and is exported from it |
| `useInstructionTranslation` (hook, not a component) | Machine-translates the L2 instructions for the L1 line under them; gated by `display.translation` |

`MockAppFrame` is the one component whose payload is **not** authored in the task schema — a mock app is its own HTML file behind a frozen bridge contract (see "The Mock App Stimulus").

### Reuse

- **`SpellCharInput`** already exists on **both** platforms (`apps/web/src/components/review/spell-char-input.tsx`, `apps/mobile/components/review/SpellCharInput.tsx`) and is exactly the boxed per-character control the dictation tasks need. Its props include `expectedLength` (drives box count), `firstCharPlaceholder` (type-over hint for the first box), `value`/`onChange`/`onSubmit`, and `disabled`. It is deliberately IME-safe: one real text field whose value is distributed one character per box, so pinyin composition is never broken. `DictationField` wraps it.
- **`scoreTestResult`** and the other pure helpers in `packages/utils/src/srs-test-mode.ts` (see Grading).
- **`TokenizedText`** itself, for all L2 text, carrying the inline blank seam (marker + offset, not a `FormatRange` — see Inline Blanks).
- **`blank-picker`** — the shareable core of "which blank is the student editing, and what did they pick from the popover". It is a hook plus helpers with no view in it, so web and mobile each render their own popover over it (`apps/web/src/components/textbook/blank-picker.ts`, `apps/mobile/components/textbook/blank-picker.ts`). This is the ADR-0003 split applied inside the feature.

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
2. Student picks a task → task data loads and asset URLs resolve. Each text surface requests its own tokens through the batched queue and renders its plain-text fallback until they arrive.
3. `TaskShell` renders the stimulus (audio, picture set, table, map, mock app) and the passage/dialogue via `TokenizedText`'s inline blank seam. For a `mockApp`, this means mounting `MockAppFrame` and waiting for the app's `ready` handshake.
4. Student responds. Two shapes, one store:
   - **Blank tasks** — each `BlankField` writes to its slice of the task store. The token tree never re-renders.
   - **Mock-app tasks** — the app owns its own state; `TaskShell` renders goal progress from the app's `progress` messages and the host chrome (help mode, hint) forwards over the bridge.
5. The attempt resolves — by explicit submit for blank tasks, or by the app reporting `complete` for goal-based ones. `gradeTask` runs locally wherever there are blanks; the app's declared answers cover the goal case. Correct/incorrect is shown and the attempt is persisted locally (ADR-0044).

## States

- **Loading**: each text surface shows its plain-text fallback until its own tokens resolve, then re-renders with readings and blanks — see [Tokenization](#tokenization-runtime-per-surface).
- **Empty**: a unit with no tasks renders the lesson list only; a lesson with no tasks is not reachable.
- **Error**: a task whose audio or image fails to load still renders the text and blanks — a broken asset must never block the exercise. Pictures degrade to a labelled placeholder and a broken mock app falls back to the workbook screenshot. An **inline retry** on the failing stimulus clears the failure and re-requests it: pictures by bumping a cache-busting query, a mock app by remounting its frame, a recording by re-selecting the track. A `mockApp` that fails to load, errors, or never completes its `ready` handshake degrades to its fallback image (the original workbook screenshot) so the task stays answerable in `TaskShell`.
- **Offline**: **a task cannot be tokenized on web without the server** — there is no client-side tokenizer in `apps/web` — and its audio and images are remote in any case (ADR-0043). The textbook is therefore online-first, and offline is a **degradation, not a mode**: a previously-loaded task's saved answers remain readable and resumable from the local store (ADR-0044), and mobile renders tokenized text offline for Chinese via its dict-segmentation fallback. Media that fails to load degrades with an explicit notice rather than blocking the exercise.
- **Already attempted**: show previous answers and result; offer "try again".
- **Submitted but incomplete**: submit is allowed; unanswered blanks are marked as such rather than silently graded wrong.
- **Autoplay blocked**: audio requires an explicit tap; never autoplay.
- **Edge cases**: audio-less task with `type: listening` (validator flag); a `choose` blank whose bank has one remaining option; `given` blanks excluded from scoring; a task with zero blanks (pure `freeWrite`); a `mockApp` with no goals (pure stimulus — showing a submit/completion affordance would be wrong); a `mockApp` whose bridge major version the frame cannot speak (refuse, fall back to the image); a very long passage (continuous scroll — no pagination, see Non-Goals).

## Phasing

> **Implementation status.** Phases 0–3 are implemented, and **all 25 tasks of unit 6
> are authored** — A ➊–➍, B ➊–➏, C ➊–➍, D ➊–➐, E ➊–➍. Every answer is
> cross-checked against the printed key, and `validateBook` reports no errors.
>
> **Media is published and live.** All 107 keys the content needs — 47 audio and
> 60 images, 31 MB — are staged in the server data folder and uploaded to the shared host;
> every one was verified returning HTTP 200, including the percent-encoded workbook
> audio filenames. `ASSET_BASE_URL` already points there, so no further step was
> needed once the bytes landed.
>
> **Not yet verified:** nothing in this feature has been rendered in a browser or a
> simulator. Types, content validation and asset delivery are checked; pixels and
> audio playback are not. Mobile audio and the mobile mock-app frame specifically
> need a device or simulator.
>
> **No behavioural gaps remain** — see [Known Gaps Against This Spec](#known-gaps-against-this-spec).

- **Phase 0 — the spine.** Content schema + validator; `packages/textbooks` (types, task store, grading, asset resolver); the inline blank seam in `TokenizedText` on web and mobile (`extractInlineMarkers`, which extracts blanks and notes in one pass; `extractBlankMarkers` is the blank-only helper); `BlankField` + `WordBank`; `TaskShell` with **L2 tokenized instructions** and machine-translated L1; the **`Vocab` → `Study` rename** plus the `Tasks` nav entry on both platforms, `TextbookPicker` and `TextbookToc`; answer-key ingestion; `ASSET_BASE_URL`. Ship **one task end-to-end** — B ➋ is the recommendation (self-contained, global bank, exercises the highest-leverage primitive with no stimulus widget).
  **Withdrawn from this phase:** parent-owned tokenization with hold-until-ready. Each surface tokenizes itself and renders its plain-text fallback while loading; the batching queue already coalesces a task's texts. See [Tokenization](#tokenization-runtime-per-surface).
- **Phase 1 — stimulus widgets.** `AudioPlayer`, `PictureSet`, `DataTable`, `DialoguePassage`. Unlocks A ➋/➌, B ➊, C, D ➊.
- **Phase 2 — bespoke stimuli.** `ImageMap` (A ➊), then `MockAppFrame` + `mock-app-runtime.js` + a "hello world" mock app to prove the per-app floor (B ➍).
- **Phase 3 — writing lesson.** `DictationField` (wrapping `SpellCharInput`), `FreeWrite`, note-capture.
- **Deferred**: free-form **conversation** production and its scoring. Note that dialogue *cloze* (lesson C) is not deferred — it is the same blank primitive over a `dialogue` stimulus and lands in Phase 1.

Audio was a from-scratch build: there was no audio-file playback path on either platform (web's `playAudio` in `use-speech.ts` is dead code with no callsite, mobile had no `playAudio` at all, Flask has no audio route, and there were zero audio files in either app). The web player is new. **Mobile deliberately did not add a dependency**: it plays through `expo-video`, which was already a dependency and already linked natively, avoiding a new development build. `expo-audio` is the better long-term home for audio-only playback; switching to it is a small, contained change (see `AudioPlayer.tsx`).

## Dependencies

- **ADR-0043** — asset hosting (`ASSET_BASE_URL`). Must be settled before any content file references an asset key.
- **ADR-0044** — exercise state model and attempt recording.
- **ADR-0041** — the `notes` inline seam this feature's `blank` seam mirrors.
- **ADR-0045** — mock apps as sandboxed, self-contained HTML behind a frozen bridge; supplies the bridge contract, the sandbox and hosting rules, and the design-token carve-out.
- **ADR-0003** — UI not shared between web and mobile.
- **SPEC-066** — SRS review; source of `scoreTestResult` and the spell-mode box-sizing helpers. Reuse is one-directional: textbook results do not feed the deck (see Non-Goals). Note the other helper it suggested for script-variant acceptance, `scriptVariants`, does not handle Chinese and was replaced — see Grading.
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

## Known Gaps Against This Spec

**None.** Every requirement this spec states is implemented, and the two pieces of
behaviour it previously listed as outstanding have been either built or removed by
decision rather than left ambiguous: `InlineImageSlot` is rendered, the mock app's dataset
agrees with the printed key, and the hold-until-ready requirement was withdrawn in favour
of the plain-text fallback described under Tokenization.

What is deliberately not built is in [Non-Goals](#non-goals) — conversation production and
scoring, SRS integration, server-side state, pagination, an authoring UI — and what is
unsettled is in [Open Questions](#open-questions).

### Verified, not assumed

Stated so the gaps are not read as a general disclaimer: the answer key is
machine-checked against every authored answer in the 19 tasks that have one;
`validateBook` reports no errors over the whole unit; every asset key the content
references is declared in the manifest and present on disk; 1016 tests pass and `tsc` is
clean for web, mobile, textbooks and utils. The 85 keys published during the pilot were
each verified returning HTTP 200 from the shared host, including percent-encoded
workbook audio filenames.

A task with nothing to grade (D ➎ ➏ ➐, E ➍) reports *Saved* rather than `0 / 0`, so
self-completed work is not presented as a failure. D ➐ is completed by the student: they
say the draft aloud themselves and write what to improve, since neither app captures
audio.

The mock-app answer check found two real defects the moment it ran, both now fixed: G871
was flagged 复兴号 though its row carries no such tag, and D11 was missing from the
dataset entirely. The sleeper question also needed a fact the dataset did not model — it
asks for berths that are *not* 候补, so `sleeper` (the 铺 badge) and `sleeperAvailable`
(what the question asks) are now separate fields; Z281 and K1275 show the badge with
waitlisted berths and so do not answer the question.

The most significant thing that has **not** been verified is anything visual — no page
of this feature has been rendered in a browser or simulator. Types, content validation
and asset delivery are checked; pixels and audio playback are not.

