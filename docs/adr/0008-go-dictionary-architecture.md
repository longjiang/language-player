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
│  ├─ Query dictionaries.db SQLite directly             │
│  ├─ JOIN word_frequency → filter & sort by frequency  │
│  ├─ Cache result (MD5 hash → disk)                   │
│  └─ Return JSON: { entries, total, downloaded }      │
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

### Offline Download (Phase 2)

**New Python endpoint:** `GET /dictionary/download`

| Param | Type | Default | Description |
|---|---|---|---|
| `l2` | string | required | Target language code (e.g. `ja`) |
| `l1` | string | `en` | User's native language for definitions |
| `limit` | number | 50000 | Max entries to return (top by frequency) |

**Server-side flow:**
1. Query `dictionaries.db` SQLite directly — data is already normalized (see `docs/python-dictionary-db-schema.md`)
   - Dedicated dicts: `SELECT * FROM {cedict|edict|kengdic|cccanto|klingonska}` (language is the table itself)
   - Wiktionary: `SELECT * FROM wiktionary WHERE lang_code = ?` (~800 languages, one table)
2. JOIN with `word_frequency` to filter top N entries by Zipf score, then sort descending
3. If `l1 !== 'en'`, optionally batch-translate definitions via DeepSeek LLM
4. Cache the result on disk (MD5 of `l2:l1:limit` → JSON file)
5. Return `{ entries: DictionaryEntry[], total: number, downloaded: number }`

**No CSV parsing needed** — the database already contains all entries in their final normalized form. The `/dictionary/lookup` endpoint queries the same tables at runtime. The download endpoint just bulk-exports instead of single-lookup.

**Client-side storage:** IndexedDB (via `expo-sqlite` or a dedicated key-value store). IndexedDB is preferred over SQLite for this use case because:
- No normalization needed — JSON is already `DictionaryEntry[]`
- Async by default — no main thread blocking
- Simpler schema: one object store, keyed by `entry.id`
- Built-in indexing via `createIndex()` for head word and pronunciation search

**Download UI:** A settings page section where users can download offline dictionaries per language. Shows:
- Available languages with download size estimate
- Progress bar during download (chunked storage yields regular progress updates)
- "Delete offline data" button

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
1. Add Python `/dictionary/download` endpoint (server-side normalization + frequency filtering + caching)
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
- **Smaller downloads** — Frequency-filtered JSON (e.g., 5 MB for top 50K words) vs. raw CSV (10–50 MB)
- **Single source of truth** — Normalization lives only on the Python server

### Negative
- **Offline dict requires server round-trip** — Users must download pre-built JSON from the Python server rather than raw CSV from a CDN. Mitigated by server-side caching.
- **Initial download is per-language** — Users must download each L2's dictionary separately. Acceptable trade-off for mobile space constraints.
- **Server dependency for updates** — Dictionary updates require a new download. Acceptable since dictionary data changes infrequently.
