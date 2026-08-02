# Saved Words — End-to-End Data Flow

## Metadata
- **Arch ID**: ARCH-014
- **Feature**: Saved words — save, store, sync, retrieve, display, and enrich with dictionary/LLM entries
- **Type**: as-built
- **Status**: accepted
- **Created**: 2026-07-25
- **Last Updated**: 2026-07-25
- **ROADMAP Phase**: Cross-cutting (all phases)
- **Scope**: Next.js Web (active), Python Backend (active)
- **Supersedes**: None
- **See also**:
  - `docs/adr/0006-consolidated-lexical-data-types.md` — LexicalItem, DictionaryEntry, SavedLexicalItemRecord types
  - `docs/adr/0007-dictionary-hub-ux.md` — Dictionary Hub UX with sidebar word list
  - `docs/arch/004-python-dictionary-db-schema.md` — Backend dictionary database schema
  - `docs/arch/001-classic-app-architecture.md` — Classic Nuxt reference (`saved-words.vue`)
  - `docs/arch/011-settings-architecture.md` — Settings storage patterns (localStorage + cloud sync)
  - `apps/web/src/hooks/use-saved-words.ts` — Core hook
  - `apps/web/src/components/save-button.tsx` — Save UI entry point
  - `apps/web/src/components/dictionary/inline-definition.tsx` — Lazy-loaded definition fetch
  - `packages/shared/src/word-id-resolver.ts` — Word ID decomposition
  - `packages/api-client/src/user-data.ts` — Cloud sync API client
  - `zerotohero-python-server/routes/dictionary.py` — `/dictionary/lookup`, `/dictionary/entry`, `/dictionary/lookup-batch`
  - `zerotohero-python-server/utils_dictionary.py` — Language-specific dictionary loaders

---

## Overview

The saved-words system lets users bookmark vocabulary words from the video player or reader, persist them across sessions and devices, and browse them with inline definitions and pronunciations. It spans six layers across the full stack:

| Layer | Where | What |
|---|---|---|
| **Save** | `SaveButton` component | User clicks bookmark → inflection fetch → store + sync |
| **Store** | `useSavedWords` hook | React state + localStorage + cloud blob |
| **Sync** | `UserDataProvider` + Flask | Directus `user_data.saved_words` JSON column |
| **Retrieve** | `useSavedWordsContext` | Get/sort/filter per-L2 word lists |
| **Display** | `SavedWordRow` + `WordListItem` | Head form, context form, source attribution |
| **Enrich** | `InlineDefinition` + Python `/dictionary/entry` | Lazy-loaded definition + pronunciation per row |

### Data Flow Diagrams

The system has two independent data paths. The **write path** (save → store → sync) fires on user bookmark actions. The **read path** (retrieve → display → enrich) fires on page load and scroll.

#### Write Path — Save, Store, Sync

```
User clicks bookmark icon in popup / entry card
│
▼
┌─────────────────────────────────────────────────────────┐
│  SaveButton.handleToggle()                               │
│  apps/web/src/components/save-button.tsx                  │
│                                                          │
│  1. fetchInflectedForms(head, l2)                        │
│     └─▶ POST /inflect-{lang}  (Python inflection endpoint)│
│         Returns [head, conjugation1, conjugation2, ...]   │
│                                                          │
│  2. Build SavedLexicalItemRecord payload:                 │
│     { id, forms, date, context, instances: [...] }       │
│                                                          │
│  3. saveWord(l2Code, record)                              │
│     └─▶ useSavedWords hook                                │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  useSavedWords.saveWord()                                │
│  apps/web/src/hooks/use-saved-words.ts                    │
│                                                          │
│  1. setSavedWords(prev → { ...prev, [l2]: [...words] }) │
│     React state — immediate, synchronous                  │
│                                                          │
│  2. persist(next)                                        │
│     ├─▶ localStorage.setItem('zthSavedWords', JSON)     │
│     │   Synchronous, offline-capable                      │
│     │                                                    │
│     └─▶ scheduleSync(next)                               │
│         2s debounce                                       │
│         └─▶ POST /user-data/sync                        │
│             body: { saved_words: JSON.stringify(store) } │
│             └─▶ Flask → Directus user_data.saved_words   │
│                 Last-writer-wins, no delta                │
└─────────────────────────────────────────────────────────┘

Remove flow (same path, reversed):
  SavedWordRow bookmark click
    → removeSavedWord(l2Code, wordId)
    → setSavedWords(prev → filter out) → persist → sync
    Deletions propagate by overwriting with smaller blob.
```

#### Read Path — Retrieve, Display, Enrich

```
Page mount / auth state change
│
├─▶ Anonymous:  localStorage.getItem('zthSavedWords') → parse → setSavedWords
│
└─▶ Logged in:  UserDataProvider → GET /user-data
                  → cloud.saved_words → parse → sanitizeStore → setSavedWords
                  Cloud is source of truth. localStorage is skipped on mount
                  but written as a side effect for offline resilience.
│
▼
┌─────────────────────────────────────────────────────────┐
│  SavedWordsPage                                         │
│  apps/web/src/app/[l1]/[l2]/saved-words/page.tsx        │
│                                                         │
│  const allWords = getSavedWords(l2.code)                 │
│       ↑                                                │
│       │ reads from useSavedWordsContext (React state)   │
│       │                                                │
│  Derived arrays (useMemo):                              │
│    1. Filter: text match on forms[], instances[], etc.  │
│    2. Sort:  newest-first (date desc) or alpha          │
│    3. Group: Today (date ≥ today 00:00) vs Earlier      │
│                                                         │
│  Render: SavedWordGroup → WordList → SavedWordRow       │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼ per-row
┌─────────────────────────────────────────────────────────┐
│  SavedWordRow                                           │
│  apps/web/src/components/dictionary/saved-word-row.tsx  │
│                                                         │
│  Extracts:                                              │
│    head     = word.forms[0] ?? word.context.form        │
│    latest   = normalizeInstances(word)[last]             │
│    ctxForm  = latest.context.form (≠ head → shown)      │
│                                                         │
│  Renders WordListItem with:                             │
│    ├─ [prefix]       Bookmark button (remove) + SRS dot │
│    ├─ head + ctxForm                                   │
│    ├─ InlineDefinition  ← triggers enrich (see below)   │
│    ├─ context line    "…{safeCtx.text}…"                │
│    └─ SavedWordSource 🎬/📖 Title · date                │
└──────────────────────────┬──────────────────────────────┘
                           │ IntersectionObserver (300px margin)
                           ▼
┌─────────────────────────────────────────────────────────┐
│  InlineDefinition                                       │
│  apps/web/src/components/dictionary/inline-definition.tsx│
│                                                         │
│  1. Check definitionCache (module-level Map):           │
│     hit  → render immediately, skip fetch                │
│     miss → fetchDefinition(wordId, l1, l2)              │
│                                                         │
│  2. fetchDefinition():                                   │
│     a. decomposeWordId(wordId, l2) → { dict, id }       │
│     b. GET /dictionary/entry?l2=&dict=&id=&l1=          │
│        └─▶ Python backend:                              │
│            ├─ LLM entry → filesystem cache JSON         │
│            └─ Dict entry → SQLite by PK (get_loader)    │
│            └─ l1≠en → LLM translate definitions         │
│     c. Parse → { definition, pronunciation, partOfSpeech }│
│     d. Cache result (null on failure, to avoid re-fetch)│
│                                                         │
│  3. Render: [pron] [POS] definition                     │
│     (pronunciation in muted color, POS in italics)      │
└─────────────────────────────────────────────────────────┘
```

#### Bulk Pre-Warming (Parallel Path)

Not part of the saved-words read path, but feeds the same module-level cache so that `DictionaryPopup` opens instantly when clicking a word in the transcript:

```
TokenizedText mounts (video transcript / reader)
  → bulkLookupWords(words, l2, l1)
  → POST /dictionary/lookup-batch  (many words, single request)
  → Populates the same definitionCache Map
  → DictionaryPopup checks cache first — instant open
```

This pre-warming does **not** affect the saved-words page — rows there fetch independently via `/dictionary/entry`.

---

## Architecture

### 1. Save Flow — How Words Enter the System

#### Entry Point

Words are saved from exactly one component: **`SaveButton`** (`apps/web/src/components/save-button.tsx`).

```
User clicks a tokenized word in transcript/reader
  → DictionaryPopup opens (apps/web/src/components/dictionary-popup.tsx)
    → POST /dictionary/lookup (or reads from bulk-lookup cache)
    → Renders DictionaryEntryCard per result
      → SaveButton rendered inside each card
        → User clicks bookmark → save fires
```

#### Save Payload

```typescript
// SaveButton.handleToggle() — builds a SavedLexicalItemRecord
saveWord(l2Code, {
  id: wordId,          // e.g., "中國,zhōng_guó,0", "llm-ja-a1b2c3d4e5f6"
  forms: allForms,     // [head, ...inflected/conjugated forms] — auto-fetched
  date: Date.now(),    // Unix-ms timestamp
  context,             // SavedWordContext — subtitle line, video title, etc.
  instances: [{        // At least one instance — see § Instance System
    timestamp: Date.now(),
    form: head,
    context,
  }],
});
```

#### Inflected Form Fetching

Before saving, `SaveButton` calls `fetchInflectedForms(head, l2Code)` to request all inflected/conjugated forms from language-specific Python endpoints:

| Language(s) | Endpoint | Engine |
|---|---|---|
| `ja` | `POST /inflect-japanese` | MeCab-based conjugation table |
| `ko` | `POST /inflect-korean` | KoNLPy-based |
| `ru`, `uk` | `POST /inflect-pymorphy` | pymorphy2 morphological analyzer |
| `en`, `fr`, `de`, `es`, `it`, `nl` | `POST /inflect-pattern` | Pattern library (CLIPS) |
| All other languages | _(none)_ | `forms = [head]` only |

This ensures word-highlighting in `TokenizedText` can recognize saved words regardless of surface form (past tense, plural, polite form, cases, etc.).

#### Where SaveContext Comes From

The `context: SavedWordContext` is assembled at the point where the user clicks a word:

| Context | context fields populated |
|---|---|
| **Any tokenized text** | `form`, `text` — always derived by `TokenizedText` from the clicked token and the **sentence** containing it (`Intl.Segmenter`, UAX #29); callers cannot override them |
| **Video player** | caller adds `starttime`, `youtube_id`, `videoTitle` |
| **EPUB reader** | caller adds `textTitle` (book title) |
| **Notes reader** | caller adds `textTitle` (note title) |

### 2. Store — Client-Side Persistence

#### Type: SavedLexicalItemStore

```typescript
// packages/shared/src/types.ts
type SavedLexicalItemStore = Record<string, SavedLexicalItemRecord[]>;
//   key: ISO 639-1 L2 code (e.g., "zh", "ja", "ko")
//   value: array of saved word records
```

#### Three-Layer Storage

```
┌──────────────────────────────────────────────────────┐
│  useSavedWords hook                                  │
│  (apps/web/src/hooks/use-saved-words.ts)             │
│                                                      │
│  ┌───────────────┐     ┌────────────────────┐        │
│  │  React state   │────▶│  localStorage      │        │
│  │  (savedWords)  │     │  key: zthSavedWords│        │
│  └───────────────┘     └────────────────────┘        │
│         │                      │                     │
│         │                      │ (if authenticated)  │
│         ▼                      ▼                     │
│  ┌──────────────────────────────────────────────┐    │
│  │  scheduleSync() — 2s debounce                │    │
│  │  POST /user-data/sync                         │    │
│  │  body: { saved_words: JSON.stringify(store) } │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

| Layer | Behavior |
|---|---|
| **React state** | Live in-memory state via `useState<SavedLexicalItemStore>`. Updated immediately on save/remove. |
| **localStorage** | Written synchronously on every mutation. Key: `zthSavedWords` (matches Classic for migration compatibility). Provides offline persistence and anonymous-user support. |
| **Cloud (Directus)** | Debounced 2s sync. Full blob upload — no incremental/delta protocol. **Last-writer-wins**: local state represents the user's intent; deletions propagate by overwriting with the smaller blob. |

#### Auth-Aware Initialization

| Auth State | Initialization Strategy |
|---|---|
| **Not authenticated** | Load from `localStorage` (`zthSavedWords`). No cloud interaction. |
| **Authenticated** | Skip localStorage entirely. Wait for `UserDataProvider` → `GET /user-data` → parse `saved_words` field → hydrate. Cloud is the source of truth on login. |

`UserDataProvider` (`apps/web/src/providers/user-data-provider.tsx`) fetches `GET /user-data` **once per auth session** (when user ID changes) and distributes the result via React Context. Both `useSavedWords` and `useSrs` consume this data, avoiding redundant API calls.

#### Merge & Sync Strategy

- **On login**: Cloud replaces local. `sanitizeStore()` is run to handle legacy/corrupt data.
- **On save/delete**: Local state updates immediately → localStorage written → 2s debounce → `POST /user-data/sync`.
- **Cross-device**: Last writer wins. If Device A saves word X at T=10 and Device B deletes it at T=12, Device B wins. The `isSyncing` ref prevents concurrent sync calls.
- **`mergeSavedWords()`**: Utility exists for offline-first scenarios (merging cloud into local when both have writes), but the web app skips local reads on authenticated mount, so it's rarely triggered.

#### Sanitization

`sanitizeStore()` runs on every loaded data source (localStorage, cloud):
- Records missing `id` → dropped (unrecoverable)
- Records missing `forms` → fallback from `context.form` or `"?"`
- Records missing `context` → minimal `{ form, text, textTitle: '' }`
- Records with non-numeric `date` → `Date.now()`

This guards against legacy Classic data with incomplete records.

### 3. Sync — Cloud Upload/Download

#### Upload Path

```
SaveButton.saveWord() / SavedWordRow.removeSavedWord()
  → useSavedWords.saveWord() / removeSavedWord()
    → setSavedWords(prev → ...)       // React state update
    → persist(next)                    // localStorage + schedule sync
      → localStorage.setItem()
      → scheduleSync(next)            // 2s debounce
        → POST /user-data/sync        // JSON blob upload
          body: { saved_words: JSON.stringify(store) }
```

#### Download Path

```
UserDataProvider mounts (auth state change)
  → GET /user-data                    // Once per session
    Response: {
      id: string | number,
      saved_words: string,            // JSON.stringify(SavedLexicalItemStore)
      progress?: string,              // JSON.stringify(ProgressStore)
      srs_progress?: string,          // JSON.stringify(SrsProgressStore)
      settings_v2?: string,           // JSON.stringify(SettingsV2)
    }

SavedWordsProvider mounts
  → useSavedWords() reads cloudData via context
    → JSON.parse(cloudData.saved_words)
    → sanitizeStore(parsed)
    → setSavedWords(parsed)
```

#### Directus `user_data` Table — Relevant Columns

| Column | Type | Content | Written By |
|---|---|---|---|
| `saved_words` | TEXT | `JSON.stringify(SavedLexicalItemStore)` | `POST /user-data/sync` |
| `progress` | TEXT | `JSON.stringify(ProgressStore)` | `POST /user-data/sync` |
| `srs_progress` | TEXT | `JSON.stringify(SrsProgressStore)` | `POST /user-data/sync` |
| `settings_v2` | TEXT | `JSON.stringify(SettingsV2)` | Settings provider |

All are opaque JSON text blobs — the Python backend never parses or validates them. The Flask endpoint (`routes/user_data.py`) acts as a pass-through to Directus.

### 4. Retrieve — Sorting, Filtering, Word ID Resolution

#### Hook API

```typescript
// apps/web/src/providers/saved-words-provider.tsx → useSavedWordsContext()
const { getSavedWords, hasSavedWord } = useSavedWordsContext();

// All saved words for current L2, newest-first
const words = getSavedWords(l2Code);       // → SavedLexicalItemRecord[]

// Direct ID lookup (no resolution needed)
const isBookmarked = hasSavedWord(l2Code, wordId);  // → boolean
```

#### Word ID Schemes

Saved-word IDs and dictionary entry IDs use the **same raw ID string**. Bookmark detection is a direct string comparison — no resolution step needed.

| Dictionary | Language | ID Format | Example |
|---|---|---|---|
| **CEDICT** | `zh` | `{traditional},{pinyin_with_underscores},{index}` | `中國,zhōng_guó,0` |
| **EDICT** | `ja` | Numeric string from source CSV | `93628` |
| **Kengdic** | `ko` | Numeric string from source CSV | `500885` |
| **CC-Canto** | `yue` | From source CSV | (per-file) |
| **Klingonska** | `tlh` | From source CSV | (per-file) |
| **Wiktionary** | all others | `w{djb2-hash}` | `w1190326473` |
| **LLM** | any | `llm-{l2}-{12-char-md5-hex}` | `llm-ja-56818f257212` |

#### ID Decomposition

`decomposeWordId()` in `packages/shared/src/word-id-resolver.ts` parses an ID string into `{ dict, id }` for navigation and API calls. Detection rules are mutually exclusive (order matters):

```typescript
// 1. Contains ','            → CEDICT         dict: "cedict"
// 2. Starts with 'llm-'      → LLM            dict: "llm", id: strip "llm-" prefix
// 3. /^w\d+$/                → Wiktionary     dict: "wiktionary"
// 4. /^\d+$/ + l2='ja'       → EDICT          dict: "edict"
// 5. /^\d+$/ + l2='ko'       → Kengdic        dict: "kengdic"
// 6. /^\d+$/ + other         → Wiktionary     (legacy numeric-only IDs)
```

#### Sorting & Filtering (Saved Words Page)

The page (`apps/web/src/app/[l1]/[l2]/saved-words/page.tsx`) computes three derived arrays:

| Operation | Implementation |
|---|---|
| **Sort: newest first** | `words.sort((a, b) => b.date - a.date)` (default) |
| **Sort: alphabetical** | `words.sort((a, b) => a.forms[0].localeCompare(b.forms[0]))` |
| **Text filter** | Case-insensitive match against `forms[]`, `instances[].form`, `instances[].context.text`, `instances[].context.videoTitle` |
| **Date grouping** | `w.date >= startOfToday` → "Today" group, otherwise "Earlier" group |

Filtering uses `normalizeInstances()` to treat legacy single-context and modern multi-instance records uniformly.

### 5. Display — Component Hierarchy

```
SavedWordsPage                  (apps/web/src/app/[l1]/[l2]/saved-words/page.tsx)
├── SearchBar / FilterToolbar   (sort toggle, text filter, export, clear-all)
├── SavedWordGroup              (inline sub-component, "Today"/"Earlier" header)
│   └── WordList                (apps/web/src/components/dictionary/word-list.tsx)
│       └── SavedWordRow        (apps/web/src/components/dictionary/saved-word-row.tsx)
│           └── WordListItem    (apps/web/src/components/dictionary/word-list.tsx)
│               ├── [prefix]    ← bookmark button + optional SRS dot
│               ├── head        ← word.forms[0] ?? word.context.form ?? "?"
│               ├── contextForm ← surface form ≠ head, shown as "(form)"
│               ├── InlineDefinition ← lazy-loaded via IntersectionObserver
│               ├── context line    ← subtitle text excerpt
│               └── SavedWordSource ← 🎬 Title · date or 📖 Title · date
```

#### SavedWordRow Field Resolution

| UI Element | Data Source |
|---|---|
| **Head form** | `word.forms[0]` → `word.context?.form` → `"?"` |
| **Context form** | Shown only when `safeCtx.form !== headForm` |
| **Definition** | `InlineDefinition` component (see below) |
| **Pronunciation** | `InlineDefinition` component (see below) |
| **Context line** | `safeCtx.text` (truncated, with `…` prefix/suffix), only when `≠ head` |
| **Source** | `SavedWordSource` — reads `context.youtube_id`/`videoTitle` vs `textTitle` |
| **SRS dot** | `useSrs().getCard(l2, word.id)` → color-coded by review status |
| **Bookmark** | Filled amber icon → calls `removeSavedWord(l2, word.id)` |

#### InlineDefinition — Lazy-Loaded Entry Fetch

Each row's definition is fetched **only when the row approaches the viewport**:

```
1. Render invisible <span ref={sentinelRef}> placeholder (16px height)
2. IntersectionObserver (300px rootMargin) detects row is near viewport
3. On intersection → fetchDefinition(wordId, l1Code, l2Code)
   a. Check module-level Map cache first (hit → immediate render)
   b. Miss → decomposeWordId(wordId, l2) → { dict, id }
   c. GET /dictionary/entry?l2={l2}&dict={dict}&id={id}&l1={l1}
   d. Parse response → { definition, pronunciation, partOfSpeech }
   e. Store in Map cache (null for failures, to avoid re-fetch)
4. Re-render with definition + pronunciation + POS
```

The module-level `definitionCache: Map<string, { definition, pronunciation, partOfSpeech } | null>` survives across renders within a page session. Scrolling away and back does not re-fetch. Null entries are cached to prevent repeated failed requests.

### 6. Enrich — Dictionary/LLM Entry Fetching Pipelines

#### Entry-Level Fetch (`GET /dictionary/entry`)

Used by `InlineDefinition` to get pronunciation and first definition for display rows.

```
GET /dictionary/entry?l2=zh&dict=cedict&id=中國,zhōng_guó,0&l1=en

Backend (routes/dictionary.py → dictionary_entry()):
  1. If dict == "llm":
     → Read from cache/dictionary_llm/{l1}/{entryId}.json
  2. Otherwise:
     → get_loader(l2).get_entry(rowId)
     → Query specific SQLite table by primary key
  3. If l1 ≠ "en":
     → _translate_definitions() — LLM translates English → user's L1
```

#### Bulk Lookup Cache (`POST /dictionary/lookup-batch`)

Preemptively warms the client-side dictionary cache when `TokenizedText` renders. This makes `DictionaryPopup` open instantly without a loading spinner.

```
TokenizedText mounts (video transcript / reader)
  → bulkLookupWords(words, l2, l1)     (apps/web/src/lib/dictionary-cache.ts)
    1. Filter: skip words already in Map cache
    2. Dedup: check _inflightRequests Map for identical concurrent batches
    3. POST /dictionary/lookup-batch
       Body: { words: [{ text, l2, l1 }, ...] }
    4. Cache each result under "${l2Code}:${text}" key
    5. Increment _cacheVersion (for cache-aware components)
```

#### Popup Lookup (`POST /dictionary/lookup`)

Fallback when a user clicks a word not covered by the bulk cache:

```
POST /dictionary/lookup
Body: { text: "吃饭", l2: "zh", l1: "es" }

Backend (_lookup_word):
  1. get_loader(l2) → CedictLoader, EdictLoader, WiktionaryLoader, etc.
  2. loader.lookup(text) — priority chain:
     a. Exact match by head word
     b. Exact match by alternate form (traditional, kana, hanja)
     c. Exact match by pronunciation (pinyin, romaji)
     d. Fuzzy match (substring, ≥2 chars)
  3. Chinese: retry with simplified if traditional lookup failed
  4. If no match → LLM fallback (_llm_lookup)
     → DeepSeek generates entry → stored in cache/dictionary_llm/{l1}/{l2}-{hash}.json
  5. If l1 ≠ "en" → LLM translate definitions
  6. Return up to 5 entries
```

For full details on the backend dictionary database schema (tables, indexes, lookup strategies per loader), see `docs/arch/004-python-dictionary-db-schema.md`.

#### LLM Entry ID Format

LLM-generated entries use `llm-{l2}-{12-char-md5-hex}`. The 12-character hex hash is computed from the lookup text. Cache files are stored at `cache/dictionary_llm/{l1}/{l2}-{hash}.json`. The `llm-` prefix in the ID allows:

- `decomposeWordId()` to route to `dict: "llm"` for navigation
- `/dictionary/entry` to serve from the filesystem cache instead of SQLite

### 7. Instance System — Multi-Context Word Records

Each `SavedLexicalItemRecord` can accumulate multiple `instances` — one per context where the user saved the word.

```typescript
// packages/shared/src/types.ts
interface SavedLexicalItemRecord {
  id: string;                    // Dictionary entry ID (same scheme as lookup)
  forms: string[];               // All forms (head + inflected) — global, for word-highlighting
  date: number;                  // Unix-ms of FIRST save
  context?: SavedWordContext;    // @deprecated — legacy field, = instances[last].context
  instances?: SavedLexicalItemInstance[];  // Source of truth
}

interface SavedLexicalItemInstance {
  timestamp: number;             // When this specific occurrence was saved
  form: string;                  // Surface form in this context
  context: SavedWordContext;     // Where/how encountered
}

interface SavedWordContext {
  form: string;                  // The word form tapped by the user
  text: string;                  // Full subtitle line or surrounding sentence
  starttime?: number;            // Video timestamp (seconds)
  youtube_id?: string;           // YouTube video ID
  videoTitle?: string;           // Video title for attribution
  textTitle?: string;            // Book/chapter title
  translation?: string;          // L1 translation (future use)
}
```

#### Backward Compatibility

`normalizeInstances()` (in `use-saved-words.ts`) handles legacy records with only the flat `context` field:

```typescript
export function normalizeInstances(record: SavedLexicalItemRecord) {
  if (record.instances?.length > 0) return record.instances;
  if (record.context) return [{ timestamp: record.date, form: record.context.form, context: record.context }];
  return [];
}
```

On re-save, new instances are appended (deduped by `timestamp|form|text`), forms are unioned, and `date` is maxed. The legacy `context` field is kept in sync with the latest instance for backward compatibility.

---

## Key Components & Files

| Layer | File | Role |
|---|---|---|
| **Type definitions** | `packages/shared/src/types.ts` | `SavedLexicalItemRecord`, `SavedLexicalItemStore`, `SavedWordContext`, `SavedLexicalItemInstance` |
| **Word ID resolver** | `packages/shared/src/word-id-resolver.ts` | `decomposeWordId()`, `isWordSaved()` |
| **Save UI** | `apps/web/src/components/save-button.tsx` | Bookmark toggle + inflection fetch |
| **Popup UI** | `apps/web/src/components/dictionary-popup.tsx` | Word-click popup hosting save buttons |
| **Entry card** | `apps/web/src/components/dictionary-entry-card.tsx` | Renders lookup result with SaveButton |
| **Core hook** | `apps/web/src/hooks/use-saved-words.ts` | `useSavedWords()` — state, localStorage, cloud sync, `normalizeInstances()` |
| **Provider** | `apps/web/src/providers/saved-words-provider.tsx` | `SavedWordsProvider` — React Context wrapper |
| **Cloud provider** | `apps/web/src/providers/user-data-provider.tsx` | Fetches `GET /user-data` once per session |
| **API client** | `packages/api-client/src/user-data.ts` | `useUserData()` — typed wrappers for `/user-data` endpoints |
| **Saved page** | `apps/web/src/app/[l1]/[l2]/saved-words/page.tsx` | Full page: sort, filter, date grouping |
| **Row component** | `apps/web/src/components/dictionary/saved-word-row.tsx` | Single row: head + definitions + source |
| **List components** | `apps/web/src/components/dictionary/word-list.tsx` | `WordListItem`, `WordList` — reusable primitives |
| **Definition fetch** | `apps/web/src/components/dictionary/inline-definition.tsx` | Lazy-loaded entry fetch via IntersectionObserver |
| **Source attribution** | `apps/web/src/components/saved-word-source.tsx` | Video/book icon + title + date |
| **Sidebar** | `apps/web/src/components/dictionary/word-list-sidebar.tsx` | Cross-page navigation sidebar for dictionary entry pages |
| **Nav utility** | `apps/web/src/lib/word-list-navigation.ts` | sessionStorage-based navigation context |
| **Route builder** | `apps/web/src/lib/entry-route.ts` | `buildEntryRoute()` — URL construction (handles CEDICT comma encoding) |
| **Dict cache** | `apps/web/src/lib/dictionary-cache.ts` | `bulkLookupWords()`, `getCachedEntries()`, in-flight dedup |
| **Backend lookup** | `zerotohero-python-server/routes/dictionary.py` | `/dictionary/lookup`, `/dictionary/lookup-batch`, `/dictionary/entry` |
| **Backend loaders** | `zerotohero-python-server/utils_dictionary.py` | `CedictLoader`, `EdictLoader`, `WiktionaryLoader`, etc. |
| **Backend DB** | `zerotohero-python-server/data/dictionaries.db` | SQLite dictionary database (see ARCH-004) |
| **Backend user sync** | `zerotohero-python-server/routes/user_data.py` | `GET /user-data`, `POST /user-data/sync` |
| **Inflection endpoints** | `zerotohero-python-server/inflect_*.py` | Language-specific inflection generation |

---

## Edge Cases & Defensive Patterns

### Corrupt/Legacy Data

| Problem | Resolution |
|---|---|
| Missing `forms` array | `sanitizeForms()` populates from `context.form` or `"?"` |
| Missing `context` object | `sanitizeContext()` creates minimal `{ form, text, textTitle: '' }` from `forms[0]` |
| Non-numeric `date` | Reset to `Date.now()` during sanitization |
| Missing `id` | Record dropped entirely (unrecoverable) |

### Duplicate Instances

On re-save, new instances are deduped by `timestamp|form|text` composite key. `mergeInstances()` provides sorted, deduplicated merge of two instance arrays.

### ID Disambiguation

- Pure numeric IDs require `l2` context to disambiguate EDICT (`ja`) vs Kengdic (`ko`)
- CEDICT IDs contain commas → `buildEntryRoute()` replaces `,` with `~` for Next.js routing; entry page reverses this before API call
- Unknown ID formats fall back to text search by `forms[0]`

### Race Conditions

| Scenario | Mitigation |
|---|---|
| Save during sync upload | `isSyncing` ref prevents concurrent sync calls |
| Cloud data arrives after local writes | Auth path skips localStorage; cloud always wins on login |
| Concurrent bulk lookups | `_inflightRequests` Map deduplicates identical `/dictionary/lookup-batch` calls |
| Definition fetch for removed word | Module-level `definitionCache` handles null results; `InlineDefinition` gracefully renders nothing |
