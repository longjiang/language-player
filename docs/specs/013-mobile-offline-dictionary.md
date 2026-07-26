# SPEC-013: Mobile Offline Dictionary — Online/Offline Hybrid Architecture

## Metadata
- **Spec ID**: SPEC-013
- **Feature**: Offline dictionary download + hybrid online/offline lookup for the mobile app
- **Status**: completed
- **Created**: 2026-07-25
- **ROADMAP Phase**: Phase 7+ — Mobile Integration / Dictionary Enhancement
- **Based on**: [ADR-0008: Mobile App Dictionary Architecture — Online Lookup + Offline Download](../adr/0008-go-dictionary-architecture.md)
- **See also**:
  - [ARCH-004: Python Dictionary DB Schema](../arch/004-python-dictionary-db-schema.md)
  - [ARCH-007: Next.js Dictionary Architecture](../arch/007-nextjs-dictionary-architecture.md)
  - [ADR-0006: Consolidated Lexical Data Types](../adr/0006-consolidated-lexical-data-types.md)
  - [ADR-0007: Dictionary Hub UX](../adr/0007-dictionary-hub-ux.md)

---

## Overview

The mobile app currently does **online-only dictionary lookup** via `POST /dictionary/lookup` → Python backend. This works when the user has internet, but fails completely offline. ADR-0008 proposes a three-tier architecture:

1. **Online lookup** — Same as today: `POST /dictionary/lookup` → Python backend (normalization, LLM fallback, L1 translation all server-side).
2. **Offline download** — New `GET /dictionary/download?l2=ja&l1=en&limit=30000` endpoint. Python server returns pre-normalized, frequency-filtered JSON. Stored client-side in SQLite.
3. **LLM cache** — Locally cache `match_type: "llm"` results in a dedicated SQLite table for offline availability.

The ADR was originally written for the legacy GO app (`apps/mobile-go-legacy/`). This spec adapts it for the new React Native/Expo app at `apps/mobile/`.

---

## Motivation

| Problem | Current State | Target State |
|---|---|---|
| No offline lookup | Dictionary fails entirely without network | Offline lookup returns results from downloaded dict + LLM cache |
| Repeated network calls | Same word looked up over and over hits the server | Memory cache + offline dict absorb repeated lookups |
| LLM results lost offline | LLM-generated definitions only available online | LLM cache persists LLM results locally |
| No L1≠en offline coverage | Non-English L1 users see nothing offline | English definitions shown offline; L1 translations accumulate lazily via online lookups |

---

## Current State in `apps/mobile`

### What Exists

| Component | File | Status |
|---|---|---|
| DictionaryContext | `contexts/DictionaryContext.tsx` | Online lookup only. `doSearch()` → `dict.lookup()` → `POST /dictionary/lookup`. Recent searches stored in SecureStore. No offline fallback, no download state, no LLM cache. |
| Dictionary Hub | `app/(tabs)/(vocab)/index.tsx` | Search bar + results + recent searches. No offline banner, no download prompt. |
| API client | `packages/api-client/src/dictionary.ts` | `useDictionary()` with `lookup`, `getEntry`, `tokenize`, `getSavedWords`, `saveWord`, `removeWord`. **No `downloadDictionary` method.** |
| Python backend | `zerotohero-python-server/routes/dictionary.py` | `/dictionary/lookup`, `/dictionary/lookup-batch`, `/dictionary/entry`. **No `/dictionary/download` endpoint.** |
| Python DB | `data/dictionaries.db` (SQLite) | 5 dedicated dict tables + wiktionary table. Frequency data exists for 40 languages. Ready to serve download queries. |
| Storage | — | **No SQLite or IndexedDB usage for dictionary data.** `expo-file-system` is used for EPUB and local media, but not for dictionary storage. |
| Settings | `app/(tabs)/(me)/settings.tsx` | Display / Playback / Speech / Review tabs. **No Offline Dictionaries section.** |
| Translations | `translations.csv` | Has `label.offline` but **none of the ~20 offline-dictionary-specific keys** from ADR-0008. `title.dictionary` exists. |

### What Does NOT Exist (Gaps)

1. **Python `/dictionary/download` endpoint** — Server-side bulk export of frequency-ordered dictionary entries.
2. **Mobile offline storage layer** — No local database for dictionary entries or LLM cache.
3. **Offline lookup fallback** — `DictionaryContext.doSearch()` has no offline code path.
4. **Download manager** — No download initiation, progress tracking, chunked storage, background continuation.
5. **Offline Dictionaries settings screen** — No UI to browse available languages, download/delete/update dictionaries.
6. **Dictionary Hub integration** — No banner prompting download, no inline prompt after online lookup.
7. **Language switcher indicator** — No visual indicator that current L2 has offline dictionary available.
8. **LLM cache** — No local persistence of LLM-generated entries.
9. **Memory cache** — No session-level `Map<string, DictionaryEntry[]>` cache to avoid redundant network calls within a session.
10. **i18n keys** — ~20 new keys needed for download UI (see [i18n Keys](#i18n-keys) below).

---

## Architecture

### Data Flow

```
┌──────────────────────────────────────────────────────┐
│                 Mobile App (React Native)             │
│                                                      │
│  DictionaryContext                                    │
│  ├─ doSearch(text)                                   │
│  │   ├─ 1. Check memory cache (Map<text, entries>)   │
│  │   ├─ 2. Check offline SQLite dict                 │
│  │   ├─ 3. Check llm_cache SQLite table              │
│  │   └─ 4. POST /dictionary/lookup (online)          │
│  │       ├─ cache result in memory Map               │
│  │       └─ if match_type === 'llm' → store llm_cache│
│  │                                                    │
│  ├─ downloadDict(l2, l1, limit?)                     │
│  │   └─ GET /dictionary/download                     │
│  │   └─ chunked insert → SQLite (non-blocking)        │
│  │                                                    │
│  ├─ deleteDict(l2) → DROP TABLE / clear store         │
│  └─ getDictStatus(l2) → { downloaded, count, date }  │
│                                                      │
├──────────────────────────────────────────────────────┤
│  Storage (expo-sqlite)                               │
│  ├─ dict_{l2} table: offline dictionary entries      │
│  │   (head, pronunciation, definitions JSON,          │
│  │    match_type, part_of_speech, level, etc.)        │
│  ├─ llm_cache table: (text, l1, l2) → entry JSON     │
│  └─ dict_meta table: per-l2 metadata                  │
│      (downloaded_at, entry_count, size_bytes)         │
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

### Lookup Priority (Client-Side)

```
doSearch(text)
  │
  ├─ 1. Memory cache (Map<string, DictionaryEntry[]>)
  │     Hit → return immediately (sub-millisecond)
  │
  ├─ 2. Offline SQLite (dict_{l2} table)
  │     SELECT * FROM dict_{l2} WHERE head = ? COLLATE NOCASE
  │     Hit → set match_type = 'exact', return
  │
  ├─ 3. LLM cache (llm_cache table)
  │     SELECT entry_json FROM llm_cache WHERE text = ? AND l1 = ? AND l2 = ?
  │     Hit → parse JSON, set match_type = 'llm', return
  │
  └─ 4. Online lookup (POST /dictionary/lookup)
        Success → cache in memory Map
        If match_type === 'llm' → store in llm_cache
        If word exists in curated dict but wasn't downloaded → don't auto-download
        Return results
```

### Storage Schema (expo-sqlite)

**Why SQLite over AsyncStorage/IndexedDB**: React Native has no built-in IndexedDB. `expo-sqlite` provides a synchronous API with `useSQLiteContext()` and is already the standard for local structured storage in Expo apps. The ADR's original recommendation of IndexedDB was for the GO app which ran in a webview; the new RN app uses native SQLite.

**Dictionary table** (one per downloaded L2):

```sql
CREATE TABLE IF NOT EXISTS dict_{l2} (
  id TEXT PRIMARY KEY,          -- scoped entry ID (e.g., "cedict-0")
  head TEXT NOT NULL,           -- dictionary headword
  pronunciation TEXT,           -- reading/phonetic
  definitions TEXT NOT NULL,    -- JSON array of definition strings
  part_of_speech TEXT,          -- noun, verb, etc.
  level TEXT,                   -- CEFR/HSK/JLPT level
  match_type TEXT DEFAULT 'exact',
  dict_id TEXT,                 -- "cedict", "edict", "wiktionary", etc.
  dict_name TEXT,               -- Human-readable dict name
  frequency REAL,               -- Zipf frequency (lower = rarer)
  phonetic_detail TEXT,         -- JSON: IPA, homograph, etc.
  classifier TEXT,              -- JSON: measure words with readings
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dict_{l2}_head ON dict_{l2}(head COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_dict_{l2}_frequency ON dict_{l2}(frequency);
```

**LLM cache table** (shared across all L2s):

```sql
CREATE TABLE IF NOT EXISTS llm_cache (
  text TEXT NOT NULL,
  l1 TEXT NOT NULL,
  l2 TEXT NOT NULL,
  entry_json TEXT NOT NULL,     -- full DictionaryEntry as JSON
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (text, l1, l2)
);
```

**Dictionary metadata table**:

```sql
CREATE TABLE IF NOT EXISTS dict_meta (
  l2 TEXT PRIMARY KEY,
  downloaded_at TEXT NOT NULL,
  entry_count INTEGER NOT NULL,
  size_bytes INTEGER,
  version TEXT                  -- MD5 hash of server response for update detection
);
```

### Download Sizing

The `/dictionary/download` endpoint returns English-definition entries ordered by frequency, capped at a configurable limit (default: 30,000). This keeps downloads small and fast while covering the vocabulary a typical learner needs:

| L2 | ISO 639-3 | Dict Table | Total Wiktionary | Freq Entries | Non-Freq Entries | Downloaded | Gzip Download | Est. Time |
|---|---|---|---|---|---|---|---|---|
| en | eng | wiktionary | 511,526 | 36,050 | 88,950 | 125,000 | ~9.0 MB | ~55s |
| zh | zho | cedict | 142,937 | 0 | 125,000 | 125,000 | ~8.7 MB | ~55s |
| ja | jpn | edict | 122,679 | 0 | 122,679 | 122,679 | ~4.8 MB | ~54s |
| fr | fra | wiktionary | 381,102 | 20,112 | 104,888 | 125,000 | ~3.4 MB | ~55s |
| it | ita | wiktionary | 598,609 | 19,773 | 105,227 | 125,000 | ~3.2 MB | ~55s |
| ko | kor | kengdic | 34,706 | 0 | 34,706 | 34,706 | ~1.5 MB | ~15s |
| nl | nld | wiktionary | 117,361 | 18,057 | 99,304 | 117,361 | ~3.8 MB | ~52s |
| de | deu | wiktionary | 290,619 | 17,686 | 107,314 | 125,000 | ~4.2 MB | ~55s |
| pt | por | wiktionary | 297,974 | 17,317 | 107,683 | 125,000 | ~3.4 MB | ~55s |
| es | spa | wiktionary | 243,711 | 15,895 | 109,105 | 125,000 | ~2.9 MB | ~55s |
| ar | ara | wiktionary | 122,123 | 14,726 | 107,397 | 122,123 | ~3.3 MB | ~54s |
| ca | cat | wiktionary | 136,259 | 14,449 | 110,551 | 125,000 | ~2.7 MB | ~55s |
| hu | hun | wiktionary | 68,991 | 13,810 | 55,181 | 68,991 | ~2.4 MB | ~31s |
| fi | fin | wiktionary | 214,142 | 13,272 | 111,728 | 125,000 | ~4.6 MB | ~55s |
| ru | rus | wiktionary | 419,467 | 12,825 | 112,175 | 125,000 | ~4.7 MB | ~55s |
| sv | swe | wiktionary | 109,133 | 12,570 | 96,563 | 109,133 | ~2.4 MB | ~48s |
| no | nob | wiktionary | 71,605 | 12,249 | 59,356 | 71,605 | ~1.6 MB | ~32s |
| ro | ron | wiktionary | 59,192 | 10,966 | 48,226 | 59,192 | ~1.5 MB | ~26s |
| tr | tur | wiktionary | 26,861 | 6,237 | 20,624 | 26,861 | ~0.7 MB | ~12s |
| … | … | … | … | … | … | … | … | … |


**40 languages** (those with Zipf frequency data in `dictionaries.db`) have entries to offer. The top 20K–30K words by frequency cover 95%+ of everyday text — far more than any learner will actively look up. The remaining 140+ Wiktionary languages have no frequency data and cannot offer frequency-ordered downloads until Zipf data is available.

**L1≠en users**: If the user's L1 is not English (e.g., a Spanish speaker learning Japanese), the offline dictionary still downloads English definitions. L1 definitions are accumulated lazily via online lookups. The `l1` parameter is passed to the server but does not affect the downloaded content — it's only used for cache-key purposes.

### Non-Blocking Chunked Loading

The current GO app's `Dictionary.loadData()` freezes because it processes 117K+ entries synchronously. In the new architecture:

- **Server-side normalization** — The Python backend does all CSV parsing and entry normalization. The mobile client only stores pre-built JSON.
- **Chunked SQLite writes** — Process 500 entries per tick, yielding to the main thread:

```typescript
async function loadEntries(
  entries: DictionaryEntry[],
  db: SQLiteDatabase,
  l2: string,
  onProgress: (pct: number) => void
) {
  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    await db.withTransactionAsync(async () => {
      for (const e of chunk) {
        await db.runAsync(
          `INSERT OR REPLACE INTO dict_${l2} (...) VALUES (...)`,
          ...serializeEntry(e)
        );
      }
    });
    onProgress(Math.min(100, Math.round((i + CHUNK) / entries.length * 100)));
    await new Promise(r => setTimeout(r, 0)); // yield to main thread
  }
}
```

---

## Implementation Plan

### Phase 1: Python Backend — `/dictionary/download` Endpoint

**File**: `zerotohero-python-server/routes/dictionary.py`

New endpoint:

```
GET /dictionary/download?l2=ja&l1=en&limit=30000
```

**Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `l2` | string | required | Target language code (e.g., `ja`) |
| `l1` | string | `en` | User's native language (for cache key only — definitions are always English) |
| `limit` | number | 30000 | Max entries to return (top by frequency) |

**Server-side flow:**
1. Query `dictionaries.db` SQLite directly — data is already normalized
   - Dedicated dicts: `SELECT * FROM {cedict|edict|kengdic|cccanto|klingonska} ORDER BY frequency DESC LIMIT ?`
   - Wiktionary: `SELECT * FROM wiktionary WHERE lang_code = ? ORDER BY frequency DESC LIMIT ?`
2. Definitions are always returned in English — no batch LLM translation at download time
3. Cache the result on disk (MD5 of `l2:limit` → JSON file) for subsequent identical requests
4. Return `{ entries: DictionaryEntry[], total: number, downloaded: number, version: string }`

**Response shape:**

```json
{
  "entries": [ /* DictionaryEntry[] */ ],
  "total": 22252,
  "downloaded": 22252,
  "version": "abc123def456"
}
```

**No CSV parsing needed** — the DB already contains all entries in their final normalized form. The `/dictionary/lookup` endpoint queries the same tables at runtime. The download endpoint just bulk-exports instead of single-lookup.

**Estimated download sizes** per language: ~500 bytes per entry (head, pronunciation, definitions, POS, level, phonetic_detail as JSON).

### Phase 2: API Client — Add `downloadDictionary`

**File**: `packages/api-client/src/dictionary.ts`

Add to `useDictionary()`:

```typescript
/** Download offline dictionary data. GET /dictionary/download */
downloadDictionary: (l2: string, l1?: string, limit?: number) =>
  apiClient.get<{
    entries: DictionaryEntry[];
    total: number;
    downloaded: number;
    version: string;
  }>('/dictionary/download', {
    params: { l2, l1: l1 ?? 'en', limit: limit ?? 30000 },
  }),
```

### Phase 3: Mobile Storage Layer

**New file**: `apps/mobile/lib/dictionary-db.ts`

Provides:
- `openDictionaryDB()` — initializes/opens the SQLite database with dict tables, llm_cache, and dict_meta
- `lookupOffline(text: string, l2: string): Promise<DictionaryEntry[] | null>` — exact match against `dict_{l2}` table
- `lookupLLMCache(text: string, l1: string, l2: string): Promise<DictionaryEntry[] | null>` — checks `llm_cache` table
- `storeLLMCacheEntry(text: string, l1: string, l2: string, entry: DictionaryEntry): Promise<void>`
- `bulkInsertEntries(l2: string, entries: DictionaryEntry[], onProgress: (pct: number) => void): Promise<void>` — chunked insert, 500/tick
- `deleteDictionary(l2: string): Promise<void>` — drops `dict_{l2}` table + removes from `dict_meta`
- `getDictMeta(l2: string): Promise<DictMeta | null>` — returns download status for a language
- `getAllDictMeta(): Promise<DictMeta[]>` — returns status for all downloaded languages
- `getStorageUsage(): Promise<{ usedBytes: number }>` — totals all dict tables

**Dependency**: `expo-sqlite` (already available in Expo SDK 57)

### Phase 4: DictionaryContext — Hybrid Lookup

**File**: `apps/mobile/contexts/DictionaryContext.tsx`

Changes:
1. Add in-memory `Map<string, DictionaryEntry[]>` for session cache (cleared on language switch)
2. `doSearch()` implements the 4-tier lookup chain:
   - Memory cache → Offline SQLite → LLM cache → Online lookup
3. Add download state management:
   ```typescript
   interface DownloadState {
     status: 'idle' | 'downloading' | 'completed' | 'failed';
     progress: number; // 0–100
     downloaded: number; // entries so far
     total: number; // total entries expected
     error?: string;
   }
   ```
4. Add actions:
   - `startDownload(l2: string)`
   - `cancelDownload(l2: string)`
   - `deleteDictionary(l2: string)`
   - `getDownloadState(l2: string): DownloadState`
5. On successful online lookup with `match_type: 'llm'`, auto-store in `llm_cache`
6. Recent searches remain in SecureStore (unchanged)

### Phase 5: UI — Offline Dictionaries Settings Screen

**New file**: `apps/mobile/app/(tabs)/(me)/offline-dictionaries.tsx`

This is the primary download management interface. The screen lists every L2 language the user has configured or recently used.

**Layout:**

```
┌──────────────────────────────────────┐
│  ← {title.offline_dictionaries}      │
│                                      │
│  {msg.offline_dictionaries_desc}     │
│                                      │
│  ┌──────────────────────────────────┐│
│  │ ⚠️  {msg.offline_definitions_    ││  ← Only shown when L1≠en
│  │     english}                      ││
│  │                                  ││
│  │ {msg.offline_definitions_        ││
│  │  english_desc}                    ││
│  │ [{$action.more}]                  ││
│  └──────────────────────────────────┘│
│                                      │
│  ── {label.downloaded} ──           │
│                                      │
│  {$lang.ja}  Japanese                │
│  ├─ 22,252 {label.words}  ~11 MB    │
│  ├─ ████████████░░░░  78%           │  ← Progress during download
│  └─ [{action.download}]  or         │
│      [{action.delete}] [↻ {action.  │
│       update}]                       │
│                                      │
│  {$lang.zh}  Chinese                 │
│  ├─ 30,000 {label.words}  ~15 MB    │
│  ├─ ✅ {label.saved}  Jul 15        │
│  └─ [{action.delete}] [↻ {action.   │
│       update}]                       │
│                                      │
│  ── {label.available} ──            │
│                                      │
│  ┌──────────────────────────────────┐│
│  │ 🔍 Search languages…      [✕]   ││  ← Filters by English name, native
│  └──────────────────────────────────┘│     name, ISO code, locale name
│                                      │
│  {$lang.ja}  Japanese  ★ Current    │  ← Current L2 always first
│  ├─ 22,252 {label.words}  ~11 MB    │
│  └─ [{action.download}]             │
│                                      │
│  {$lang.de}  German                  │  ← Remaining languages alpha-sorted
│  ├─ 17,686 {label.words}  ~9 MB     │
│  └─ [{action.download}]             │
│                                      │
│  ──────────────────────────────────  │
│  {msg.storage_usage}                 │
│  ──────────────────────────────────  │
│                                      │
│  [{action.delete_all}]               │
└──────────────────────────────────────┘
```

**Key UI elements:**

| Element | Behavior |
|---|---|
| **L1≠en callout** | Shown at top when user's L1 is not English. Dismissible; stored in AsyncStorage so it doesn't reappear. |
| **Language rows** | Grouped: "Downloaded" then "Available". Each row shows word count, estimated download size, and current status. |
| **Search bar** | Filters the Available list by English name, native name (e.g., "français"), ISO code, and localized name (e.g., "フランス語" in Japanese locale). Shown only in the Available section. |
| **Current L2 priority** | The user's current L2 language always appears first in the Available list (if not already downloaded), marked with a subtle "Current" badge. |
| **Download button** | Initiates download. Transforms into a progress bar during download. On completion, becomes a checkmark with date. |
| **Progress bar** | Updates per chunk (every 500 entries stored). Shows percentage + "{downloaded} of {total} words" below the bar. |
| **Delete button** | Removes the dict table for that language. Confirmation dialog before deleting. |
| **Update button** (↻) | Re-downloads the dictionary. Shows last download date. |
| **Storage summary** | Footer showing total offline storage used vs. available. |

### Phase 6: Dictionary Hub Integration

**File**: `apps/mobile/app/(tabs)/(vocab)/index.tsx`

**Dictionary Hub banner** — When a user opens the Dictionary Hub and no offline dictionary is downloaded for the current L2, a dismissible banner appears at the top:

```
┌──────────────────────────────────────┐
│ 💡 {msg.offline_dictionaries_desc}   │
│    [{action.download}] [{action.close}]│
└──────────────────────────────────────┘
```

Tapping `[{action.download}]` navigates to the Offline Dictionaries screen.

### Phase 7: Post-Download Indicators

1. **Language switcher indicator** — When the current L2 has an offline dictionary downloaded, a small green dot (●) appears beside the language name in the top bar language selector.
2. **Lookup result prompt** — When a dictionary lookup succeeds online but the word isn't in the offline dictionary, a small inline prompt appears below the result:
   > "💡 {msg.confirm_download_dictionary}"
   This only appears if no download is in progress and the user hasn't dismissed it recently (once per session).
3. **Settings entry point** — Add an "Offline Dictionaries" row to the Settings screen's main list (outside the 4 tabs, as a separate nav item).

### Phase 8: Memory Cache

Add a session-level `Map<string, DictionaryEntry[]>` to `DictionaryContext` that caches online lookup results. Cleared when L2 changes. This prevents redundant network calls when the user taps the same word multiple times in a session (common in video player and reader).

---

## Components to Build

| Component | File | Responsibility |
|---|---|---|
| `OfflineDictionariesScreen` | `app/(tabs)/(me)/offline-dictionaries.tsx` | Full download management UI |
| `DictionaryDB` (lib) | `lib/dictionary-db.ts` | SQLite schema, CRUD, lookup fallback |
| `DownloadProgressBar` | `components/dictionary/DownloadProgressBar.tsx` | Reusable progress bar used in settings + banner |
| `OfflineBanner` | `components/dictionary/OfflineBanner.tsx` | Dismissible banner for Dictionary Hub |
| `LookupSourceIndicator` | `components/dictionary/LookupSourceIndicator.tsx` | Small cloud/green-dot indicator |

---

## API Endpoints

| Endpoint | Method | Status | Description |
|---|---|---|---|
| `/dictionary/lookup` | POST | ✅ Exists | Online word lookup with LLM fallback + L1 translation |
| `/dictionary/lookup-batch` | POST | ✅ Exists | Batch lookup for multiple words |
| `/dictionary/entry` | GET | ✅ Exists | Fetch single entry by dict ID + scoped entry ID |
| `/dictionary/download` | GET | ⬜ **NEW** | Bulk-export entries using two-tier selection: frequency-ranked first, then by definition length, capped at 125,000 |

---

## i18n Keys

All new keys follow the established naming conventions from `translations.csv`. **Existing keys are reused wherever possible** (e.g., `action.cancel`, `action.delete`, `action.close`, `label.saved`, `{$lang.xx}`).

### New Keys Required (~20 keys)

| Key | English Text | Used In |
|---|---|---|
| `title.offline_dictionaries` | Offline Dictionaries | Page title, Settings nav |
| `msg.offline_dictionaries_desc` | Download dictionaries to look up words without an internet connection. | Page subtitle, Dictionary Hub banner |
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
| `action.cancel` | Cancel | Cancel button |
| `action.delete` | Delete | Delete button per language row |
| `action.close` | Close | Dismiss button |
| `action.hide` | Hide | Hide button during background download |
| `action.more` | More | "Learn more" link in L1≠en callout |
| `label.saved` | Saved | Download status indicator |
| `{$lang.xx}` | (language name) | Language name display — already in CSV for 207 languages |

---

## Files to Touch

| File | Change |
|---|---|
| **Python Backend** | |
| `zerotohero-python-server/routes/dictionary.py` | Add `GET /dictionary/download` endpoint |
| **Shared Packages** | |
| `packages/api-client/src/dictionary.ts` | Add `downloadDictionary()` method |
| `packages/shared/src/types.ts` | Add `DownloadResponse`, `DictMeta` types |
| **Mobile App — Storage** | |
| `apps/mobile/lib/dictionary-db.ts` | **NEW** — SQLite schema, offline lookup, chunked insert, LLM cache |
| **Mobile App — Context** | |
| `apps/mobile/contexts/DictionaryContext.tsx` | Add memory cache, offline fallback chain, download state, LLM cache auto-store |
| **Mobile App — Screens** | |
| `apps/mobile/app/(tabs)/(me)/offline-dictionaries.tsx` | **NEW** — Download management screen |
| `apps/mobile/app/(tabs)/(vocab)/index.tsx` | Add OfflineBanner when no dict downloaded for current L2 |
| `apps/mobile/app/(tabs)/(me)/settings.tsx` | Add "Offline Dictionaries" nav row |
| **Mobile App — Components** | |
| `apps/mobile/components/dictionary/DownloadProgressBar.tsx` | **NEW** — Reusable progress bar |
| `apps/mobile/components/dictionary/OfflineBanner.tsx` | **NEW** — Dismissible banner |
| `apps/mobile/components/dictionary/LookupSourceIndicator.tsx` | **NEW** — Cloud/green-dot indicator |
| `apps/mobile/components/layout/LanguageSwitcher.tsx` | Add green dot indicator for L2s with offline dict |
| **Translations** | |
| `translations.csv` | Add ~20 new keys (see [i18n Keys](#i18n-keys)) |

---

## Dependencies

- `expo-sqlite` — SQLite database for offline dictionary storage + LLM cache (included in Expo SDK 57)
- `expo-file-system` — Already used in the app for EPUB/local media; may be useful for checking free storage space
- `@langplayer/shared` — `DictionaryEntry`, `DictionaryLookupResponse` types already exist; add `DownloadResponse`, `DictMeta`
- `@langplayer/api-client` — Add `downloadDictionary()` method
- Python backend: `GET /dictionary/download` endpoint (Phase 1 prerequisite)

---

## Edge Cases & States

| State | Handling |
|---|---|
| **Download in progress, user navigates away** | Download continues in background. Persistent mini-banner at bottom of main screens: "↓ {msg.downloading} … 62%". Tapping returns to Offline Dictionaries screen. |
| **Download fails (network drop)** | Row shows "⚠️ {msg.download_failed}". Partial data is discarded (not left in broken state). User can tap to retry. |
| **Download fails (server error)** | Same error state. Error message includes server status code if available. |
| **Storage full** | Check available space before download. Show error: "Not enough storage. Free up space and try again." |
| **L1≠en user, offline** | Shows English definitions from downloaded dict. L1 translations are not available offline until the user has looked up that specific word online (which caches the L1 result in `llm_cache`). |
| **L2 switch during download** | Download continues for the original L2. UI shows separate status per language. |
| **No frequency data for L2** | Language not shown in "Available" section. Only 40 languages have Zipf frequency data. |
| **App restart during download** | Download is not resumable. On restart, partial data is detected and cleaned up. User must re-download. (Future: resumable downloads could use Range headers if needed.) |
| **Very large dictionary (en: 36K entries)** | Cap at 30,000. Chunked loading (500/tick) ensures UI stays responsive. |
| **Multiple devices, same user** | Each device downloads dictionaries independently. No cloud sync of downloaded dictionaries (too large). |
| **Dictionary update on server** | User sees "Update" button with last download date. Must manually re-download to get new entries. Server-side `version` hash changes. |

---

## Backward Compatibility

- Existing online lookup via `POST /dictionary/lookup` is unchanged. The offline fallback is purely additive.
- `DictionaryContext` API expands but does not break existing consumers (`doSearch`, `clearSearch`, `results`, `loading`, etc. remain).
- Recent searches in SecureStore are unchanged.
- No migration needed for existing users — they simply start with no downloaded dictionaries and continue online-only until they choose to download.

---

## Open Questions

1. **Resumable downloads?** The spec currently discards partial downloads on failure. Should we support resumable downloads via HTTP Range headers? This adds complexity but would help users on slow/unreliable connections. **Decision: Defer to v2 — not in initial implementation.**

2. **Auto-update?** Should dictionaries auto-update in the background when the server version changes, or should updates always be manual? **Decision: Manual updates with a visual indicator when an update is available (based on server `version` hash mismatch).**

3. **Dictionary DB encryption?** Should the offline SQLite database be encrypted? `expo-sqlite` supports SQLCipher but it adds complexity. Dictionary data is not sensitive (it's publicly available dictionary entries). **Decision: No encryption needed.**

4. **Offline-only mode?** Should there be a global "offline mode" toggle that suppresses all network requests? This is a broader feature beyond dictionary. **Decision: Out of scope for this spec.**

5. **Pre-bundled dictionary?** Should we ship a small "starter" dictionary (top 1,000 words) bundled with the app so users have immediate offline capability without downloading? **Decision: Defer. The download UX (banner + prompt) is sufficient for initial implementation.**
