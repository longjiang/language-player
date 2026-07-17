# Feature Specification: Translation

## Metadata
- **Spec ID**: SPEC-006
- **Feature**: Text translation (subtitles, reader, action menu)
- **Status**: draft
- **Created**: 2026-07-17
- **ROADMAP Phase**: Phase 4 (Reader + Dictionary)

## Overview

Translation converts L2 (target language) text into the user's L1 (native language). It is used in three contexts: video subtitles (automatic, batch, progressive), the reader (automatic, batch, per page), and the text action menu (manual, single-block). All translation goes through the Python backend's LLM-powered endpoints.

## User Stories

- As a learner watching a video, I want L1 translations to appear below each subtitle line so I can understand unfamiliar words in context.
- As a learner reading an article, I want the entire page auto-translated so I can check my comprehension without clicking each block.
- As a learner, I want to translate a specific sentence or paragraph on demand from the action menu.

## API Endpoints

All translation requests go to the Python Flask backend (`PYTHON_API_URL`).

### `POST /translate_array` — Batch Translation

Translates an array of text strings. Used for subtitles and reader. The backend batches the LLM calls internally.

| | |
|---|---|
| **Method** | `POST` |
| **Body** | `{ "texts": string[], "l1": string, "l2": string }` |
| **Response** | `{ "translated_texts": string[] }` — same length and order as input |
| **Used by** | `useSubtitleTranslation`, `useReaderTranslation` |

### `POST /translate` — Single Translation

Translates a single text string. Used by the text action menu. The backend calls an LLM internally.

| | |
|---|---|
| **Method** | `POST` |
| **Body** | `{ "text": string, "l1": string, "l2": string }` |
| **Response** | `{ "translated_text": string }` |
| **Used by** | `TextActionMenu.handleTranslate()` |

### `GET /translate` — Single Translation (GET variant)

Same as POST but uses query parameters. Used by the `translateText()` utility for page metadata (titles, descriptions).

| | |
|---|---|
| **Method** | `GET` |
| **Query** | `?text=...&l1=...&l2=...` |
| **Response** | `{ "translated_text": string }` |
| **Used by** | `lib/translate.ts` → TV show detail, video watch page metadata |

## Implementation (Next.js Web)

### 1. Subtitle Translation — Automatic, Progressive, Chunked

**Hook**: `hooks/use-subtitle-translation.ts`

```
useSubtitleTranslation(l2Lines, l1, l2, enabled)
  → { translatedLines, loading, progress }
```

**Behavior**:
- Triggered when `enabled` is true (user toggle in subtitle settings)
- Splits all L2 subtitle lines into chunks of 5
- Calls `POST /translate_array` for each chunk sequentially
- Updates `translatedLines` progressively — translations appear chunk by chunk
- Aborts previous translation via `AbortController` when props change (new video, language switch)
- Returns `progress` (0 to total line count) for a progress indicator

**Display** (`SubtitleDisplay` component):
- When `showTranslation` setting is enabled, each subtitle line renders with its L1 translation below
- Translation lines share the same `starttime` as their L2 source line
- Toggle via Settings page → Display tab → "Show Translation"

### 2. Reader Translation — Automatic, Batch, Per Page

**Hook**: `hooks/use-reader-translation.ts` (to be created)

```
useReaderTranslation(blocks, l1, l2, enabled)
  → { translatedBlocks: Map<number, string>, loading, progress }
```

**Behavior**:
- Triggered when `showTranslation` is toggled on in the reader toolbar
- Collects all `TextBlock` text strings from parsed markdown blocks
- Calls `POST /translate_array` with all block texts in chunks of 5
- Maps translations back to block indices
- `MarkdownBlock` elements (tables, code blocks, standalone images) are NOT translated — they're structural, not prose
- Aborts previous translation when text changes (edit → re-tokenize → re-translate)

**Display** (Reader page):
- When translation toggle is active, each text block renders its L1 translation below the L2 tokenized text
- Translation appears in a muted, smaller font below the original block
- The `TextActionMenu` on each block is independent — the auto-translation covers all blocks; the action menu is for per-block deep-dive (AI explain, re-translate, copy)

**State machine**:

```
[user toggles Translation on]
  → loading: true, progress: 0
  → fetch chunk 1 → progress: 5 / totalLines
  → fetch chunk 2 → progress: 10 / totalLines
  → ...
  → fetch final chunk → progress: totalLines, loading: false
  → translatedBlocks populated

[user edits text]
  → abort current translation
  → blocks re-parsed
  → if translation toggle is on → auto-retrigger translation

[user toggles Translation off]
  → abort current translation
  → clear translatedBlocks
```

### 3. Text Action Menu — Manual, Single Block

**Component**: `components/text-action-menu.tsx`

```
TextActionMenu { text, l2Code, l1Code, context, children }
```

**"Translate" action**:
- User clicks `⋮` on a block → dropdown → "Translate"
- Calls `POST /translate` with the block's text
- Shows translated text inline below the action menu, with ReactMarkdown rendering
- Handles loading spinner and error state
- Result is ephemeral — dismissed when menu closes

**"Let AI Explain" action** (not translation but related):
- Opens a modal with the tokenized original text
- Streams an AI explanation via SSE (`POST /chatgpt/stream`)
- Explanation covers grammar, usage, and cultural context — not a direct translation
- Includes "Open in Reader" button to send the text to the reader

### 4. Translate Utility — Page Metadata

**File**: `lib/translate.ts`

```ts
translateText(text: string, l1: string, l2: string): Promise<string>
```

- Thin wrapper around `GET /translate`
- 5-second timeout via `AbortSignal.timeout(5000)`
- Falls back to original text on any error
- Used for: TV show descriptions, video titles (non-critical metadata)

## Data Flow

```
┌──────────────────────────────────────────────────┐
│                  Python Backend                   │
│  /translate        (single string)               │
│  /translate_array  (array of strings)            │
│       │                                           │
│       │  LLM-powered (DeepSeek V4)                │
│       │  Cached per (text, l1, l2) tuple          │
└───────┼───────────────────────────────────────────┘
        │
        │  HTTP (fetch)
        │
┌───────┼───────────────────────────────────────────┐
│       ▼              Next.js Web                   │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ useSubtitleTranslation(l2Lines, l1, l2)      │  │
│  │  → Progressive chunked (5 lines each)        │  │
│  │  → SubtitleDisplay component                 │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ useReaderTranslation(blocks, l1, l2)          │  │
│  │  → Batch by page (all TextBlocks at once)    │  │
│  │  → Reader page                               │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ TextActionMenu.handleTranslate()             │  │
│  │  → Single block, on-demand                   │  │
│  │  → Reader blocks + subtitle lines            │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ translateText() utility                      │  │
│  │  → Page metadata (titles, descriptions)      │  │
│  │  → TV show detail, video watch page          │  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

## States

### Subtitle Translation

| State | UI |
|---|---|
| **Disabled** | No L1 lines shown |
| **Loading** | Chunk-by-chunk: lines appear as they arrive. Progress indicator (e.g., "Translating 15/120") |
| **Loaded** | All L1 lines visible below their L2 lines |
| **Error** | Chunk failure: previously translated lines remain; failed chunk shows untranslated L2 lines |
| **Re-translate** | Language switch or new video: abort previous, restart from chunk 1 |

### Reader Translation

| State | UI |
|---|---|
| **Disabled** | No L1 text shown. Translation button in toolbar is outlined. |
| **Loading** | Translation button shows spinner. Blocks show skeleton placeholders for L1 text. |
| **Loaded** | Each block has L1 text below L2 text in muted style. Translation button is filled. |
| **Error** | Chunk failure: previously translated blocks keep their L1; failed blocks show "Translation unavailable" |
| **Edit → retrigger** | Abort + restart on text change if toggle is on |

### Action Menu Translation

| State | UI |
|---|---|
| **Idle** | "Translate" option in dropdown |
| **Loading** | Spinner replaces icon; option disabled |
| **Loaded** | Translated text appears below the dropdown trigger |
| **Error** | Error message in muted red below the trigger |

## What Is NOT Translated

| Item | Reason |
|---|---|
| **Code blocks** (```) | Structural, not prose |
| **Tables** | Structural; each cell would lose column alignment |
| **Standalone images** | No text to translate |
| **URLs / raw links** | Should remain as-is |
| **Thematic breaks** (`---`) | No text |

## Caching

Both `/translate` and `/translate_array` are cached server-side by the Python backend. The cache key is `(texts, l1, l2)` — identical requests return cached results with no LLM cost. The frontend does not implement its own translation cache; the backend handles deduplication.

## Future Work

- **Translation quality indicator** — show confidence or "AI-translated" badge when the LLM is unsure
- **Per-language translation settings** — some users may want translation for Japanese but not Spanish
- **Reader side-by-side mode** — L2 on left, L1 on right, synced scroll (like the current two-column layout but auto-populated)
