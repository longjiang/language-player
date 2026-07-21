# ADR 0008: GO App Dictionary Architecture — Online Lookup + Offline Download

> **Status:** Proposed
> **Date:** 2026-07-21
> **Replaces:** Current GO offline CSV-based dictionary (`src/dictionary.ts`, `src/dictionary-db.ts`, `src/dictionary-profile.ts`)
> **See also:**
> - `docs/adr/lp-nextjs-dictionary-architecture.md` — Next.js server-side dictionary
> - `docs/adr/lp-classic-dictionary-architecture.md` — Classic Nuxt reference
> - `docs/adr/0006-consolidated-lexical-data-types.md` — ADR-0006 lexical types
> - `docs/adr/0007-dictionary-hub-ux.md` — Dictionary Hub UX

---

## Context

The GO app currently downloads raw CSV dictionary files (10–50 MB each) from a legacy CZH server, parses and normalizes them client-side, and loads them into a local SQLite database. This has four problems:

1. **App-freezing load** — Parsing and normalizing 117K+ entries blocks the main thread for 10–30 seconds.
2. **English-only definitions** — No L1 translation, unlike the Next.js web app which uses LLM-powered translation.
3. **No LLM fallback** — Words not in the curated dictionaries return nothing.
4. **Duplicated normalization** — The Python backend already normalizes entries for `/dictionary/lookup`; GO duplicates this logic client-side.

The Next.js web app uses a clean server-side architecture: `POST /dictionary/lookup` → Python backend → returns normalized `DictionaryEntry[]` with LLM fallback for missing words and LLM translation for non-English L1s. The GO app should adopt this pattern for online use, while adding an offline download capability suited to mobile.

---

## Decision

**Three-tier dictionary architecture for the GO app:**

1. **Online lookup** — Same as Next.js: `POST /dictionary/lookup` → Python backend. All normalization, LLM fallback, and L1 translation happen server-side.
2. **Offline download** — New `GET /dictionary/download?l2=ja&l1=en&limit=50000` endpoint. Python server returns pre-normalized, frequency-filtered JSON. No client-side normalization needed.
3. **LLM cache** — Locally cache `match_type: "llm"` results in a dedicated SQLite table for offline availability.

---

## Architecture

### Data Flow

```
┌──────────────────────────────────────────────────────┐
│                    GO App (React Native)              │
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

The `@langplayer/api-client` already exports `useDictionary().lookup(text, l2, l1)` which wraps `POST /dictionary/lookup`. The GO app wires this into its `DictionaryContext` as the primary lookup path.

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
   > "📚 Download offline dictionary for {$lang.xx} — look up words anytime, even without internet"
   > [Download] [Dismiss]

2. **Settings → Offline Dictionaries** — A dedicated settings section accessible from the main Settings screen. This is the primary management interface.

3. **Lookup result prompt** — When a dictionary lookup succeeds online but the word isn't in the offline dictionary, a small inline prompt appears below the result:
   > "💡 Save this word offline? [Download {$lang.xx} dictionary]"
   This only appears if no download is in progress and the user hasn't dismissed it recently (once per session).

#### Settings → Offline Dictionaries Screen

This is the primary download management interface. The screen lists every L2 language the user has configured or recently used.

```
┌──────────────────────────────────────┐
│  ← Offline Dictionaries              │
│                                      │
│  Download dictionaries to look up    │
│  words without an internet           │
│  connection.                         │
│                                      │
│  ┌──────────────────────────────────┐│
│  │ ⚠️  Definitions are in English   ││  ← Only shown when L1≠en
│  │                                  ││
│  │ Offline dictionaries store       ││
│  │ English definitions. {$lang.xx}  ││
│  │ translations are added as you    ││
│  │ look up words online. [Learn     ││
│  │ more]                            ││
│  └──────────────────────────────────┘│
│                                      │
│  ── Your Languages ──                │
│                                      │
│  {$lang.ja}  Japanese                │
│  ├─ 22,252 words  ~11 MB             │
│  ├─ ████████████░░░░  78%           │  ← Progress during download
│  └─ [Download]  or  [Delete] [↻]    │     Delete + Update when downloaded
│                                      │
│  {$lang.zh}  Chinese                 │
│  ├─ 30,000 words  ~15 MB             │
│  ├─ ✅ Downloaded  Jul 15           │
│  └─ [Delete] [↻ Update]             │
│                                      │
│  {$lang.fr}  French                  │
│  ├─ 20,112 words  ~10 MB             │
│  └─ [Download]                       │
│                                      │
│  ── Other Languages ──               │
│                                      │
│  {$lang.de}  German                  │
│  ├─ 17,686 words  ~9 MB              │
│  └─ [Download]                       │
│                                      │
│  {$lang.ko}  Korean                  │
│  ├─ 19,291 words  ~10 MB             │
│  └─ [Download]                       │
│                                      │
│  ──────────────────────────────────  │
│  Storage: 26 MB used of 48 MB free   │
│  ──────────────────────────────────  │
│                                      │
│  [Delete All Offline Data]           │
└──────────────────────────────────────┘
```

**Key UI elements:**

| Element | Behavior |
|---|---|
| **L1≠en callout** | Shown at top when user's L1 is not English. Explains English-only offline definitions with a link to a help doc or expands inline. Dismissible; stored in AsyncStorage so it doesn't reappear. |
| **Language rows** | Grouped: "Your Languages" (L2s the user has configured or recently used) then "Other Languages" (all remaining available languages). Each row shows word count, estimated download size, and current status. |
| **Download button** | Initiates `GET /dictionary/download?l2=xx&l1=en`. Transforms into a progress bar during download. On completion, becomes a checkmark with date. |
| **Progress bar** | Updates per chunk (every 500 entries stored). Shows percentage + "X of Y words" below the bar. Download runs in background — user can navigate away and return. |
| **Delete button** | Removes the IndexedDB store for that language. Confirmation dialog: "Delete offline {$lang.xx} dictionary? You'll need internet to look up words." |
| **Update button** (↻) | Re-downloads the dictionary (e.g., after server-side data updates). Shows last download date so user knows if an update is needed. |
| **Storage summary** | Footer showing total offline storage used vs. available (estimated from device info). Helps users manage space. |
| **Delete All** | Nuke option at the bottom. Confirmation with destructive styling. |

#### Download Flow

```
User taps [Download]
        │
        ▼
┌──────────────────────┐
│  Confirm Download    │
│                      │
│  Download {$lang.ja} │
│  dictionary?         │
│                      │
│  Size: ~11 MB        │
│  Words: 22,252       │
│                      │
│  Definitions are in  │  ← Only when L1≠en
│  English.            │
│                      │
│  [Cancel]  [Download]│
└──────────────────────┘
        │
        ▼  (user confirms)
┌──────────────────────────────────┐
│  ↓ Downloading {$lang.ja}...     │
│  ████████████░░░░░░  62%         │
│  13,844 of 22,252 words          │
│                                  │
│  [Hide]  ← runs in background   │
└──────────────────────────────────┘
        │
        ▼  (completes)
┌──────────────────────────────────┐
│  ✅ {$lang.ja} dictionary ready  │
│                                  │
│  22,252 words available offline. │
│  Tap any word while watching to  │
│  see definitions instantly.      │
│                                  │
│  [OK]                            │
└──────────────────────────────────┘
```

**Background download:** If the user navigates away, the download continues. A persistent mini-banner appears at the bottom of the main screens (like a music player mini-player): "↓ Downloading {$lang.ja} dictionary… 62%". Tapping it returns to the Offline Dictionaries screen.

**Error handling:** If the download fails (network drop, server error), the row shows "⚠️ Download failed — Tap to retry". The partial data is discarded (not left in a broken state).

#### Post-Download Experience

Once a dictionary is downloaded, the app subtly indicates offline availability:

- **Dictionary Hub:** Language pairs with offline dictionaries show a small "📚" icon next to the language name in the language selector.
- **Video player:** When the user taps a word in subtitles and the lookup returns instantly from the offline dictionary, no special indicator is shown — speed is the reward. Only when the word is NOT in the offline dictionary and requires a network request does a small "🌐" icon appear momentarily.
- **Settings → Offline Dictionaries:** Shows "Last updated: Jul 15" with an update button, so users can periodically refresh.

### Non-Blocking Loading (Phase 2)

The current `Dictionary.loadData()` freezes the app because it processes 117K+ entries synchronously on the main thread. The new architecture eliminates this entirely:

- **Server-side normalization** — The Python backend does all CSV parsing and entry normalization. The GO client only stores pre-built JSON.
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
1. Add `dictionaryLookup(text, l2, l1)` to `src/api/python/` (wraps `POST /dictionary/lookup`)
2. Wire into `DictionaryContext` as primary lookup path
3. Add memory cache (`Map<string, DictionaryEntry[]>`) for session reuse
4. Add `llm_cache` SQLite table for `match_type: 'llm'` results
5. Keep existing offline SQLite dictionary as fallback during migration

### Phase 2: Offline Download
1. Add Python `/dictionary/download` endpoint (direct SQLite query: `ORDER BY frequency DESC LIMIT ?`) with server-side caching
2. Add `downloadDictionary(l2, l1)` to GO's API layer
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

| Current File | Change |
|---|---|
| `src/dictionary.ts` | Simplify: online lookup + offline IndexedDB fallback |
| `src/dictionary-db.ts` | Replace with IndexedDB store + `llm_cache` SQLite table |
| `src/dictionary-profile.ts` | Keep for download params; sunset `normalizeEntry` usage |
| `src/dictionary-types.ts` | Adopt shared `DictionaryEntry`; remove `RawEntry` |
| `src/api/python/` | Add `dictionaryLookup()` and `dictionaryDownload()` |
| `contexts/DictionaryContext.tsx` | Add online/offline modes, download state, progress |
| New: `components/DictionaryDownload.tsx` | Download UI with language selector and progress bar |

---

## Consequences

### Positive
- **Unified types** — GO and Next.js share the same `DictionaryEntry` type and lookup API
- **L1-aware definitions** — Spanish speakers learning Japanese get Spanish definitions, not English
- **LLM fallback** — Rare words get AI-generated definitions instead of empty results
- **No freezing** — Server-side normalization + chunked IndexedDB writes eliminate the 10–30 second app freeze
- **Smaller downloads** — Frequency-filtered English-only JSON (~10–15 MB for 20K entries) vs. raw CSV (10–50 MB)
- **Single source of truth** — Normalization lives only on the Python server

### Negative
- **Offline dict requires server round-trip** — Users must download pre-built JSON from the Python server rather than raw CSV from a CDN. Mitigated by server-side caching.
- **Initial download is per-language** — Users must download each L2's dictionary separately. Acceptable trade-off for mobile space constraints.
- **Server dependency for updates** — Dictionary updates require a new download. Acceptable since dictionary data changes infrequently.
