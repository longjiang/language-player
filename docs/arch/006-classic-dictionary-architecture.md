# Dictionary Architecture — Classic Nuxt App

> Reference document for re-implementing dictionary features in the Next.js app.
> Based on analysis of `zerotohero-nuxt/dist/js/` and `zerotohero-nuxt/lib/languages.js`.

---

## 1. Overview

The Classic app uses a **multi-dictionary architecture** where different L2 (target) languages get different dictionary backends. Each dictionary is a class extending `BaseDictionary` and runs in a **Web Worker** for off-main-thread processing.

### Selection Logic

When a user picks an L1→L2 pair, the system determines which dictionary to load via a two-layer lookup:

```
Layer 1: dictionaries.csv.txt (26 explicit L1→L2→dictionary mappings)
Layer 2: data.wiktionary_langs (blanket coverage for ~800 languages via Wiktionary)
```

The selected dictionary name (e.g., `"edict"`) is passed to a `WorkerModuleLoader` which instantiates `EdictDictionary` in a Web Worker.

### Lifecycle

```
1. User selects L1=en, L2=ja
2. language object gets dictionaries = { jpn: ["edict", "wiktionary-csv"] }
3. App picks first dictionary: "edict"
4. WorkerModuleLoader.load("edict-dictionary", { l1, l2 })
5. Web Worker: importScripts → new EdictDictionary() → loadData()
6. Data loaded into IndexedDB (cache) → Fuse.js index built → ready
7. Tokenizer created with word set from dictionary
8. Subtitle text → tokenize → lookup each token → candidates[] assigned
9. User clicks word → popup shows candidates with definitions
```

---

## 2. Base Dictionary (`base-dictionary.js`)

All dictionaries inherit from `BaseDictionary`. Core responsibilities:

| Method | Purpose |
|---|---|
| `load()` | Static factory — creates instance, loads data, builds indices |
| `loadData()` | Abstract — each subclass implements its own data loading |
| `loadDictionaryData({ name, file })` | Cache-then-network: try IndexedDB first, fetch if missing |
| `loadAndNormalizeDictionaryData()` | Load + normalize + filter empty entries |
| `createIndices()` | Build `searchIndex{}` hash map for O(1) word lookup |
| `createSearcher()` | Build Fuse.js instance for fuzzy search |
| `addCandidatesToToken(token)` | Lookup token text + lemmas, assign `token.candidates[]` |
| `tokenizeWithCache(text)` | Tokenize text, then enrich each token with candidates |
| `lookupMultiple(text)` | Exact + fuzzy lookup, return sorted candidates |
| `inflect(text)` | Language-specific inflection (e.g., Japanese conjugation) |

### Data Loading Pattern (Cache-Then-Network)

```
loadDictionaryData({ name, file })
  → localforage.getItem(name)          // Try IndexedDB
  → if MISSING:
      → axios.get(file)                // Network fetch
      → localforage.setItem(name, data) // Persist to IndexedDB
  → Papa.parse(data)                   // CSV → array of objects
  → return parsed data
```

IndexedDB is used as a **persistent cache** — raw CSV text stored by dictionary name + version. On subsequent visits, data loads instantly from IndexedDB with zero network requests.

### Token Enrichment Flow

```
Raw token: { text: "食べます" }
  ↓
addCandidatesToToken(token)
  ↓
lookupMultiple("食べます")  → no exact match
  ↓ (check lemmas from inflector)
lemma: "食べる" → lookupMultiple("食べる") → HIT!
  ↓
token.candidates = [
  { id: "taberu", head: "食べる", definitions: ["to eat"], level: 5, pos: "verb" }
]
  ↓
Sort by level (lowest first), deduplicate by id
```

---

## 3. Dictionary Catalog

### 3.1 `hsk-cedict-dictionary.js` — Chinese

| Property | Value |
|---|---|
| **L2 codes** | `zho, cmn, cdo, cjy, cnp, cpx, csp, czo, gan, hak, hsn, ltc, lzh, mnp, nan, och, wuu, yue, zha` |
| **L1 codes** | `eng` (English) only |
| **Data files** | `data/hsk-cedict/hsk_cedict.csv.txt`, `data/hsk-cedict/hsk_characters.csv.txt`, `data/hsk-cedict/new_hsk.csv.txt` |
| **Source** | [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cedict) + HSK level annotations |
| **License** | Creative Commons Attribution-ShareAlike 4.0 |
| **Index keys** | `simplified`, `traditional` |
| **Special features** | Character-level lookup, HSK level per word, New HSK 2021 support, weight-based ranking |

**Data format (hsk_cedict.csv.txt):**
```
hskId,simplified,traditional,pinyin,definitions,book,hsk,lesson,dialog,nw,example,exampleTranslation,oofc,pn,weight,index
```

**Word normalization:**
- `head = simplified`
- `alternate = traditional`
- `pronunciation = pinyin`
- `definitions = split('/')`
- `level = hsk` (1-6)
- `rank = weight / maxWeight`

### 3.2 `chinese-dialect-dictionary.js` — Chinese Dialects

| Property | Value |
|---|---|
| **L2 codes** | `yue` (Cantonese), `hak` (Hakka), `nan` (Min Nan) |
| **L1 codes** | `zho` (Chinese), `eng` (English, via explicit CSV) |
| **Data files** | `data/cc-canto/cccanto-webdist.csv.txt`, `data/dict-hakka/dict-hakka.csv.txt`, `data/dict-twblg/dict-twblg.csv.txt` |
| **Index keys** | `traditional`, `simplified` |
| **Special** | Provides Mandarin definitions for dialect words. Pinyin + pronunciation indexing. |

### 3.3 `edict-dictionary.js` — Japanese

| Property | Value |
|---|---|
| **L2 codes** | `jpn` (Japanese) |
| **L1 codes** | `eng` (English) |
| **Data files** | `data/edict/edict.tsv.txt`, `data/wiktionary-csv/jpn-eng.csv.txt` (supplement), `data/ja-accents/accents.csv.txt` (pitch accents) |
| **Source** | [JMdict/EDICT](https://www.edrdg.org/jmdict/j_jmdict.html) |
| **Index keys** | `kanji`, `kana`, `romaji`, `search` |
| **Special features** | Romaji conversion (wanakana), pitch accent data for ~5,000 words, comprehensive POS lookup table, Wiktionary supplement merge |

**Pitch accent data (accents.csv.txt):**
```
word,reading,accent_pattern
```

### 3.4 `kdic-jc-dictionary.js` — Japanese→Chinese

| Property | Value |
|---|---|
| **L2 codes** | `jpn` (Japanese) |
| **L1 codes** | `zho` (Chinese) |
| **Data files** | `data/kdic-jc/kdic-jc.tsv.txt` |
| **Source** | StarDict `kdic-jc` (Japanese-Chinese dictionary) |
| **Index keys** | `kana`, `romaji`, `search` |
| **Special** | Provides Chinese definitions for Japanese words. Romaji auto-generated. |

### 3.5 `kengdic-dictionary.js` — Korean

| Property | Value |
|---|---|
| **L2 codes** | `kor` (Korean) |
| **L1 codes** | `eng` (English), `zho` (Chinese) |
| **Data files** | `data/kengdic/kengdic_2011.tsv.txt`, `data/wiktionary-csv/kor-eng.csv.txt`, `data/wiktionary-csv/kor-zho.csv.txt` |
| **Source** | [kengdic](https://github.com/garfieldnate/kengdic) (Joe Speigle) |
| **Special** | For `eng` L1: loads kengdic + Wiktionary supplement merged. For `zho` L1: Wiktionary only. |

### 3.6 `freedict-dictionary.js` — European Languages

| Property | Value |
|---|---|
| **L2 codes** | `slk, ady, afr, ast, deu, hrv, hun, isl, kur, lit` (10 languages) |
| **L1 codes** | `eng` (English) |
| **Data files** | `data/freedict/{l2_iso639_3}-eng.dict.txt` |
| **Source** | [FreeDict](https://freedict.org/) |
| **Special** | Custom parser for `headword /definition/` format. Multi-line definition support. Used only for languages not covered by Wiktionary. |

### 3.7 `open-russian-dictionary.js` — Russian

| Property | Value |
|---|---|
| **L2 codes** | `rus` (Russian) |
| **L1 codes** | `eng` (English) |
| **Data files** | `data/openrussian/words_with_definitions_pronunciation.csv.txt`, `data/wiktionary-csv/rus-eng.csv.txt` (supplement) |
| **Source** | [OpenRussian.org](https://en.openrussian.org/about) |
| **Special** | Stress/accent mark handling. Merges OpenRussian + Wiktionary data. |

### 3.8 `wiktionary-csv-dictionary.js` — Universal (~800 languages)

| Property | Value |
|---|---|
| **L2 codes** | ~800+ languages (every language with a Wiktionary CSV dump on the server) |
| **L1 codes** | `eng` (English) — primary. `zho` (Chinese) — Korean only. |
| **Data files** | `data/wiktionary-csv/{l2_iso639_3}-eng.csv.txt` (~800 files) |
| **Source** | [Wiktionary](https://en.wiktionary.org/) parsed by [wiktextract](https://github.com/tatuylonen/wiktextract) |
| **License** | Creative Commons Attribution-ShareAlike 3.0 |
| **Index keys** | `search`, `head` |

**Language code mappings (`l2Code_mappings`):**
```
hrv→hbs, nor→nob, srp→hbs, bos→hbs, cnr→hbs, run→kin,
hbo→heb, grc→ell, hmn→mww, prs→fas, arb→ara, zsm→msa,
lvs→lav, ekk→est, kur→kmr
```

**Supplemental language merges (`supplementalLangs`):**
Languages where Wiktionary data is supplemented from a related language:
```
arz→ara, bul→mkd, ceb→tgl, ind→msa, mkd→bul, msa→ind,
nob→nno, nor→nno, sco→eng, tgl→ceb, wol→fra, vec→ita, ...
```

**This is the catch-all dictionary.** Any language not covered by the specialized dictionaries above falls through to Wiktionary CSV. It handles:
- ISO 639-3 code mapping (divergent codes → canonical Wiktionary codes)
- Supplemental word lists (e.g., Malay gets Indonesian words added)
- Levenshtein-based fuzzy matching
- Strip-accents normalization for search

### 3.9 `klingonska-dictionary.js` — Klingon

| Property | Value |
|---|---|
| **L2 codes** | `tlh` (Klingon) |
| **L1 codes** | `eng` (English) |
| **Data files** | `data/klingonska/dict.zdb.txt` |
| **Source** | [klingonska.org](http://klingonska.org/dict/) |
| **Special** | Custom parser for block-based dictionary format. IPA pronunciation support. |

---

## 4. Dictionary Assignment System

### 4.1 Explicit Assignments (`dictionaries.csv.txt`)

```
l2,l1,dictionary
jpn,eng,edict          # Japanese ← English via EDICT
jpn,zho,kdic-jc        # Japanese ← Chinese via kdic-jc
kor,eng,kengdic        # Korean ← English via Kengdic
kor,zho,kengdic        # Korean ← Chinese via Kengdic (wiktionary only)
rus,eng,wiktionary-csv # Russian ← English (overridden by open-russian)
tlh,eng,klingonska     # Klingon ← English
zho,eng,hsk-cedict     # Chinese ← English via HSK CEDICT
yue,eng,chinese-dialect # Cantonese ← English
hak,zho,chinese-dialect # Hakka ← Chinese
nan,zho,chinese-dialect # Min Nan ← Chinese
... (26 entries total covering all Chinese dialect variants)
```

### 4.2 Wiktionary Blanket (`data.wiktionary_langs`)

```javascript
{
  eng: "aaa aab aac ... zho zul",  // ~800 ISO 639-3 codes, space-separated
  zho: ["kor"],                      // Chinese only covers Korean
}
```

For English L1, **every language with a Wiktionary dump** gets `wiktionary-csv` assigned. This covers the vast majority of the 60+ supported languages.

### 4.3 Assignment Code (`assignDictionaries`)

```javascript
// Step 1: Explicit CSV entries
for (let dict of dictionariesCSV) {
  let l1 = l1s.find(l => l.iso639_3 === dict.l1);
  l1.dictionaries[dict.l2] = l1.dictionaries[dict.l2] || [];
  l1.dictionaries[dict.l2].push(dict.dictionary);
}

// Step 2: Wiktionary blanket for English + Chinese
for (let l1_iso in wiktionary_langs) {
  let l1_obj = l1s.find(l => l.iso639_3 === l1_iso);
  for (let l2_iso of wiktionary_langs[l1_iso]) {
    l1_obj.dictionaries[l2_iso].push("wiktionary-csv");
  }
}

// Special: English has explicit overrides for Leizhou and Hainanese Min
l1_eng.dictionaries["leiz1236"] = ["hsk-cedict"];
l1_eng.dictionaries["hain1238"] = ["hsk-cedict"];
```

### 4.4 Result Example: English L1 Object

```javascript
{
  code: "en",
  iso639_3: "eng",
  dictionaries: {
    jpn: ["edict", "wiktionary-csv"],        // edict primary, wiktionary fallback
    zho: ["hsk-cedict", "wiktionary-csv"],   // hsk-cedict primary
    kor: ["kengdic", "wiktionary-csv"],       // kengdic primary
    rus: ["open-russian", "wiktionary-csv"],  // open-russian primary
    fra: ["wiktionary-csv"],                  // wiktionary only
    deu: ["wiktionary-csv"],                  // wiktionary only
    spa: ["wiktionary-csv"],                  // wiktionary only
    // ... ~800 more
  }
}
```

---

## 5. Data Flow: Subtitle Word → Dictionary Popup

```
1. Subtitle line: "私は日本語を勉強します"
2. Tokenizer.tokenize(text) → [
     { text: "私", startOffset: 0 },
     { text: "は", startOffset: 1 },
     { text: "日本語", startOffset: 2 },
     { text: "を", startOffset: 5 },
     { text: "勉強します", startOffset: 6 }
   ]
3. For each token: dictionary.addCandidatesToToken(token)
   - "私" → lookupMultiple("私") → candidates: [{ head: "私", def: "I; me", ... }]
   - "は" → lookupMultiple("は") → candidates: [{ head: "は", def: "topic marker", ... }]
   - "勉強します" → lookupMultiple("勉強します") → no match
     → inflect("勉強します") → lemma: "勉強する"
     → lookupMultiple("勉強する") → HIT!
     → candidates: [{ head: "勉強する", def: "to study", level: 5, ... }]
4. Rendering:
   - TokenizedText → WordBlock (each token is a clickable span)
   - WordBlock shows: ruby text (furigana), quick gloss, level color
5. User clicks "勉強します":
   - wordBlockClick() → emits 'showPopupDictionary' event
   - PopupDictionaryModal opens (Bootstrap modal)
   - Inside: WordBlockPopup shows:
     ├── Lemma: 勉強します → 勉強する (verb)
     ├── Dictionary entries (head, reading, definitions, level)
     ├── Image wall (Google Image Search results)
     ├── "Let DeepSeek Explain" (AI explanation via DeepSeek API)
     └── Save word / Save phrase buttons
```

---

## 6. Storage Architecture

```
┌─────────────────────────────────────────────────┐
│              LAYER 1: IndexedDB                   │
│  (localforage — persistent, per-browser)          │
│                                                    │
│  Key: "hsk_cedict"         → raw CSV text         │
│  Key: "edict"               → raw TSV text        │
│  Key: "wiktionary-fra-eng"  → raw CSV text        │
│  ...                                               │
│                                                    │
│  Survives page reloads, browser restarts.          │
│  Data is write-once, read-many per language.       │
│  Versioned: key += "-v" + indexDbVerByLang[code]  │
└─────────────────────────────────────────────────┘
                      ↑↓ (cache-or-fetch)
┌─────────────────────────────────────────────────┐
│            LAYER 2: Web Worker Memory              │
│  (per dictionary instance, per browser tab)        │
│                                                    │
│  this.words[]            → full parsed word array  │
│  this.searchIndex{}      → { headword → [entries] }│
│  this.searcher           → Fuse.js instance        │
│  this.phraseIndex{}      → multi-word phrases      │
│  this.tokenizer          → language tokenizer      │
│  this.inflector          → inflection engine       │
│  this.frequencyAssigner  → word frequency data     │
│                                                    │
│  Rebuilt on page load from IndexedDB cache.        │
│  Released when user navigates away.                │
└─────────────────────────────────────────────────┘
                      ↑↓ (user data sync)
┌─────────────────────────────────────────────────┐
│            LAYER 3: Directus CMS                   │
│  (server-side, cross-device)                       │
│                                                    │
│  user_data.saved_words  → { zh: { 你好: {...} } } │
│  user_data.saved_phrases → { ja: { ... } }        │
│  user_data.progress      → watch history          │
│                                                    │
│  Synced via Directus API on login/auth.            │
│  Persisted across devices.                         │
└─────────────────────────────────────────────────┘
```

---

## 7. Key Files Reference

| File | Purpose |
|---|---|
| `dist/js/base-dictionary.js` | Abstract base class (448 lines) |
| `dist/js/dictionary-utils.js` | Shared utilities, server URLs, language detection |
| `dist/js/frequency-assigner.js` | Word frequency data attachment |
| `dist/js/hsk-cedict-dictionary.js` | Chinese (CC-CEDICT + HSK) |
| `dist/js/chinese-dialect-dictionary.js` | Cantonese, Hakka, Min Nan |
| `dist/js/edict-dictionary.js` | Japanese (JMdict/EDICT) |
| `dist/js/kdic-jc-dictionary.js` | Japanese → Chinese |
| `dist/js/kengdic-dictionary.js` | Korean (Kengdic) |
| `dist/js/freedict-dictionary.js` | European languages (FreeDict) |
| `dist/js/open-russian-dictionary.js` | Russian (OpenRussian) |
| `dist/js/wiktionary-csv-dictionary.js` | Universal Wiktionary (~800 langs) |
| `dist/js/klingonska-dictionary.js` | Klingon |
| `lib/languages.js` | Language data, dictionary assignment logic |
| `static/data/languages/dictionaries.csv.txt` | Explicit L1→L2→dictionary mappings |
| `components/WordBlock.vue` | Clickable word component |
| `components/WordBlockPopup.vue` | Popup content (definitions, images, AI) |
| `components/PopupDictionaryModal.vue` | Popup modal wrapper |
| `components/TokenizedText.vue` | Tokenizes and renders subtitle text |
| `components/TranscriptLine.vue` | Single subtitle line with word blocks |
| `components/WordBlockDictionary.vue` | Inline dictionary definition display |
| `plugins/main.js` | Dictionary loading via WorkerModuleLoader |

---

## 8. Implications for Next.js Implementation

1. **Web Workers not strictly needed in Next.js** — can load dictionaries in a server component or client-side with Suspense, since Next.js already handles code splitting.

2. **IndexedDB still best for caching** — `localforage` works in any browser. Same cache-then-network pattern applies directly.

3. **Dictionary selection logic** can be ported from `languages.js:assignDictionaries()` — it's pure data transformation, no framework dependency.

4. **CSV data files** live on `server.chinesezerotohero.com/data/` — accessible via HTTP, no API changes needed.

5. **Tokenizer + Inflector** are separate concerns from the dictionary — they run independently and just consume the word set. The GO app already has TypeScript versions of these in `src/tokenizer/`.

6. **Popup dictionary** should be a shadcn/ui `Sheet` or `Dialog` component — much simpler than the Bootstrap modal + event bus pattern used in Classic.

7. **Saved words** use the same Directus `user_data` collection — the API client already exists in `@langplayer/api-client`.
