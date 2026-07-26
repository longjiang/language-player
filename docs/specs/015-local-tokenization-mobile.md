# SPEC-015: Local Tokenization & Lemmatization for Mobile

## Metadata
- **Spec ID**: SPEC-015
- **Feature**: On-device tokenization and lemmatization as an alternative/complement to server-side `POST /lemmatize-normalized`
- **Status**: draft (exploration)
- **Created**: 2026-07-26
- **See also**:
  - [ARCH-016: Server-Side Tokenization Pipeline](../arch/016-server-tokenization.md)
  - [ADR-0018: Tokenizer Selection — Prefer Simplemma/LemmatizationList over spaCy](../adr/0018-tokenizer-prefer-simplemma-over-spacy.md)
  - [SPEC-013: Mobile Offline Dictionary](../specs/013-mobile-offline-dictionary.md)
  - [ADR-0008: Mobile Dictionary Architecture — Online Lookup + Offline Download](../adr/0008-go-dictionary-architecture.md)

---

## Overview

Today, every `POST /lemmatize-normalized` call from the mobile app hits the Python server. This means:

- **No offline tokenization** — subtitles, reader text, and dictionary searches can't be tokenized without a network connection
- **Latency** — even with caching, every unique text string requires a round trip
- **Server load** — popular videos generate repeated tokenization requests for the same subtitle lines

This document explores options for running tokenization and lemmatization **locally on the mobile device**, covering all 207 supported L2 languages.

---

## Tokenization ≠ Lemmatization

These are two distinct problems that need different solutions:

| | Tokenization | Lemmatization |
|---|---|---|
| **What** | Split text into word tokens | Reduce each word to its base form |
| **Hard for** | CJK, Thai, Khmer, Burmese, Arabic | All inflected languages |
| **Easy for** | Space-separated Latin-script languages | Chinese (words are already lemmas) |
| **Example** | `"你好世界"` → `["你好", "世界"]` | `"cats"`, `"running"` → `"cat"`, `"run"` |

For Chinese, tokenization is the only hard part — words are already their own lemmas. For English, tokenization is trivial (split on spaces) but lemmatization needs work. For Turkish, both are challenging.

---

## Language Group Analysis

### Group 1: Dedicated Tokenizer Languages (8 languages)

These use specialized server-side engines. Each needs a different local strategy:

| Lang | Server Engine | Local Option | Feasibility |
|---|---|---|---|
| Chinese (`zh`) | jieba + pypinyin | `jieba-js` (WASM, ~3MB) or dictionary-based max-matching | ✅ High |
| Japanese (`ja`) | MeCab | `kuromoji` (pure JS, dict ~15MB) or `tiny-segmenter` (~100KB) | ⚠️ Med (dict size) |
| Korean (`ko`) | Okt (konlpy) | Dictionary-based + stem table; `Intl.Segmenter` for segmentation | ✅ High |
| Russian (`ru`) | pymorphy2 | Pre-built lemma lookup table (surface→lemma JSON) | ✅ High |
| Arabic (`ar`) | Qalsadi + Mishkal | Pre-built token→lemma table; `Intl.Segmenter` for segmentation | ⚠️ Med |
| Persian (`fa`) | Hazm + PersianG2p | Pre-built token→lemma table | ✅ High |
| Turkish (`tr`) | Zeyrek | Pre-built stem→lemma table + suffix stripping rules | ✅ High |
| Burmese (`my`) | pyidaungsu | Dictionary-based max-matching; `Intl.Segmenter` | ⚠️ Med |

### Group 2: LemmatizationList Languages (10 languages, pre-computed CSV)

Catalan, German, English, Spanish, French, Italian, Portuguese, Romanian, Swedish, Ukrainian.

**Strategy**: These languages already have pre-computed `{surface_form: lemma}` TSV files at `data/lemmatization-lists/`. Ship these as SQLite tables or compressed JSON. This is the **simplest and most effective** local lemmatization strategy — the files already exist, need no computation, and are compact.

### Group 3: Simplemma Languages (29 languages)

All remaining languages from the Simplemma registry plus those in the spaCy→Simplemma downgrade path (Danish, Greek, Finnish, Lithuanian, Macedonian, Norwegian Bokmål, Dutch, Polish) plus Simplemma-only languages (Asturian, Bulgarian, Czech, Estonian, Irish, Galician, Manx, Hungarian, Armenian, Indonesian, Icelandic, Georgian, Latin, Latvian, Malay, Norwegian Nynorsk, Slovak, Slovenian, Albanian, Swahili, Tagalog).

**Strategy**: Simplemma is a dictionary-based lemmatizer — exactly the kind of thing we can replicate on mobile. Ship a pre-compiled `{word: lemma}` lookup table. Simplemma's dictionaries are open-source and compact.

### Group 4: Fallback Languages (~160 languages)

Everything else. No dedicated tokenizer, no lemmatization list, no Simplemma coverage. Currently tokenized by regex word-split on the server with surface form as lemma.

**Strategy**: Regex word-split is trivial to replicate locally. No lemmatization needed — just use the surface form.

### Group 5: Special Script Languages

Languages with complex scripts that make tokenization non-trivial even without inflection:

| Script | Languages | Tokenization Challenge |
|---|---|---|
| Thai | `th` | No spaces, vowel above/below, tone marks, connecting glyphs |
| Khmer | `km` | No spaces, stacked consonants, complex ligatures |
| Lao | `lo` | No spaces, similar to Thai |
| Burmese | `my` | No spaces, complex stacking |
| Tibetan | `bo` | No spaces between words (uses tsheg `་` as syllable separator) |
| Devanagari | `hi`, `ne`, `mr` | Connecting matras, conjuncts. Spaces exist but word boundaries can be ambiguous. |
| Arabic | `ar`, `fa`, `ur`, `ps` | RTL, connected letters, diacritics optional |
| Khmer/Lao/Thai | many | Zero-width spaces sometimes used, sometimes not |

---

## Strategy 1: Dictionary-Assisted Segmentation

### The Core Idea

The **downloaded offline dictionary** (SPEC-013) already contains the headwords for a language. This is, effectively, a word list. For languages without spaces between words (Chinese, Japanese, Thai, Khmer, Burmese, Lao), we can use this word list to segment text.

### Maximum Matching Algorithm

```
Input: "泰国是东南亚的一个国家" (Thailand is a country in Southeast Asia)
Dictionary word list: ["泰国", "是", "东南亚", "的", "一个", "国家", "东", "南", "亚", "国", "家", ...]

Forward maximum matching:
1. Start at position 0, look for longest match in dictionary: "泰国" ✅ (2 chars)
2. Position 2: "是" ✅ (1 char)
3. Position 3: "东南亚" ✅ (3 chars)
4. Position 6: "的" ✅ (1 char)
5. Position 7: "一个" ✅ (2 chars)
6. Position 9: "国家" ✅ (2 chars)

Result: ["泰国", "是", "东南亚", "的", "一个", "国家"]
```

This is essentially how jieba works — it combines a dictionary with statistical models. The dictionary alone gives ~85-90% accuracy for Chinese. Combined with bigram frequency data (which we can also ship), accuracy approaches 95%+.

### Feasibility by Language

| Language | Dict Size (top 30K words) | Segmenter Accuracy (dict-only) | Notes |
|---|---|---|---|
| Chinese | ~30K entries (cedict) | ~90% | Ambiguity resolved with bigram freqs |
| Japanese | ~30K entries (edict) | ~85% | Kanji/kana alternation helps; kuromoji is better |
| Thai | ~30K entries | ~88% | Need to handle leading vowels (สระ) |
| Khmer | ~5K entries (less dict coverage) | ~80% | Smaller dictionary; more OOV words |
| Burmese | ~3K entries (less dict coverage) | ~80% | Complex script; pyidaungsu-style better |
| Lao | ~2K entries | ~75% | Very limited dictionary coverage |
| Korean | ~30K entries (kengdic) | — | Korean HAS spaces; segmentation is not the main problem |

### Implementation

Pure JavaScript, no native dependencies:

```typescript
function maxMatchSegment(text: string, wordSet: Set<string>, maxWordLen: number): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < text.length) {
    let longestMatch = text[i];
    // Try progressively shorter substrings
    for (let len = Math.min(maxWordLen, text.length - i); len >= 1; len--) {
      const candidate = text.slice(i, i + len);
      if (wordSet.has(candidate) || len === 1) {
        longestMatch = candidate;
        break;
      }
    }
    result.push(longestMatch);
    i += longestMatch.length;
  }
  return result;
}
```

For dictionary loading, extract all unique `head` values from the offline SQLite dict:

```sql
SELECT DISTINCT head FROM dict_{l2};
```

---

## Strategy 2: Pre-Built Lemma Lookup Tables

### The Core Idea

The server already has pre-computed lemma mappings. For LemmatizationList languages, these are TSV files. For Simplemma languages, these are compiled Python dictionaries. We can export these as JSON or SQLite and ship them with the app.

### Sources Already on the Server

| Source | Format | Languages | Size (per lang) |
|---|---|---|---|
| `data/lemmatization-lists/lemmatization-{code}.txt` | TSV: `lemma\tsurface` | 24 languages | 0.1–2 MB |
| Simplemma Python package data | Python dict `{surface: [lemmas]}` | 45+ languages | 0.05–1 MB |
| `cedict` table `head` column | Chinese words list | Chinese only | ~0.3 MB |

### Export Pipeline

A new Python script would:

1. Read each lemmatization-list TSV file
2. Read Simplemma's per-language dictionaries
3. Merge and deduplicate
4. Export as compressed JSON or SQLite `.db` file
5. Serve via a new endpoint (like `/dictionary/download` but for lemma tables)

### On-Device Usage

```typescript
// Load lemma table from bundled asset or downloaded file
const lemmaTable: Map<string, string[]> = await loadLemmaTable('de');

function lemmatizeLocal(word: string, lang: string): string[] {
  // 1. Exact lookup
  if (lemmaTable.has(word)) return lemmaTable.get(word)!;

  // 2. Lowercase lookup (for sentence-initial capitals)
  const lower = word.toLowerCase();
  if (lower !== word && lemmaTable.has(lower)) return lemmaTable.get(lower)!;

  // 3. Fallback: surface form as lemma
  return [word];
}
```

### Bundle Size Estimate

| Coverage | Entries per lang | JSON size (gzipped) | SQLite size |
|---|---|---|---|
| Top 10K words | 10,000 | ~150 KB | ~200 KB |
| Top 30K words | 30,000 | ~400 KB | ~500 KB |
| Top 100K words | 100,000 | ~1.2 MB | ~1.5 MB |
| All 45 Simplemma langs × 30K | 1,350,000 | ~18 MB | ~22 MB |

Bundling ALL languages would be ~20 MB. A better approach: bundle only the top 10 languages as assets, and let users download lemma tables for other languages on demand (like the dictionary download).

---

## Strategy 3: Third-Party JS/TS Libraries

### Libraries That Work in React Native (Pure JS or WASM)

| Library | Languages | Size | Accuracy | Notes |
|---|---|---|---|---|
| **kuromoji** | Japanese | Dict ~15 MB (can be reduced) | High | Pure JS. Dictionary can be pruned to top 30K words → ~3 MB |
| **tiny-segmenter** | Japanese | ~100 KB | Medium | Pure JS. No lemmatization, tokenization only. Good for basic use. |
| **jieba-js** (WASM) | Chinese | ~3 MB (WASM + dict) | High | WASM build of jieba. Includes POS tagging. Compatible with Hermes via `expo-webassembly`. |
| **compromise** | English | ~200 KB | Medium | Pure JS. Does tokenization + lemmatization + POS. English only. |
| **wink-nlp** | English | ~2 MB (model) | High | Pure JS NLP. English only. |
| **thai-segmenter** | Thai | ~50 KB | Medium | Pure JS. Dictionary-based max matching. |
| **Intl.Segmenter** (built-in) | zh, ja, ko, th, lo, km, my, etc. | 0 KB (built-in!) | Varies | See section below. |

### Intl.Segmenter — The Built-In Solution

`Intl.Segmenter` is a **built-in JavaScript API** (no library needed) that performs word segmentation for many languages:

```typescript
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
const segments = Array.from(segmenter.segment('ภาษาไทยเป็นภาษาที่สวยงาม'));
// → [{ segment: 'ภาษา', index: 0, isWordLike: true }, { segment: 'ไทย', ... }, ...]
```

**Supported languages for word segmentation**: Chinese, Japanese, Korean, Thai, Lao, Khmer, Burmese, and many more.

**Availability in React Native**:

| Engine | Intl.Segmenter Support |
|---|---|
| Hermes (React Native) | ❌ Not yet (as of Hermes 0.12 / RN 0.76). Being tracked. |
| JavaScriptCore (iOS) | ✅ iOS 14+ (RN uses JSC on iOS) |
| V8 (Android, if configured) | ✅ Chrome 87+ |
| Hermes with Intl polyfill | ⚠️ Possible via `@formatjs/intl-segmenter` polyfill (~30 KB) |

**Critical insight**: On iOS, React Native uses JavaScriptCore which supports `Intl.Segmenter` natively since iOS 14. On Android with Hermes, it's not available but the `@formatjs/intl-segmenter` polyfill is small and works.

This means **zero-bundle-size tokenization** is possible for most non-space-separated languages on iOS today, and on Android with a small polyfill.

### WASM Libraries in React Native

WASM support in React Native is emerging:

- **expo-webassembly** (Expo SDK 52+): Provides WASM support via a native module
- **react-native-wasm**: Alternative native module
- **Hermes**: Limited WASM support is in development

For `jieba-js` (Chinese tokenizer in WASM), this is viable but adds ~3 MB to the bundle and requires native module setup. Consider: is a 3 MB WASM module worth it when dictionary-based max-matching gives ~90% accuracy at near-zero size?

---

## Strategy 4: Regex-Based Fallback

Every language gets a baseline tokenizer via regex:

```typescript
function fallbackTokenize(text: string): string[] {
  // Matches words (including apostrophes for contractions) and punctuation
  return text.match(/[\w']+|[^\w\s']+/g) || [];
}
```

This handles:
- **All Latin-script space-separated languages**: English, Spanish, French, German, etc. Tokenization is just `text.split(/\s+/)`.
- **Apostrophe handling**: `don't`, `l'homme`, `dell'arte` stay as single tokens.
- **Punctuation**: Separated from words.

Combined with a lemma lookup table, this gives full local tokenization + lemmatization for 100+ languages at near-zero cost.

---

## Language-Specific Gotchas

### Thai — The Hardest Tokenization Problem

Thai has NO spaces between words AND uses connecting glyphs:

- **Vowels can appear above, below, before, or after** the consonant they modify. A "leading vowel" like `เ` appears before the consonant but is pronounced after it, breaking naive character-by-character segmentation.
- **Tone marks** stack above consonants: `ก้`, `ป๋`, `จ๊`
- **Zero-width spaces** (U+200B) are sometimes used as word delimiters but inconsistently
- **Example**: `การใช้งาน` ("usage") — if you segment naively you might split `การ` + `ใช้งาน`, but `การใช้งาน` as a single compound is also correct depending on context.

**Recommendation**: Use `Intl.Segmenter` with Thai locale on iOS, polyfill on Android. Dictionary-based max matching as fallback. The offline dictionary provides the word list.

### Khmer — Stacked Consonants

Khmer has NO spaces and very complex orthography:

- **Stacked consonants** (subscript forms): ក្ស (k + subscript s), ប្រ (b + subscript r)
- **Vowels can wrap around consonants**: កែ (vowel  ​ែ appears on both sides of ក)
- Unicode rendering is complex — counting "characters" by `string.length` is wrong (need grapheme clusters)

**Recommendation**: Use `Intl.Segmenter` with Khmer locale. Dictionary coverage for Khmer is limited (~5K entries), so accuracy will be lower than for Thai or Chinese.

### Burmese — Complex Stacking

Similar to Khmer but with even more stacking complexity:

- **Consonant stacking**: က္ဘ (k + bha), က္မ (k + ma)
- **Medial consonants**: ချ (kha + ya), ကြ (ka + ra)
- No spaces between words
- **pyidaungsu** on the server handles this well; no equivalent JS library exists

**Recommendation**: `Intl.Segmenter` with Burmese locale. Dictionary-based max matching as supplement.

### Korean — Spaces Exist, Morphology is the Problem

Korean DOES use spaces between words (unlike Chinese/Japanese). The challenge is:

- **Agglutinative morphology**: `먹었겠습니다` = 먹 (eat) + 었 (past) + 겠 (conjecture) + 습니다 (formal). All one "word" in Korean spacing.
- **Stemming is the hard part**: Okt on the server does morphological analysis to extract stems.
- **Hangul decomposition**: Can be done purely algorithmically (no dictionary needed) since Hangul is a featural alphabet.

**Recommendation**: 
1. Tokenization: space split + `Intl.Segmenter` (easy — spaces exist)
2. Lemmatization: Ship a pre-built stem lookup table from the server (like the lemmatization list approach). For unknown words, Hangul decomposition can provide pronunciation (Revised Romanization) algorithmically.

### Arabic — RTL + Optional Diacritics

- **Right-to-left** text: RN handles this natively via Unicode Bidi
- **Optional short vowels**: `كتب` could be `kataba` (he wrote), `kutiba` (it was written), or `kutub` (books) — same letters, different diacritics. Diacritics are usually omitted in modern text.
- **Connected letters**: Characters change shape based on position (initial/medial/final/isolated)
- **Root-based morphology**: k-t-b (writing) → kataba, kitaab, maktab, etc.

**Recommendation**: Pre-built token→lemma table from the server's Qalsadi output. Ship as SQLite. Arabic tokenization (word splitting) is trivial — spaces exist. Lemmatization needs the lookup table.

### Devanagari (Hindi, Nepali, Marathi)

- **Connecting matras**: Vowel signs attach to consonants: `क` + `ि` = `कि`
- **Conjuncts**: Multiple consonants combine: `क` + `ष` = `क्ष`
- **Spaces exist** but word boundaries can be ambiguous with postpositions: `में` (in) may or may not be a separate word
- **Schwa deletion**: Implicit 'a' at end of words is dropped in pronunciation but not in writing

**Recommendation**: Space-split for tokenization (spaces are generally reliable in Devanagari). Simplemma covers Hindi — ship the lemma lookup table.

### Vietnamese — Tone Marks on Vowels

- Uses Latin script with extensive diacritics: `ạ`, `ả`, `ã`, `á`, `à`, `â`, `ấ`, `ầ`, `ẩ`, `ẫ`, `ậ`, `ă`, `ắ`, `ằ`, `ẳ`, `ẵ`, `ặ`, `é`, `è`, `ẻ`, `ẽ`, `ẹ`, `ê`, `ế`, `ề`, `ể`, `ễ`, `ệ`, `í`, `ì`, `ỉ`, `ĩ`, `ị`, `ó`, `ò`, `ỏ`, `õ`, `ọ`, `ô`, `ố`, `ồ`, `ổ`, `ỗ`, `ộ`, `ơ`, `ớ`, `ờ`, `ở`, `ỡ`, `ợ`, `ú`, `ù`, `ủ`, `ũ`, `ụ`, `ư`, `ứ`, `ừ`, `ử`, `ữ`, `ự`, `ý`, `ỳ`, `ỷ`, `ỹ`, `ỵ`
- Spaces exist between syllables (not words). Each syllable is typically a word.
- **pyvi** on the server handles compound words like `trường đại học` (university).

**Recommendation**: Space-split for tokenization (spaces between syllables work well enough for most purposes). The pyvi tokenizer's main value is joining compound words, which is a nice-to-have, not a must-have.

### Klingon — Apostrophes Matter

`puqbe'pu'` — apostrophes are part of the word, not punctuation. The `_fallback_lemmatize` regex on the server already handles this: `[\w']+`. Our local implementation must do the same.

---

## Recommended Architecture

### Tiered Approach

```
┌─────────────────────────────────────────────────┐
│              Tokenization Pipeline               │
│                                                  │
│  Level 1: Intl.Segmenter (built-in, 0 KB)       │
│  ├─ iOS: JSC native support (zh, ja, ko, th,    │
│  │   lo, km, my, ...)                            │
│  └─ Android: @formatjs/intl-segmenter polyfill   │
│      (~30 KB) for Hermes                         │
│                                                  │
│  Level 2: Dictionary-Based Max Matching          │
│  ├─ Uses offline dictionary headwords as word    │
│  │   list (SPEC-013)                             │
│  ├─ Pure JS, ~200 lines, no dependencies         │
│  └─ Fallback when Intl.Segmenter unavailable     │
│                                                  │
│  Level 3: Regex Word Split                       │
│  ├─ For all space-separated languages             │
│  ├─ Pattern: /[\w']+|[^\w\s']+/g                 │
│  └─ Handles apostrophes, punctuation              │
│                                                  │
│  Level 4: Server Fallback (online)               │
│  └─ POST /lemmatize-normalized                   │
│                                                  │
├─────────────────────────────────────────────────┤
│             Lemmatization Pipeline               │
│                                                  │
│  Level 1: Pre-Built Lemma Tables (bundled)       │
│  ├─ Top 10 languages bundled as assets           │
│  ├─ surface → [lemma1, lemma2, ...] mapping      │
│  └─ JSON or SQLite, ~150 KB per lang (gzipped)   │
│                                                  │
│  Level 2: Downloaded Lemma Tables (on-demand)     │
│  ├─ Same tables, downloaded like dictionaries    │
│  └─ Stored in SQLite alongside dict entries       │
│                                                  │
│  Level 3: Suffix-Stripping Rules (for regular     │
│  │   languages like English, Spanish, Turkish)    │
│  └─ Compact, always available, lower accuracy     │
│                                                  │
│  Level 4: Surface Form as Lemma (Chinese, etc.)  │
│  └─ No lemmatization needed                      │
│                                                  │
│  Level 5: Server Fallback (online)               │
│  └─ POST /lemmatize-normalized                   │
└─────────────────────────────────────────────────┘
```

### Per-Language Strategy Matrix

| Language Group | Tokenization | Lemmatization | Bundle Cost |
|---|---|---|---|
| **Chinese** | Intl.Segmenter or dict max-match | Surface = lemma (none needed) | 0 KB |
| **Japanese** | Intl.Segmenter or tiny-segmenter | Surface = lemma (mostly) | 0–100 KB |
| **Korean** | Space split + Intl.Segmenter | Pre-built stem table or server fallback | ~200 KB (stem table) |
| **Thai, Khmer, Burmese, Lao** | Intl.Segmenter or dict max-match | Surface = lemma (none needed) | 0 KB |
| **Arabic, Persian** | Space split (spaces exist) | Pre-built lemma table | ~300 KB each |
| **Turkish** | Space split | Suffix rules + lemma table | ~150 KB |
| **Russian** | Space split | Pre-built lemma table (pymorphy2 export) | ~500 KB |
| **10 Lemm. List langs** | Space split | Pre-built lemma table (already exists!) | ~150 KB each |
| **29 Simplemma langs** | Space split | Pre-built lemma table (Simplemma export) | ~100 KB each |
| **~160 fallback langs** | Regex split | Surface = lemma | 0 KB |

### Total Bundle Impact

**Option A — Bundle top 10 languages only**:
- Lemma tables for en, es, fr, de, zh, ja, ko, pt, it, ru
- Tokenizers: Intl.Segmenter (built-in) + regex (built-in)
- **Total: ~3 MB** (gzipped ~1.5 MB)

**Option B — Bundle nothing, download on demand**:
- Lemma tables downloaded like offline dictionaries (SPEC-013)
- Tokenizers: Intl.Segmenter (built-in) + regex (built-in)
- **Total: 0 KB bundled**, ~100–500 KB per downloaded language

**Option C — Bundle top 20 + download rest**:
- Same as A but broader
- **Total: ~5 MB** (gzipped ~2.5 MB)

---

## New Server Endpoint Needed

To support local lemmatization, the Python server would need to export lemma tables:

```
GET /lemmatization/export?l2=de&format=json
→ { "table": { "ging": ["gehen"], "lief": ["laufen"], "besser": ["gut"], ... } }
```

This would:
1. Read the appropriate source (LemmatizationList TSV, Simplemma dict, or generate from the dict DB)
2. Filter by frequency (top N words only)
3. Return as compressed JSON

---

## Pros and Cons

### Pros

- **Works offline** — subtitles and text can be tokenized without network
- **Instant** — no network latency for tokenization
- **Reduces server load** — fewer `/lemmatize-normalized` calls
- **Complements offline dictionary** (SPEC-013) — together they enable full offline reading
- **Most languages need near-zero code** — regex split + surface-as-lemma covers ~160 languages
- **Intl.Segmenter is built-in on iOS** — zero-cost tokenization for CJK and scriptio continua languages

### Cons

- **Lower lemma accuracy** — pre-built tables won't have 100% coverage of inflected forms
- **New server endpoint** — needs `/lemmatization/export` to be built
- **Download size** — lemma tables add to the storage footprint (though much smaller than full dictionaries)
- **Maintenance** — lemma tables need to be rebuilt when dictionaries update
- **WASM and native module complexity** — if we go beyond pure JS libraries
- **Android fragmentation** — Hermes doesn't support Intl.Segmenter; needs polyfill

---

## Recommendation

**Phase 1 — Trivial Wins (immediate, near-zero cost)**:
1. Implement regex-based tokenization for all space-separated languages (~160 languages)
2. Use surface form as lemma for Chinese (already correct), Burmese, Thai, Khmer, Lao
3. This gives offline tokenization for ~180 languages with **zero additional bundle size**

**Phase 2 — Lemma Tables (medium effort)**:
4. Build server export endpoint for lemma tables
5. Bundle top 10 language lemma tables as app assets (~1.5 MB gzipped)
6. Allow on-demand download for other languages (same UX as SPEC-013 dictionary download)

**Phase 3 — Advanced Tokenization (higher effort)**:
7. Integrate `Intl.Segmenter` with `@formatjs/intl-segmenter` polyfill for CJK + Thai + Khmer + Burmese
8. Dictionary-based max matching as fallback using offline dictionary word lists
9. Consider `kuromoji` (pruned dictionary) or `tiny-segmenter` for Japanese
10. Consider `jieba-js` WASM for Chinese only if accuracy of dict-based max matching proves insufficient

**Defer**:
- WASM-based tokenizers (`jieba-js`, etc.) — evaluate if Phase 1-3 accuracy is good enough first
- Stemming rules for agglutinative languages — pre-built tables are simpler and more accurate
- Native module tokenizers — avoid unless pure JS proves too slow

---

## References

- [Intl.Segmenter MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)
- [@formatjs/intl-segmenter polyfill](https://formatjs.io/docs/polyfills/intl-segmenter/)
- [kuromoji.js](https://github.com/takuyaa/kuromoji.js) — Japanese tokenizer (pure JS)
- [tiny-segmenter](https://github.com/SamuraiT/tiny-segmenter) — Tiny Japanese tokenizer
- [jieba-js](https://github.com/fxsjy/jieba) — Chinese tokenizer (WASM port available)
- [thai-segmenter](https://github.com/rayriffy/thai-segmenter) — Thai word segmentation (JS)
- [compromise](https://github.com/spencermountain/compromise) — English NLP (JS)
- [wink-nlp](https://github.com/winkjs/wink-nlp) — English NLP (JS)
- [expo-webassembly](https://docs.expo.dev/versions/latest/sdk/webassembly/) — WASM in Expo
- [Hermes Intl proposal](https://github.com/facebook/hermes/issues/896) — Intl.Segmenter in Hermes
