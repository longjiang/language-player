# Python Dictionary Database Schema

> **Source**: `zerotohero-python-server/import_dict_to_sqlite.py`
> **Database**: `data/dictionaries.db` (SQLite, WAL mode, 64 MB cache)
> **Data sources**: `data/dictionaries/` and `data/wiktionary-csv/`

---

## Overview

The Python backend uses a single SQLite database (`data/dictionaries.db`) for all dictionary lookups. It is built by `import_dict_to_sqlite.py` from raw CSV files and is queried by language-specific loaders (`utils_dictionary.py`) at `POST /dictionary/lookup` time.

The database contains:
- **5 dedicated dictionary tables** — one per curated dictionary source (cedict, cccanto, edict, kengdic, klingonska)
- **1 wiktionary table** — catch-all for ~800 languages, single table with `lang_code` column
- **1 enrichment table** — Open Russian with stress marks and IPA (not a standalone dictionary)
- **1 curriculum coverage table** — HSK Standard Course textbook coverage for Chinese entries (not a dictionary)

Frequency data lives directly in each dictionary table's `frequency` column — there is no separate frequency table. `import_dict_to_sqlite.py --all` rebuilds dictionaries and then imports all frequency data from Zipf CSVs via `--freq`. The `--freq` flag can also be used standalone to update frequencies in an existing database without rebuilding dictionaries.

---

## Record Counts

> **Snapshot**: 2026-07-21, 1.3 GB database. Frequency coverage varies by table — Zipf data is available for 40 languages.

### Dictionary Tables

| Table | Total Records | Records with Frequency | Coverage | Notes |
|---|---|---|---|---|
| kengdic (Korean) | 133,771 | 19,291 | 14.4% | Hanja form in `alternate` |
| cedict (Chinese) | 124,722 | 33,020 | 26.5% | Simplified + traditional + pinyin |
| edict (Japanese) | 117,368 | 22,252 | 19.0% | Kanji + kana + pitch accent |
| open_russian | 58,218 | 0 | — | Enrichment only — stress marks, not a standalone dictionary |
| cccanto (Cantonese) | 32,095 | 0 | 0% | No Zipf frequency data for Cantonese (yue) |
| klingonska | 3,032 | 0 | 0% | No frequency data |

### Wiktionary

| | |
|---|---|
| Total records | 6,626,697 |
| Languages | 3,795 |
| Records with frequency | 373,286 (5.6%) |
| Languages with 1,000+ entries | 147 |

**Wiktionary — top languages by record count (1,000+ entries, with frequency coverage):**

| Code | Language | Total | With Freq | Pct | Notes |
|---|---|---|---|---|---|
| lat | Latin | 844,589 | 0 | — | No Zipf data for Latin |
| ita | Italian | 598,609 | 19,773 | 3.3% | |
| eng | English | 511,526 | 36,050 | 7.0% | |
| rus | Russian | 419,467 | 12,825 | 3.1% | Enriched by `open_russian` (stress/IPA) |
| fra | French | 381,102 | 20,112 | 5.3% | |
| por | Portuguese | 297,974 | 17,317 | 5.8% | |
| deu | German | 290,619 | 17,686 | 6.1% | |
| spa | Spanish | 243,711 | 15,895 | 6.5% | |
| fin | Finnish | 214,142 | 13,272 | 6.2% | |
| zho | Chinese | 142,937 | 0 | — | **Not used for lookup** — Chinese uses dedicated `cedict` table |
| nld | Dutch | 117,361 | 18,057 | 15.4% | |
| swe | Swedish | 109,133 | 12,570 | 11.5% | |
| pol | Polish | 103,802 | 10,766 | 10.4% | |
| jpn | Japanese | 122,679 | 0 | — | **Not used for lookup** — Japanese uses dedicated `edict` table |
| kor | Korean | 34,706 | 0 | — | **Not used for lookup** — Korean uses dedicated `kengdic` table |
| cmn | Mandarin | 53,932 | 0 | — | **Not used for lookup** — Mandarin uses dedicated `cedict` table |
| yue | Cantonese | 1,733 | 0 | — | **Not used for lookup** — Cantonese uses dedicated `cccanto` table |

**Highest frequency coverage (1000+ entries):**

| Code | Language | Total | With Freq | Pct |
|---|---|---|---|---|
| heb | Hebrew | 12,611 | 7,935 | 62.9% |
| urd | Urdu | 4,323 | 2,571 | 59.5% |
| hin | Hindi | 15,638 | 8,603 | 55.0% |
| fas | Persian | 13,234 | 7,063 | 53.4% |
| ukr | Ukrainian | 8,192 | 4,101 | 50.1% |
| msa | Malay | 5,805 | 2,866 | 49.4% |
| ind | Indonesian | 10,391 | 5,078 | 48.9% |
| tam | Tamil | 4,446 | 2,143 | 48.2% |
| slv | Slovenian | 5,461 | 2,447 | 44.8% |
| isl | Icelandic | 20,452 | 7,500 | 36.7% |
| slk | Slovak | 6,427 | 2,319 | 36.1% |
| mkd | Macedonian | 25,694 | 8,870 | 34.5% |
| ces | Czech | 42,760 | 9,950 | 23.3% |
| vie | Vietnamese | 24,573 | 5,823 | 23.7% |
| tur | Turkish | 26,861 | 6,237 | 23.2% |
| hun | Hungarian | 68,991 | 13,810 | 20.0% |
| ron | Romanian | 59,192 | 10,966 | 18.5% |
| dan | Danish | 46,240 | 8,284 | 17.9% |
| nob | Norwegian Bokmål | 71,605 | 12,249 | 17.1% |
| nld | Dutch | 117,361 | 18,057 | 15.4% |

> **Why some languages have 0 frequency**: Languages with dedicated dictionary tables (zh → cedict, ja → edict, ko → kengdic, yue → cccanto) do not need Wiktionary rows — the loader skips Wiktionary entirely for these languages. Their frequency data lives in the dedicated tables. `open_russian` has no frequency column because it is a supplementary enrichment layer, not a standalone dictionary. A further 140+ Wiktionary languages have entries but no Zipf frequency data is available for them.

### Non-Dictionary Tables

| Table | Records | Purpose |
|---|---|---|
| hsk_curriculum | 5,746 | Textbook coverage for Chinese entries (HSK Standard Course 2014). FK → `cedict.id`. **Not a dictionary** — no lookup queries target this table. |

---

## Table Schemas

### `cedict` — Chinese (HSK CEDICT 2025)

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | Classic-compatible: `{traditional},{pinyin_with_underscores},{index}` — e.g. `中國,zhōng_guó,0` |
| `head` | TEXT NOT NULL | Simplified Chinese headword |
| `alternate` | TEXT | Traditional form (null if same as head) |
| `pronunciation` | TEXT | Pinyin with tone marks (e.g. `nǐ hǎo`) |
| `definitions` | TEXT | Pipe-separated English definitions (`\|`) |
| `part_of_speech` | TEXT | (null — reserved for future HSK 3.0 POS data) |
| `level` | TEXT | Comma-separated scale:level pairs — e.g. `hsk_2025:3,hsk_2010:4` |
| `frequency` | REAL | Zipf frequency score (populated by `--freq` flag; null until frequency import runs) |
| `classifier` | TEXT | JSON array of `MeasureWord` objects — see [Classifier Format](#classifier-format) |
| `pinyin_no_tone` | TEXT | Tone-stripped pinyin for search — e.g. `chi fan` ← `chī fàn` |
| `pinyin_search` | TEXT | Lowercase, no spaces — e.g. `chifan` |

**Sources merged**: CC-CEDICT raw (`cedict_ts_utf8_mdbg.txt`) + HSK 3.0 (2025 standard) + HSK 2.0 (2010 standard, 5000 words) + HSK Standard Course textbook (Z2H)

**ID format**: `{traditional},{tone_marked_pinyin_with_underscores},{index}` — e.g. `中國,zhōng_guó,0`. Duplicate traditional+pinyin entries get incrementing indices. Pinyin is converted from CC-CEDICT's numeric format (`zhong1 guo2` → `zhōng guó`) via `_numeric_pinyin_to_tone_marks()`.

**Level resolution priority**:
1. HSK 3.0 (2025) — `hsk_2025:N`
2. HSK 2.0 (2010) — `hsk_2010:N`
3. HSK Standard Course textbook — book number as `hsk_2010:N` fallback

**Classifier extraction**: Standalone `/CL:本[ben3],冊|册[ce4]/` and inline `(CL:隻|只[zhi1])` tags are parsed from raw CC-CEDICT definitions and stored as JSON. See [Classifier Format](#classifier-format).

---

### `hsk_curriculum` — HSK Textbook Coverage (not a dictionary)

> **Not a dictionary table** — this is supplementary curriculum coverage data. No lookup queries target this table directly; it is joined to `cedict` via `entry_id` to surface textbook context for Chinese words.

| Column | Type | Description |
|---|---|---|
| `entry_id` | TEXT PK | FK → `cedict.id` |
| `book` | TEXT | Textbook book number (1–6) |
| `lesson` | TEXT | Lesson number within book |
| `dialog` | TEXT | Dialog number within lesson |
| `example` | TEXT | Example sentence from textbook |
| `exampleTranslation` | TEXT | English translation of example |

**Source**: `hsk_standard_course.csv` (HSK Standard Course, Jiang Liping 2014)

**Records**: 5,746 — each row links a Chinese word in `cedict` to where it first appears in the HSK Standard Course textbook series.

---

### `cccanto` — Cantonese (CC-Canto 2021)

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | From source CSV |
| `head` | TEXT NOT NULL | Traditional Chinese headword |
| `alternate` | TEXT | Simplified form |
| `pronunciation` | TEXT | Jyutping with tone numbers (e.g. `jat1 gin6`) |
| `definitions` | TEXT | Pipe-separated English definitions |
| `part_of_speech` | TEXT | POS |
| `level` | TEXT | CEFR/HSK level |
| `frequency` | REAL | Zipf frequency score (populated by `--freq` flag) |
| `mandarin_pinyin` | TEXT | Cross-reference: Mandarin reading |
| `jyutping_no_tone` | TEXT | Tone numbers removed — e.g. `jat gin` |
| `jyutping_search` | TEXT | Lowercase, no spaces — e.g. `jatgin` |

**Source**: `cccanto_webdist.csv`

---

### `edict` — Japanese (EDICT 2019)

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | From source CSV |
| `head` | TEXT NOT NULL | Kanji form (e.g. `食べる`) |
| `alternate` | TEXT | Kana reading (e.g. `たべる`) |
| `pronunciation` | TEXT | Kana reading |
| `definitions` | TEXT | Pipe-separated English definitions |
| `part_of_speech` | TEXT | EDICT POS code (e.g. `v5k`, `adj-i`) |
| `level` | TEXT | JLPT level |
| `frequency` | REAL | Word frequency score (from source CSV) |
| `pitch_accent` | TEXT | Pitch accent pattern (number or pattern string) |

**Source**: `edict_normalized.csv`

---

### `kengdic` — Korean (kengdic 2011)

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | From source CSV |
| `head` | TEXT NOT NULL | Hangul (e.g. `먹다`) |
| `alternate` | TEXT | Hanja form |
| `pronunciation` | TEXT | Romanization |
| `definitions` | TEXT | Pipe-separated English definitions |
| `part_of_speech` | TEXT | POS |
| `level` | TEXT | TOPIK/CEFR level |
| `frequency` | REAL | Word frequency |
| `roman_search` | TEXT | Lowercase, no spaces — e.g. `meokda` |

**Source**: `kengdic_2011.csv`

---

### `klingonska` — Klingon (klingonska.org 2019)

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | From source CSV |
| `head` | TEXT NOT NULL | Klingon word |
| `alternate` | TEXT | Alternate form |
| `pronunciation` | TEXT | Pronunciation guide |
| `definitions` | TEXT | Pipe-separated English definitions |
| `part_of_speech` | TEXT | POS |
| `level` | TEXT | Level |
| `frequency` | REAL | Frequency |

**Source**: `klingonska.csv`

---

### `wiktionary` — All Other Languages

**Composite PK**: `(lang_code, id)`

| Column | Type | Description |
|---|---|---|
| `lang_code` | TEXT PK | ISO 639-3 code (e.g. `deu`, `spa`, `fra`) |
| `id` | TEXT PK | **Classic-compatible djb2 hash**: `w{djb2(head + first_def)}` |
| `head` | TEXT NOT NULL | Headword |
| `alternate` | TEXT | (null — not in raw CSV) |
| `pronunciation` | TEXT | IPA or romanization |
| `definitions` | TEXT | Pipe-separated English definitions |
| `part_of_speech` | TEXT | POS (mapped from CSV `pos` column) |
| `level` | TEXT | CEFR level |
| `frequency` | REAL | Word frequency |
| `han` | TEXT | Han script form (for CJK languages) |
| `audio` | TEXT | Audio file reference |
| `gender` | TEXT | Grammatical gender (for European languages) |

**Source**: ~800 files in `data/dictionaries/wiktionary-csv/{l2}-eng.csv.txt`. Only English L1 files are imported.

**ID generation**: Uses the **djb2 hash** algorithm identical to Classic's `hash-string.min.js`:
```python
h = 5381
for ch in reversed(s):
    h = ((h * 33) ^ ord(ch)) & 0xFFFFFFFF
return f"w{h}"
```
This ensures saved-word IDs are cross-platform compatible between Classic, Next.js, and GO.

---

### `open_russian` — Russian Enrichment

| Column | Type | Description |
|---|---|---|
| `head` | TEXT PK | Cyrillic headword |
| `accented` | TEXT | Apostrophe-marked stress (e.g. `э'то`) |
| `stressed` | TEXT | **Unicode combining acute** — computed from `accented` by `_accented_to_stressed()` (e.g. `э́то`) |
| `part_of_speech` | TEXT | POS |
| `level` | TEXT | CEFR level |
| `definitions` | TEXT | Pipe-separated English definitions |
| `pronunciation` | TEXT | IPA |

**Source**: `open_russian.csv.txt` (Badestrand/russian-dictionary 2019)

**Stress conversion**: Apostrophe-after-vowel notation (`э'то`) is converted to Unicode combining acute accent (`э́то`, U+0301) for display.

> **How Open Russian is used at lookup time**: Open Russian is a supplementary enrichment layer — Wiktionary is always the primary dictionary for Russian. After `_enrich_entry()` sets frequency-derived data on the Wiktionary entry, `_enrich_russian()` queries the `open_russian` table and polyfills missing fields by headword match:
>
> | Field | Polyfill behavior |
> |---|---|
> | `phonetic_detail.stressed` | Added if Open Russian has it (e.g. `спаси́бо`) |
> | `pronunciation` (IPA) | Only if Wiktionary's is empty |
> | `part_of_speech` | Only if Wiktionary's is empty |
> | `levels` (CEFR) | Only if no levels exist — but in practice this **never fires** because `_enrich_entry` already sets frequency-derived CEFR levels before `_enrich_russian` runs. Open Russian's real CEFR labels (e.g. A1, B2) are currently superseded by frequency-derived ones. |
>
> The entry's `dictionary` field always reports `wiktionary` — Open Russian is not presented as a separate dictionary to clients.

---

### Frequency Data

Frequency scores are stored directly in each dictionary table's `frequency` column (a `REAL` column). There is no separate frequency table — frequency data is loaded into the dictionary tables at import time and survives normal operation.

**Source**: `data/frequency-lists/zipf_frequency_list_{lang}.csv` — 40 languages supported. Frequency CSVs are loaded by `import_dict_to_sqlite.py --freq` and matched to dictionary rows by headword.

**Languages with frequency data**: ar, bg, ca, zh, hr, cs, da, nl, en, fi, fr, de, el, he, hi, hu, is, id, it, ja, ko, lv, lt, mk, ms, nb, fa, pl, pt, ro, ru, sk, sl, es, sv, ta, tr, uk, ur, vi

**Dictionary → frequency language mapping**:
| Dictionary Table | Frequency Lang | Match Column |
|---|---|---|
| `cedict` | `zh` (ISO 639-1) | `head` |
| `cccanto` | `yue` (ISO 639-1) | `head` |
| `edict` | `ja` (ISO 639-1) | `head` |
| `kengdic` | `ko` (ISO 639-1) | `head` |
| `wiktionary` | ISO 639-3 → ISO 639-1 via `_ISO3_TO_ISO1` | `(lang_code, head)` |

Klingon has no frequency data. Wiktionary languages are mapped from ISO 639-3 to ISO 639-1 using `_ISO3_TO_ISO1` (see code).

---

## Indexes

| Index | Table | Column(s) | Purpose |
|---|---|---|---|
| `idx_cedict_head` | cedict | `head` | Exact headword lookup |
| `idx_cedict_pinyin_search` | cedict | `pinyin_search` | Pinyin search (no tones) |
| `idx_cccanto_head` | cccanto | `head` | Exact headword lookup |
| `idx_cccanto_alternate` | cccanto | `alternate` | Simplified form lookup |
| `idx_cccanto_jyutping_search` | cccanto | `jyutping_search` | Jyutping search (no tones) |
| `idx_edict_head` | edict | `head` | Exact headword lookup |
| `idx_edict_alternate` | edict | `alternate` | Kana reading lookup |
| `idx_edict_pronunciation` | edict | `pronunciation` | Romaji/kana lookup |
| `idx_kengdic_head` | kengdic | `head` | Exact headword lookup |
| `idx_kengdic_alternate` | kengdic | `alternate` | Hanja lookup |
| `idx_kengdic_roman_search` | kengdic | `roman_search` | Romanization search |
| `idx_klingonska_head` | klingonska | `head` | Exact headword lookup |
| `idx_wiktionary_head` | wiktionary | `head` | Headword lookup within a language |
| `idx_wiktionary_lang_code` | wiktionary | `lang_code` | Language filter |
| `idx_wiktionary_lookup` | wiktionary | `(lang_code, head)` | Composite lookup |
| `idx_hsk_curriculum_entry` | hsk_curriculum | `entry_id` | FK join to cedict |

---

## ID Formats — Cross-Platform Compatibility

All dictionary IDs are designed to be stable across Classic, Next.js, and GO clients. This is critical for saved-word references.

| Dictionary | ID Format | Example |
|---|---|---|
| **cedict** | `{traditional},{tone_marked_pinyin},{index}` | `中國,zhōng_guó,0` |
| **cccanto** | From source CSV | (per-file) |
| **edict** | From source CSV | (per-file) |
| **kengdic** | From source CSV | (per-file) |
| **klingonska** | From source CSV | (per-file) |
| **wiktionary** | `w{djb2(head + first_definition)}` | `w123456789` |

The **djb2 hash** for Wiktionary is replicated from Classic's `hash-string.min.js`:
```javascript
// Classic /hash-string.min.js
function djb2(str) {
  var h = 5381;
  for (var i = str.length - 1; i >= 0; i--) {
    h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h;
}
```

Python equivalent in `import_dict_to_sqlite.py`:
```python
def _djb2(s: str) -> int:
    h = 5381
    for ch in reversed(s):
        h = ((h * 33) ^ ord(ch)) & 0xFFFFFFFF
    return h
```

---

## Classifier Format

Classifiers (measure words, counters) are stored as JSON arrays in the `cedict.classifier` column.

**Extraction**: Parsed from CC-CEDICT's raw definition format:
- Standalone: `/CL:本[ben3],冊|册[ce4]/` → separate `CL:` definition part
- Inline: `cat (CL:隻|只[zhi1])` → embedded within a definition

**JSON shape**:
```json
[
  {
    "kind": "measure_word",
    "traditional": "本",
    "simplified": "本",
    "reading": "ben3"
  }
]
```

**Format**: `{traditional}|{simplified}[{pinyin_with_tone_number}]` — the `|` separates traditional from simplified when they differ.

---

## Definition Format

All dictionary tables store definitions as **pipe-separated strings** (`|`), not JSON arrays. This is for storage efficiency in SQLite. The `/dictionary/lookup` endpoint splits them client-side.

Example:
```
"to eat|to consume|to have a meal"
```

---

## Pinyin Storage

Chinese (cedict) pinyin is stored in **three forms**:

| Column | Format | Example | Use |
|---|---|---|---|
| `pronunciation` | Tone-marked | `nǐ hǎo` | Display |
| `pinyin_no_tone` | Tone-stripped | `ni hao` | Direct comparison |
| `pinyin_search` | Lowercase no spaces | `nihao` | Search index |

**Tone mark conversion**: CC-CEDICT uses numeric tones (`ni3 hao3`). `_numeric_pinyin_to_tone_marks()` converts these to Unicode tone marks (`nǐ hǎo`).

**Tone removal**: `remove_tones()` strips tone marks for search. `remove_jyutping_tones()` strips numeric tones from Jyutping.

---

## Lookup Strategy (per loader)

Each loader in `utils_dictionary.py` queries its table with a priority chain:

1. **Exact match** by head (primary form — simplified for zh, kanji for ja, hangul for ko)
2. **Exact match** by alternate (traditional for zh, kana for ja, hanja for ko)
3. **Exact match** by pronunciation (pinyin for zh, romaji for ja, romanization for ko)
4. **Fuzzy match** — substring for roman/pinyin ≥ 3 characters

The `/dictionary/lookup` endpoint then:
- Reads `frequency` directly from the matched row — no separate query or runtime CSV loading needed
- If a language has canonical levels (HSK, JLPT, etc.), those are used as-is; otherwise a Zipf score → CEFR level mapping is applied inline
- If L1 ≠ English → LLM translate definitions to L1
- If no match → LLM generate entry (`match_type: "llm"`)

---

## Database Maintenance

All operations go through `import_dict_to_sqlite.py`. The legacy `import_frequency.py` and `frequency_assigner.py` scripts are archived — frequency is handled entirely within the unified import script.

**Full rebuild (drops dict tables, re-imports dictionaries, then imports all frequencies)**:
```bash
python import_dict_to_sqlite.py --all
```
This is equivalent to `--cedict --cccanto --edict --kengdic --klingonska --wiktionary --open-russian --freq=all`.

**Selective dictionary rebuild (includes frequency for those languages)**:
```bash
python import_dict_to_sqlite.py --cedict --edict
```
When specific dictionary flags are given, frequencies for the corresponding languages are imported automatically — no need to also pass `--freq`.

**Frequency-only update (UPDATEs the `frequency` column in existing dictionary tables, no rebuild)**:
```bash
python import_dict_to_sqlite.py --freq=all
python import_dict_to_sqlite.py --freq=zh,ja,ko
```

**Pragmas used**:
- `WAL` journal mode — better concurrent read performance
- `NORMAL` synchronous — good balance of safety and speed
- `64 MB` cache — reduces disk I/O for large lookups
- Foreign keys OFF — not needed for this schema

---

## Relevance to ADR-0008

The `/dictionary/download` endpoint (proposed in ADR-0008) needs to:
1. Query this database for a specific language
2. Filter by frequency using the dict table's `frequency` column directly (no join needed)
3. Return pre-normalized `DictionaryEntry[]` JSON

For dedicated dictionaries (cedict, edict, kengdic, cccanto, klingonska), queries are single-table SELECTs. For Wiktionary languages, queries filter by `lang_code`.
