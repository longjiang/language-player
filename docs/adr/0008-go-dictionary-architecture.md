# ADR 0008: Mobile App Dictionary Architecture — Online Lookup + Offline Download

> **Status:** Proposed
> **Date:** 2026-07-21
> **Replaces:** Current mobile offline CSV-based dictionary (`apps/mobile/src/dictionary.ts`, `apps/mobile/src/dictionary-db.ts`, `apps/mobile/src/dictionary-profile.ts`)
> **See also:**
> - `docs/adr/lp-nextjs-dictionary-architecture.md` — Next.js server-side dictionary
> - `docs/adr/lp-classic-dictionary-architecture.md` — Classic Nuxt reference
> - `docs/adr/0006-consolidated-lexical-data-types.md` — ADR-0006 lexical types
> - `docs/adr/0007-dictionary-hub-ux.md` — Dictionary Hub UX

---

## Context

The mobile app (`apps/mobile/`) currently downloads raw CSV dictionary files (10–50 MB each) from a legacy CZH server, parses and normalizes them client-side, and loads them into a local SQLite database. This has four problems:

1. **App-freezing load** — Parsing and normalizing 117K+ entries blocks the main thread for 10–30 seconds.
2. **English-only definitions** — No L1 translation, unlike the Next.js web app which uses LLM-powered translation.
3. **No LLM fallback** — Words not in the curated dictionaries return nothing.
4. **Duplicated normalization** — The Python backend already normalizes entries for `/dictionary/lookup`; GO duplicates this logic client-side.

The Next.js web app uses a clean server-side architecture: `POST /dictionary/lookup` → Python backend → returns normalized `DictionaryEntry[]` with LLM fallback for missing words and LLM translation for non-English L1s. The mobile app should adopt this pattern for online use, while adding an offline download capability suited to mobile.

---

## Decision

**Three-tier dictionary architecture for the mobile app:**

1. **Online lookup** — Same as Next.js: `POST /dictionary/lookup` → Python backend. All normalization, LLM fallback, and L1 translation happen server-side.
2. **Offline download** — New `GET /dictionary/download?l2=ja&l1=en&limit=50000` endpoint. Python server returns pre-normalized, frequency-filtered JSON. No client-side normalization needed.
3. **LLM cache** — Locally cache `match_type: "llm"` results in a dedicated SQLite table for offline availability.

---

## Architecture

### Data Flow

```
┌──────────────────────────────────────────────────────┐
│                 Mobile App (React Native)             │
│                                                      │
│  DictionaryContext                                    │
│  ├─ onlineLookup(text) → POST /dictionary/lookup     │
│  │   └─ cache result in Map<text, DictionaryEntry[]> │
│  │   └─ if match_type === 'llm' → store in llm_cache │
│  │                                                    │
│  ├─ offlineLookup(text)                              │
│  │   ├─ 1. Check memory cache                        │
│  │   ├─ 2. Check IndexedDB (downloaded dict)         │
│  │   └─ 3. Check llm_cache SQLite table              │
│  │                                                    │
│  └─ downloadDict(l2, l1)                             │
│      └─ GET /dictionary/download?l2=ja&l1=en&limit=N │
│      └─ chunked insert → IndexedDB (non-blocking)    │
│                                                      │
├──────────────────────────────────────────────────────┤
│  Storage                                             │
│  ├─ IndexedDB: offline dictionary entries            │
│  ├─ SQLite llm_cache: (text,l1,l2) → entry JSON      │
│  └─ Memory Map: session cache                        │
└──────────────────────────────────────────────────────┘
         │                          ▲
         │ POST /dictionary/lookup  │ GET /dictionary/download
         ▼                          │
┌──────────────────────────────────────────────────────┐
│              Python Backend                           │
│                                                      │
│  /dictionary/lookup  (existing)                      │
│  ├─ Search SQLite dict (exact → lemma → fuzzy)       │
│  ├─ L1≠en → LLM translate definitions                │
│  └─ Not found → LLM generate entry                   │
│                                                      │
│  /dictionary/download  (NEW)                         │
│  ├─ Query dictionaries.db SQLite directly            │
│  ├─ ORDER BY frequency DESC LIMIT ?                  │
│  ├─ Cache result (MD5 hash → disk)                  │
│  └─ Return JSON: { entries, total, downloaded }     │
└──────────────────────────────────────────────────────┘
```

### Online Lookup (Phase 1)

The `@langplayer/api-client` already exports `useDictionary().lookup(text, l2, l1)` which wraps `POST /dictionary/lookup`. The mobile app wires this into its `DictionaryContext` as the primary lookup path. Both apps share `translations.csv` → `packages/shared/locales/*.json` (see ADR-0009), so all UI strings in the download interface use the same `useT()` hook and `{key}` ICU MessageFormat syntax.

**Response shape** (shared `DictionaryEntry` from ADR-0006):

```typescript
{
  results: DictionaryEntry[];  // up to 5 entries
  message?: string;            // LLM disclaimer, etc.
}
```

Each `DictionaryEntry` includes `match_type: 'exact' | 'lemma' | 'fuzzy' | 'llm'`.

**LLM definition caching**: When `match_type === 'llm'`, store the result locally in a dedicated SQLite table (`llm_cache`) keyed by `(text, l1_code, l2_code)`. On subsequent offline lookups, the app can serve cached LLM definitions even without network access.

### L1 Translation Strategy

**Offline dictionaries always store English definitions.** Pre-translating definitions for every word is neither cost-effective nor accurate:

- **Cost**: 20K words × 3 definitions × context-rich prompt ~ $0.50–$1.00 per language pair via DeepSeek. Across 31 L1 languages, that's $15–$30 per L2 — prohibitive at scale.
- **Accuracy risk**: Direct string translation of definitions produces wrong results when the translation lacks word context. For example, translating "court" without knowing whether it's a legal term or a sports term yields the wrong L1 word. The `/dictionary/lookup` endpoint already handles this correctly by providing DeepSeek with full word metadata (head, POS, level, English definitions, language pair) in a structured prompt.

**Lazy L1 definition accumulation**: When a user with L1≠en looks up a word online, the server returns L1 definitions (via `/dictionary/lookup`). If the user is offline, the app shows English definitions from the downloaded dictionary as a fallback. Each online lookup also populates the local `llm_cache` table with the L1 result. Over time, the cache naturally fills with the words the user actually cares about — at zero upfront translation cost.

**The `llm_cache` serves dual purpose** — it stores both `match_type: 'llm'` entries (LLM-generated for words not in any curated dictionary) AND L1-translated definitions from online lookups (even for words that exist in the curated dictionary). The cache key is `(text, l1_code, l2_code)`.

### Download Sizing

The `/dictionary/download` endpoint returns English-definition entries ordered by frequency, capped at a configurable limit (default: 30,000). This keeps downloads small and fast while covering the vocabulary a typical learner needs:

| L2 | Dict Table | Freq-Covered Pool | Default Cap | Est. Download |
|---|---|---|---|---|
| en | wiktionary | 36,050 | 30,000 | ~15 MB |
| zh | cedict | 33,020 | 30,000 | ~15 MB |
| ja | edict | 22,252 | 22,252 (all) | ~11 MB |
| fr | wiktionary | 20,112 | 20,112 (all) | ~10 MB |
| it | wiktionary | 19,773 | 19,773 (all) | ~10 MB |
| ko | kengdic | 19,291 | 19,291 (all) | ~10 MB |
| nl | wiktionary | 18,057 | 18,057 (all) | ~9 MB |
| de | wiktionary | 17,686 | 17,686 (all) | ~9 MB |
| pt | wiktionary | 17,317 | 17,317 (all) | ~9 MB |
| es | wiktionary | 15,895 | 15,895 (all) | ~8 MB |
| ar | wiktionary | 14,726 | 14,726 (all) | ~7 MB |
| ca | wiktionary | 14,449 | 14,449 (all) | ~7 MB |
| hu | wiktionary | 13,810 | 13,810 (all) | ~7 MB |
| fi | wiktionary | 13,272 | 13,272 (all) | ~7 MB |
| ru | wiktionary | 12,825 | 12,825 (all) | ~6 MB |
| sv | wiktionary | 12,570 | 12,570 (all) | ~6 MB |
| no | wiktionary | 12,249 | 12,249 (all) | ~6 MB |
| ro | wiktionary | 10,966 | 10,966 (all) | ~5 MB |
| tr | wiktionary | 6,237 | 6,237 (all) | ~3 MB |
| … | … | … | … | … |

**40 languages** (those with Zipf frequency data in `dictionaries.db`) have entries to offer. The top 20K–30K words by frequency cover 95%+ of everyday text — far more than any learner will actively look up. The remaining 140+ Wiktionary languages have no frequency data and cannot offer frequency-ordered downloads until Zipf data is available.

**If the frequency pool exceeds the cap** (`en` at 36K, `zh` at 33K), the server returns the top N by Zipf score. The download size estimate is ~500 bytes per entry (head, pronunciation, definitions, POS, level, phonetic_detail as JSON).

### Offline Download (Phase 2)

**New Python endpoint:** `GET /dictionary/download`

| Param | Type | Default | Description |
|---|---|---|---|
| `l2` | string | required | Target language code (e.g. `ja`) |
| `l1` | string | `en` | User's native language (for cache key only — definitions are always English) |
| `limit` | number | 30000 | Max entries to return (top by frequency) |

**Server-side flow:**
1. Query `dictionaries.db` SQLite directly — data is already normalized (see `docs/python-dictionary-db-schema.md`)
   - Dedicated dicts: `SELECT * FROM {cedict|edict|kengdic|cccanto|klingonska} ORDER BY frequency DESC LIMIT ?` (frequency is a column in each dict table)
   - Wiktionary: `SELECT * FROM wiktionary WHERE lang_code = ? ORDER BY frequency DESC LIMIT ?` (~800 languages, one table)
2. Definitions are always returned in English — no batch LLM translation at download time. L1 definitions are accumulated lazily via online lookups (see [L1 Translation Strategy](#l1-translation-strategy)).
3. Cache the result on disk (MD5 of `l2:limit` → JSON file)
4. Return `{ entries: DictionaryEntry[], total: number, downloaded: number }`

**No CSV parsing needed** — the database already contains all entries in their final normalized form. The `/dictionary/lookup` endpoint queries the same tables at runtime. The download endpoint just bulk-exports instead of single-lookup.

**Client-side storage:** IndexedDB (via `expo-sqlite` or a dedicated key-value store). IndexedDB is preferred over SQLite for this use case because:
- No normalization needed — JSON is already `DictionaryEntry[]`
- Async by default — no main thread blocking
- Simpler schema: one object store, keyed by `entry.id`
- Built-in indexing via `createIndex()` for head word and pronunciation search

**L1≠en users:** If the user's L1 is not English (e.g., a Spanish speaker learning Japanese), the offline dictionary still downloads English definitions (see [L1 Translation Strategy](#l1-translation-strategy)). The download UI explains this clearly: the user gets English definitions offline, and their L1 definitions accumulate naturally as they look up words online. The `l1` parameter is passed to the server for cache-key purposes but does not affect the downloaded content.

### Offline Dictionary UI Design

#### Discovery & Access

Users encounter offline dictionaries through **three entry points**, each serving a different moment in the user journey:

1. **Dictionary Hub banner** — When a user opens the Dictionary Hub for a language pair and no offline dictionary is downloaded, a dismissible banner appears at the top:
   > `{msg.offline_dictionaries_desc}`
   > [{action.download}] [{action.close}]

2. **Settings → {title.offline_dictionaries}** — A dedicated settings section accessible from the main Settings screen. This is the primary management interface.

3. **Lookup result prompt** — When a dictionary lookup succeeds online but the word isn't in the offline dictionary, a small inline prompt appears below the result:
   > "💡 {msg.confirm_download_dictionary}"
   This only appears if no download is in progress and the user hasn't dismissed it recently (once per session).

#### Settings → Offline Dictionaries Screen

This is the primary download management interface. The screen lists every L2 language the user has configured or recently used.

```
┌──────────────────────────────────────┐
│  ← {title.offline_dictionaries}      │  ← title.offline_dictionaries
│                                      │
│  {msg.offline_dictionaries_desc}     │  ← msg.offline_dictionaries_desc
│                                      │
│  ┌──────────────────────────────────┐│
│  │ ⚠️  {msg.offline_definitions_    ││  ← Only shown when L1≠en
│  │     english}                      ││     msg.offline_definitions_english
│  │                                  ││
│  │ {msg.offline_definitions_        ││  ← msg.offline_definitions_english_desc
│  │  english_desc}                    ││     ({l1} interpolated)
│  │ [{$action.more}]                  ││  ← action.more
│  └──────────────────────────────────┘│
│                                      │
│  ── {label.downloaded} ──           │  ← label.downloaded
│                                      │
│  {$lang.ja}  Japanese                │
│  ├─ 22,252 {label.words}  ~11 MB    │  ← label.words (plural)
│  ├─ ████████████░░░░  78%           │  ← Progress during download
│  └─ [{action.download}]  or         │     action.download
│      [{action.delete}] [↻ {action.  │     action.delete, action.update
│       update}]                       │
│                                      │
│  {$lang.zh}  Chinese                 │
│  ├─ 30,000 {label.words}  ~15 MB    │
│  ├─ ✅ {label.saved}  Jul 15        │  ← label.saved
│  └─ [{action.delete}] [↻ {action.   │
│       update}]                       │
│                                      │
│  {$lang.fr}  French                  │
│  ├─ 20,112 {label.words}  ~10 MB    │
│  └─ [{action.download}]             │
│                                      │
│  ── {label.available} ──            │  ← label.available
│                                      │
│  {$lang.de}  German                  │
│  ├─ 17,686 {label.words}  ~9 MB     │
│  └─ [{action.download}]             │
│                                      │
│  {$lang.ko}  Korean                  │
│  ├─ 19,291 {label.words}  ~10 MB    │
│  └─ [{action.download}]             │
│                                      │
│  ──────────────────────────────────  │
│  {msg.storage_usage}                 │  ← msg.storage_usage
│  ──────────────────────────────────  │
│                                      │
│  [{action.delete_all}]               │  ← action.delete_all
└──────────────────────────────────────┘
```

**Key UI elements:**

| Element | Behavior |
|---|---|
| **L1≠en callout** | Shown at top when user's L1 is not English. Explains English-only offline definitions with a link to a help doc or expands inline. Dismissible; stored in AsyncStorage so it doesn't reappear. |
| **Language rows** | Grouped: "Downloaded" (L2s with an offline dictionary already downloaded or in progress) then "Available" (all remaining languages with frequency data). Each row shows word count, estimated download size, and current status. |
| **Download button** | Initiates `GET /dictionary/download?l2=xx&l1=en`. Uses `action.download`. Transforms into a progress bar during download. On completion, becomes a checkmark with date. |
| **Progress bar** | Updates per chunk (every 500 entries stored). Shows percentage + `label.download_progress` ("{downloaded} of {total} words") below the bar. Download runs in background — user can navigate away and return. |
| **Delete button** | Removes the IndexedDB store for that language. Uses `action.delete`. Confirmation dialog: `msg.confirm_delete_dictionary` ("Delete offline {lang} dictionary? You'll need internet to look up words.") |
| **Update button** (↻) | Re-downloads the dictionary. Uses `action.update`. Shows last download date so user knows if an update is needed. |
| **Storage summary** | Footer showing total offline storage used vs. available. Uses `msg.storage_usage` ("Storage: {used} used of {free} free"). |
| **Delete All** | Uses `action.delete_all`. Nuke option at the bottom. Confirmation with destructive styling. |

#### Download Flow

```
User taps [{action.download}]
        │
        ▼
┌──────────────────────┐
│  {msg.confirm_download_dictionary}  │
│                      │
│  {label.download_size}: ~11 MB     │
│  {label.words}: 22,252             │
│                      │
│  {msg.offline_definitions_english}  │  ← Only when L1≠en
│                      │
│  [{action.cancel}]   │
│  [{action.download}] │
└──────────────────────┘
        │
        ▼  (user confirms)
┌──────────────────────────────────┐
│  ↓ {msg.downloading}             │
│  ████████████░░░░░░  62%         │
│  {label.download_progress}       │
│                                  │
│  [{action.hide}]  ← runs in     │
│                      background  │
└──────────────────────────────────┘
        │
        ▼  (completes)
┌──────────────────────────────────┐
│  ✅ {msg.dictionary_ready}       │
│                                  │
│  {msg.dictionary_ready_desc}     │
│                                  │
│  [{action.close}]                │
└──────────────────────────────────┘
```

**Background download:** If the user navigates away, the download continues. A persistent mini-banner appears at the bottom of the main screens (like a music player mini-player): "↓ {msg.downloading} … 62%". Tapping it returns to the Offline Dictionaries screen.

**Error handling:** If the download fails (network drop, server error), the row shows "⚠️ {msg.download_failed}". The partial data is discarded (not left in a broken state).

#### Post-Download Experience

Once a dictionary is downloaded, the app subtly indicates offline availability:

- **Top bar language switcher:** When the current L2 has an offline dictionary downloaded, a small green circle checkmark (●) appears beside the language name in the top bar language selector.
- **Video player:** When the user taps a word in subtitles and the lookup returns instantly from the offline dictionary, no special indicator is shown — speed is the reward. Only when the word is NOT in the offline dictionary and requires a network request does a small cloud icon (☁️) appear momentarily. The icon fades out after 1.5 seconds using `opacity` animation — it is absolutely positioned within the lookup panel so it does not cause any layout shift.
- **Settings → Offline Dictionaries:** Shows "Last updated: Jul 15" with an update button, so users can periodically refresh.

### Non-Blocking Loading (Phase 2)

The current `Dictionary.loadData()` freezes the app because it processes 117K+ entries synchronously on the main thread. The new architecture eliminates this entirely:

- **Server-side normalization** — The Python backend does all CSV parsing and entry normalization. The mobile client only stores pre-built JSON.
- **Chunked IndexedDB writes** — Process 500 entries per tick, yielding to the main thread between chunks:

```typescript
async function loadEntries(entries: DictionaryEntry[], onProgress: (pct: number) => void) {
  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    await db.transaction('rw', db.entries, () => {
      for (const e of chunk) db.entries.put(e);
    });
    onProgress(Math.min(100, (i + CHUNK) / entries.length * 100));
    await new Promise(r => setTimeout(r, 0)); // yield to main thread
  }
}
```

**LLM cache loading** — The `llm_cache` table is small (only previously looked-up words) and loads asynchronously on app start. No blocking needed.

---

## Migration Path

### Phase 1: Online Lookup
1. Add `dictionaryLookup(text, l2, l1)` to `apps/mobile/src/api/python/` (wraps `POST /dictionary/lookup`)
2. Wire into `DictionaryContext` as primary lookup path
3. Add memory cache (`Map<string, DictionaryEntry[]>`) for session reuse
4. Add `llm_cache` SQLite table for `match_type: 'llm'` results
5. Keep existing offline SQLite dictionary as fallback during migration

### Phase 2: Offline Download
1. Add Python `/dictionary/download` endpoint (direct SQLite query: `ORDER BY frequency DESC LIMIT ?`) with server-side caching
2. Add `downloadDictionary(l2, l1)` to the mobile API layer
3. Create IndexedDB store for offline dictionary entries
4. Build download UI (available languages, size estimate, progress, delete)
5. Replace current `Dictionary.loadData()` with IndexedDB-based lookup

### Phase 3: Sunset Old System
1. Remove raw CSV download from CZH server
2. Remove client-side normalization (`normalizeEntry` functions move to Python only)
3. Remove old SQLite dictionary database (`DictionaryDB` → keep only `llm_cache` table)
4. Remove bundled dictionary JSON assets (no longer needed)

---

## Files to Touch

| File | Change |
|---|---|
| `apps/mobile/src/dictionary.ts` | Simplify: online lookup + offline IndexedDB fallback |
| `apps/mobile/src/dictionary-db.ts` | Replace with IndexedDB store + `llm_cache` SQLite table |
| `apps/mobile/src/dictionary-profile.ts` | Keep for download params; sunset `normalizeEntry` usage |
| `apps/mobile/src/dictionary-types.ts` | Adopt shared `DictionaryEntry`; remove `RawEntry` |
| `apps/mobile/src/api/python/` | Add `dictionaryLookup()` and `dictionaryDownload()` |
| `apps/mobile/contexts/DictionaryContext.tsx` | Add online/offline modes, download state, progress |
| New: `apps/mobile/components/DictionaryDownload.tsx` | Download UI with language selector and progress bar |
| `translations.csv` | Add ~15 new keys for download UI (see [i18n Keys](#i18n-keys)) |

---

## Consequences

### Positive
- **Unified types** — Mobile and Next.js share the same `DictionaryEntry` type and lookup API
- **Unified i18n** — All download UI strings come from `translations.csv` via `useT()`, same pipeline as Next.js (see ADR-0009)
- **L1-aware definitions** — Spanish speakers learning Japanese get Spanish definitions, not English
- **LLM fallback** — Rare words get AI-generated definitions instead of empty results
- **No freezing** — Server-side normalization + chunked IndexedDB writes eliminate the 10–30 second app freeze
- **Smaller downloads** — Frequency-filtered English-only JSON (~10–15 MB for 20K entries) vs. raw CSV (10–50 MB)
- **Single source of truth** — Normalization lives only on the Python server

### Negative
- **Offline dict requires server round-trip** — Users must download pre-built JSON from the Python server rather than raw CSV from a CDN. Mitigated by server-side caching.
- **Initial download is per-language** — Users must download each L2's dictionary separately. Acceptable trade-off for mobile space constraints.
- **Server dependency for updates** — Dictionary updates require a new download. Acceptable since dictionary data changes infrequently.

---

## i18n Keys

The offline dictionary UI introduces ~15 new translation keys. All follow the existing naming conventions (`title.*` for page titles, `msg.*` for descriptive text, `action.*` for buttons, `label.*` for UI element labels). Existing keys are reused wherever possible.

### New Keys Required

| Key | English Text | Used In |
|---|---|---|
| `title.offline_dictionaries` | Offline Dictionaries | Page title, Settings nav |
| `msg.offline_dictionaries_desc` | Download dictionaries to look up words without an internet connection. | Page subtitle |
| `msg.offline_definitions_english` | Definitions are in English | L1≠en callout header |
| `msg.offline_definitions_english_desc` | Offline dictionaries store English definitions. {l1} translations are added as you look up words online. | L1≠en callout body |
| `label.downloaded` | Downloaded | Section header |
| `label.available` | Available | Section header |
| `label.words` | {count, plural, one {# word} other {# words}} | Word count per language row |
| `action.download` | Download | Download button, confirm dialog |
| `action.update` | Update | Update button (refresh dictionary) |
| `action.delete_all` | Delete All Offline Data | Footer button |
| `msg.confirm_delete_dictionary` | Delete offline {lang} dictionary? You'll need internet to look up words. | Delete confirmation dialog |
| `msg.confirm_download_dictionary` | Download {lang} dictionary? | Download confirmation dialog |
| `label.download_size` | Size | Confirm dialog row |
| `msg.dictionary_ready` | {lang} dictionary ready | Completion dialog header |
| `msg.dictionary_ready_desc` | {count, plural, one {# word} other {# words}} available offline. Tap any word while watching to see definitions instantly. | Completion dialog body |
| `msg.downloading` | Downloading {lang}… | Progress bar, background banner |
| `label.download_progress` | {downloaded} of {total} words | Progress bar subtitle |
| `msg.download_failed` | Download failed — Tap to retry | Error state on language row |
| `msg.storage_usage` | Storage: {used} used of {free} free | Footer storage summary |

### Existing Keys Reused

| Key | English Text | Used For |
|---|---|---|
| `action.cancel` | Cancel | Cancel button in confirm/download dialogs |
| `action.delete` | Delete | Delete button per language row |
| `action.retry` | Retry | Implicit in `msg.download_failed` tap target |
| `action.close` | Close | Dismiss button in completion dialog ("OK") |
| `action.hide` | Hide | Hide button during background download |
| `action.more` | More | "Learn more" link in L1≠en callout |
| `label.saved` | Saved | Download status indicator ("Downloaded Jul 15") |
| `msg.tap_any_word_to_lookup` | Tap any word to see its definition | Used in `msg.dictionary_ready_desc` for consistency |
| `{$lang.xx}` | (language name) | Language name display — already in CSV for 207 languages |

### Key Naming Conventions

All new keys follow the established pattern from `translations.csv`:
- **`title.*`** — Page and section titles (noun phrases)
- **`msg.*`** — Full sentences, explanations, status messages
- **`action.*`** — Button labels and clickable actions (imperative verbs)
- **`label.*`** — UI element labels, status indicators, short noun phrases
- **ICU MessageFormat** — `{count, plural, ...}` for pluralization, `{lang}` for interpolation
