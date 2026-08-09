# ARCH-018 — Local Tokenization Strategy

## Metadata
- **Arch ID**: ARCH-018
- **Feature**: Per-language tokenization and lemmatization strategy for on-device execution
- **Status**: draft
- **Created**: 2026-07-27
- **See also**:
  - [SPEC-018: Mobile Local Tokenization & Lemmatization](../specs/018-local-tokenization-mobile.md) — feature spec
  - [ARCH-016: Server-Side Tokenization Pipeline](016-server-tokenization.md) — server tokenizer inventory
  - [ADR-0018: Tokenizer Selection — Prefer Simplemma/LemmatizationList over spaCy](../adr/0018-tokenizer-prefer-simplemma-over-spacy.md)
  - [SPEC-013: Mobile Offline Dictionary](../specs/013-mobile-offline-dictionary.md) — download UX pattern

---

## Overview

This document classifies all 207 supported L2 languages by their **local tokenization and lemmatization needs**, and documents the specific strategy, library, or algorithm used for each. It is the technical reference for how the pipeline in [SPEC-018](../specs/018-local-tokenization-mobile.md) works per language.

Of the 207 supported L2 languages in `packages/shared/src/constants.ts:SUPPORTED_L2S`, approximately **146** can be tokenized with a simple regex word-split (`/[\w']+|[^\w\s']+/g`) and need no lemmatization (surface form = lemma). This document focuses on the **~61 languages that need more**.

### Two Independent Dimensions

| Dimension | What It Means | Hard For |
|---|---|---|
| **Segmentation** | Splitting text into word tokens | CJK, Thai, Khmer, Burmese, Lao, Tibetan |
| **Lemmatization** | Reducing inflected words to base form | All inflected languages (verbs, plurals, cases, etc.) |

A language may need zero, one, or both.

### Priority: Server First, Local as Fallback

Local tokenization exists for **graceful offline degradation**. The server always wins when reachable:

```
1. POST /lemmatize-normalized  →  Server (best accuracy, always preferred)
2. Local JS library             →  kuromoji, arabic-stem, snowball-stemmers, etc.
3. Downloaded lemma table       →  Language pack stored in SQLite
4. Regex word-split + surface   →  Last resort (~146 languages, zero cost)
```

---

## Language Classification: Categories A–E

All 207 languages fall into one of five categories depending on whether they need segmentation support, lemmatization support, both, or neither.

### Category A: Segmentation + Lemmatization (5 languages)

These languages cannot be split by spaces AND have inflectional morphology.

| Code | Language | Segmentation Strategy | Lemmatization Strategy | Server Engine |
|---|---|---|---|---|
| `ja` | Japanese | **kuromoji** (pure JS, same IPADIC dict as MeCab) | **kuromoji** — `basic_form` gives lemma directly（食べた→食べる, 美味しかった→美味しい） | MeCab |
| `ko` | Korean | **kuromoji-ko** (pure TS, based on mecab-ko-dic) | **kuromoji-ko** — `basic_form` gives stem directly（먹었겠습니다→먹다, 했어요→하다） | Okt (konlpy) |
| `ar` | Arabic | Spaces exist ✅ | **`arabic-stem`** (pure JS, 15 KB) — zero-dep prefix/suffix stemmer（المستنقعات→نقع）; supplemental Qalsadi export table for production accuracy | Qalsadi + Mishkal |
| `fa` | Persian | Spaces exist ✅ | **No JS lemmatizer exists.** Pre-built lemma table from server Hazm export（دارد→داشتن）is the only viable approach. | Hazm + PersianG2p |
| `tr` | Turkish | Spaces exist ✅ | **`snowball-stemmers`** (Turkish Snowball, ~50 KB, pure JS) — rule-based suffix stripping; ~80% accuracy. Primary lemmatizer for Turkish. **nlptoolkit dropped** — Node-only (`fs` dependency, no browser/RN build). | Zeyrek |

#### Japanese: kuromoji

kuromoji is a pure-JavaScript port of the same IPADIC dictionary that MeCab uses on the server. A single library call handles both segmentation and lemmatization:

```js
import kuromoji from 'kuromoji';

const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: 'dict/' }).build((err, t) => {
    err ? reject(err) : resolve(t);
  });
});

const tokens = tokenizer.tokenize('食べたくなかった');
// [
//   { surface_form: '食べ',   basic_form: '食べる',  pos: '動詞', ... },
//   { surface_form: 'たく',   basic_form: 'たい',    pos: '助動詞', ... },
//   { surface_form: 'なかっ', basic_form: 'ない',    pos: '助動詞', ... },
//   { surface_form: 'た',     basic_form: 'た',      pos: '助動詞', ... },
// ]
```

Japanese verbs have rich conjugation — kuromoji resolves all forms via `basic_form`:

| Form | Surface | Lemma (kuromoji `basic_form`) |
|---|---|---|
| Dictionary form | 食べる | 食べる |
| Past | 食べた | 食べる |
| Te-form | 食べて | 食べる |
| Polite | 食べます | 食べる |
| Negative | 食べない | 食べる |
| Potential | 食べられる | 食べる |
| Causative | 食べさせる | 食べる |
| Passive | 食べられる | 食べる |

Adjectives also inflect:

| Form | Surface | Lemma |
|---|---|---|
| Dictionary | 美味しい | 美味しい |
| Past | 美味しかった | 美味しい |
| Te-form | 美味しくて | 美味しい |
| Negative | 美味しくない | 美味しい |

**Dictionary size tradeoff**: Full IPADIC is ~15 MB. Pruned to top 30K frequency-ranked entries → ~3 MB. Recommend downloading on demand rather than bundling for all users. kuromoji requires no native modules — it works in React Native as pure JavaScript.

#### Korean: kuromoji-ko

`kuromoji-ko` is a pure-TypeScript port of kuromoji.js adapted for mecab-ko-dic, the same dictionary format the server uses via konlpy/Okt. Like its Japanese counterpart, a single library call handles both segmentation and lemmatization:

```js
import kuromoji from 'kuromoji-ko';

const tokenizer = await kuromoji.builder({ dicPath: 'dict/' }).build();
const tokens = tokenizer.tokenize('먹었겠습니다');
// → surface: '먹', basic_form: '먹다', pos: 'VV', with full morpheme breakdown
```

Korean verbs/adjectives have rich agglutinative conjugation. kuromoji-ko resolves all of these via `basic_form`:

| Form | Surface | Lemma (kuromoji-ko `basic_form`) |
|---|---|---|
| Dictionary | 먹다 | 먹다 |
| Past | 먹었다 | 먹다 |
| Future conjecture | 먹겠다 | 먹다 |
| Formal past conjecture | 먹었겠습니다 | 먹다 |
| Honorific | 드시다 | 들다 |
| Polite present | 해요 | 하다 |
| Past polite | 했어요 | 하다 |
| ㅂ-irregular | 추워요 | 춥다 |
| ㄷ-irregular | 들어요 | 듣다 |
| 르-irregular | 빨라요 | 빠르다 |

This covers all 7 irregular verb/adjective classes (ㅂ, ㄷ, 르, ㅅ, ㅎ, 러, 으) — no separate exception tables needed.

**Alternatives**: `garu-ko` (WASM, 1 MB model, F1 93.7%) or `mecab-ko-wasm` (WASM, full MeCab-Ko ~15 MB). Both require WASM support (`expo-webassembly`), making kuromoji-ko the preferred pure-TS option.

**Dictionary size**: mecab-ko-dic is ~8 MB. Pruned to top 30K frequency-ranked entries → ~2 MB. Download on demand like the Japanese kuromoji dictionary.

#### Arabic: arabic-stem

A zero-dependency pure-JS Arabic word stemmer that strips the definite article (الـ), common prefixes (مـ, تـ, يـ, استـ), and suffixes to extract the root:

```js
import Stemmer from 'arabic-stem';
const stemmer = new Stemmer();

stemmer.stem('المستنقعات');  // → { stem: ['نقع'], normalized: 'مستنقع' }
stemmer.stem('مستنقع');      // → { stem: ['نقع'], normalized: 'مستنقع' }
stemmer.stem('الأولاد');     // → { stem: ['ولد'], normalized: 'اولاد' }
stemmer.stem('المولودين');   // → { stem: ['ولد', 'ملد'], normalized: 'مولود' }
```

It returns multiple stem candidates when ambiguous. This is a **stemmer** (not a full morphological analyzer like Qalsadi with POS tagging and vocalization), but for offline dictionary lookup purposes, reducing to a common stem is sufficient for ~85% of cases.

| Surface | Stem | Dictionary Match |
|---|---|---|
| الكتاب | كتب | ✅ `كتب` (book) |
| المدرسة | درس | ✅ `مدرسة` (school) |
| يكتبون | كتب | ✅ `كتب` (to write) |
| بالمستشفى | شفي | ✅ `مستشفى` (hospital) |

**Limitations**: Arabic root-based morphology means different words from the same root (e.g., كاتب "writer" and كتاب "book" both stem to كتب). This is usually fine for dictionary lookup — the offline dictionary contains both forms. For higher accuracy, supplement with a pre-built Qalsadi export table for the top 10K words.

**Alternatives**: `snowball-stemmers` also includes an Arabic stemmer (same Snowball algorithm). `arabic-stem` is preferred for its zero-dependency footprint.

#### Persian: Pre-Built Table (Hazm Export)

No JS lemmatizer exists for Persian — the Persian NLP community primarily uses Python (Hazm, parsivar) and no one has ported these to JS. Pre-built lemma table exported from the server's Hazm engine is the only viable approach. Persian has ~5,000 commonly inflected forms (mainly verbs), so the table is compact (~80 KB):

```js
const PERSIAN_LEMMA_TABLE = {
  'دارد': ['داشتن'],
  'دارم': ['داشتن'],
  'داری': ['داشتن'],
  'داشت': ['داشتن'],
  'دارند': ['داشتن'],
  'رفتم': ['رفتن'],
  'میروم': ['رفتن'],
  // ... ~5,000 entries
};
```

#### Turkish: snowball-stemmers (nlptoolkit dropped)

**nlptoolkit-morphologicalanalysis is dropped** — it uses Node `fs` internally with no browser or React Native build. Only Node.js is listed as a requirement. No workaround exists for RN without shimming the entire `fs` module.

**Primary lemmatizer**: `snowball-stemmers` Turkish stemmer (~50 KB, pure JS, rule-based suffix stripping). ~80% accuracy vs nlptoolkit's ~95%, but works natively in React Native with zero data files.

**Server fallback**: When the server is reachable, `POST /lemmatize-normalized` uses Zeyrek (full morphological analyzer) which provides best accuracy. The Snowball stemmer is the offline-only fallback.

| Surface | Snowball Stem | Expected Lemma | Correct? |
|---|---|---|---|
| yarına | yarın | yarın | ✅ |
| gördüm | gör | görmek | ✅ (stem usable for lookup) |
| evlerimizden | ev | ev | ✅ |
| yapamayacaklar | yapam | yapmak | ⚠️ (partial stem) |

---

### Category B: Segmentation-Only (16 languages)

These languages have no spaces between words, but words **do not inflect** — the surface form IS the lemma.

| Code | Language | Script | Strategy |
|---|---|---|---|
| `zh` | Chinese (all: `zh`, `zho`, `zh-Hans`, `zh-Hant`) | Hanzi | Intl.Segmenter or dict max-matching |
| `cmn` | Mandarin | Hanzi | Same as Chinese |
| `nan` | Min Nan | Hanzi | Same as Chinese |
| `hak` | Hakka | Hanzi | Same as Chinese |
| `lzh` | Literary Chinese | Hanzi | Same as Chinese |
| `gan` | Gan | Hanzi | Same as Chinese |
| `hsn` | Xiang | Hanzi | Same as Chinese |
| `wuu` | Wu | Hanzi | Same as Chinese |
| `cjy` | Jin | Hanzi | Same as Chinese |
| `cpx` | Pu-Xian | Hanzi | Same as Chinese |
| `yue` | Cantonese | Hanzi | Same as Chinese |
| `th` | Thai | Thai | Intl.Segmenter or dict max-matching |
| `km` | Khmer | Khmer | Intl.Segmenter or dict max-matching |
| `lo` | Lao | Lao | Intl.Segmenter or dict max-matching |
| `my` | Burmese | Burmese | Intl.Segmenter or dict max-matching |
| `bo` | Tibetan | Tibetan | Split on tsheg (`་`); Intl.Segmenter or dict max-matching |

> **Note**: Chinese varieties (`zh`, `cmn`, `nan`, `hak`, `lzh`, `gan`, `hsn`, `wuu`, `cjy`, `cpx`, `yue`) are all counted as 11 distinct language codes but share the same segmentation strategy. Chinese has no inflection — words are always their own lemma.

For Chinese varieties, the offline dictionary word set includes **both** the simplified `head` and the traditional `alternate` from CEDICT (e.g. 台湾 and 臺灣). That lets simplified and traditional source text segment the same way, while script display conversion stays at the token render layer (ADR-0019).

---

### Category C: Lemmatization-Only (36 languages)

These languages use spaces between words (or other reliable delimiters) for tokenization, but words **do inflect** and need lemma reduction.

#### C1 — LemmatizationList Available (19 languages)

Pre-computed `{surface: [lemma]}` TSV files already exist on the server at `data/lemmatization-lists/lemmatization-{code}.txt`. These are the highest-quality lemma sources.

| Code | Language | Strategy | JS Library | Notes |
|---|---|---|---|---|
| `ca` | Catalan | LemmatizationList table | — | |
| `cs` | Czech | LemmatizationList table | — | Rich case system (7 cases) |
| `cy` | Welsh | LemmatizationList table | — | Simplemma excluded — apostrophe issues |
| `de` | German | LemmatizationList table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | Case + gender + plural umlaut |
| `en` | English | LemmatizationList table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | Irregular past/participles + plurals |
| `es` | Spanish | LemmatizationList table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | Extensive verb conjugation |
| `fr` | French | LemmatizationList table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | Verb conjugation; Simplemma excluded |
| `ga` | Irish | LemmatizationList table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | Initial mutations (séimhiú, urú) |
| `gl` | Galician | LemmatizationList table | — | |
| `gv` | Manx | LemmatizationList table | — | |
| `hu` | Hungarian | LemmatizationList table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | Uralic, 18+ cases, vowel harmony |
| `it` | Italian | LemmatizationList table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | Verb conjugation |
| `pt` | Portuguese | LemmatizationList table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | Verb conjugation |
| `ro` | Romanian | LemmatizationList table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | |
| `sk` | Slovak | LemmatizationList table | — | |
| `sl` | Slovenian | LemmatizationList table | — | Dual number! |
| `sv` | Swedish | LemmatizationList table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | |
| `uk` | Ukrainian | LemmatizationList table | — | Case system |
| `ast` | Asturian | LemmatizationList table | — | 108K rows — larger than many C1 langs |

#### C2 — Simplemma Available (17 languages)

Dictionary-based lemmatizer data available from the Simplemma Python package. Can be exported to JSON/SQLite.

| Code | Language | Strategy | JS Library | Notes |
|---|---|---|---|---|
| `bg` | Bulgarian | Simplemma table | — | |
| `da` | Danish | Simplemma table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | |
| `el` | Greek | Simplemma table | — | |
| `et` | Estonian | Simplemma table | ⚠️ Snowball upstream, npm uncertain | Uralic, 14 cases, lost vowel harmony |
| `fi` | Finnish | Simplemma table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | Uralic, 15 cases, consonant gradation |
| `hy` | Armenian | Simplemma table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | |
| `id` | Indonesian | — (in Category E now) | — | **Moved to Category E.** Analytic; surface-as-lemma works. |
| `is` | Icelandic | Simplemma table | — | Complex inflection preserved from Old Norse |
| `ka` | Georgian | Simplemma table only | **Nothing** ❌ | Kartvelian. Polypersonal verbs, screeve system. |
| `la` | Latin | Simplemma table | — | 5 declensions, 4 conjugations |
| `lv` | Latvian | Simplemma table | — | |
| `lt` | Lithuanian | Simplemma table | — | Complex case system, pitch accent |
| `nb` | Norwegian Bokmål | Simplemma table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | |
| `nn` | Norwegian Nynorsk | Simplemma table | — | |
| `nl` | Dutch | Simplemma table (+ Snowball stemmer fallback) | `snowball-stemmers` (stemmer) | |
| `pl` | Polish | Simplemma table | — | 7 cases, 3 genders |
| `sq` | Albanian | Simplemma table | — | |
| `sw` | Swahili | Simplemma table + prefix stripper | **Nothing** ❌ | Bantu. Noun class prefixes. |

> ⚠️ **Snowball is a stemmer, not a lemmatizer.** It algorithmically strips known suffixes but has no dictionary — it can't resolve irregular forms (e.g., English `went`→`go`, German `besser`→`gut`). For agglutinative languages (hu, fi) the stem often equals the nominative singular lemma, making Snowball a useful fallback for forms not in the lookup table. For fusional languages (en, de, es, fr, it, pt) with irregular inflection, Snowball alone is inadequate — the pre-built table is the primary lemmatizer.

#### C3 — spaCy-Only (1 language)

No LemmatizationList or Simplemma available. spaCy is the only option.

| Code | Language | Strategy | JS Library | Notes |
|---|---|---|---|---|
| `hr` | Croatian | spaCy export table | **Nothing** ❌ — spaCy is Python-only | 7 cases; no JS library available. Server spaCy export table (~800 KB gzipped). |

#### C4 — Dedicated Server Engine (1 language)

Rich inflection handled by a specialized server engine. Needs a pre-built lemma table exported from that engine's output.

| Code | Language | Strategy | JS Library | Notes | Server Engine |
|---|---|---|---|---|---|
| `ru` | Russian | pymorphy2 export table | `snowball-stemmers` (Snowball Russian is available as fallback) | 6 cases, 3 genders, verb aspect pairs; highly inflected | pymorphy2 |

---

### Category D: Special Cases (3 languages)

Languages that don't fit cleanly into the above categories.

| Code | Language | Issue | Strategy |
|---|---|---|---|
| `vi` | Vietnamese | Spaces between **syllables**, not words. Compounds like `trường đại học` (university) should be joined. No inflection. | Space-split is acceptable for tokenization; pyvi-style compound joining is a nice-to-have. Surface = lemma. |
| `hi` | Hindi | Spaces exist but postpositions can blur word boundaries. Simplemma excluded (breaks too many words). No equivalent of Devanagari spaCy model available locally. | Space-split + surface-as-lemma for now. Server fallback for better results. |
| `tlh` | Klingon | Apostrophes are part of words (`puqbe'pu'`). Regex tokenizer must treat `'` as a word character. | Regex `[\w']+` handles it correctly. |

---

### Category E: Regex-Only (~145 languages)

Everything else. Tokenization: `text.match(/[\w']+|[^\w\s']+/g)`. Lemmatization: surface form = lemma. Zero additional work needed.

A sampling: `af`, `am`, `az`, `bn`, `eo`, `eu`, `fo`, `fy`, `gd`, `gu`, `ha`, `he`, `kn`, `ku`, `ky`, `mg`, `mi`, `ml`, `mn`, `mr`, `mt`, `ne`, `no`, `oc`, `or`, `pa`, `ps`, `qu`, `sa`, `sd`, `si`, `sm`, `so`, `sr`, `su`, `ta`, `te`, `tg`, `tl`, `tt`, `ug`, `ur`, `uz`, `wo`, `xh`, `yi`, `yo`, `zu`, and ~100 more.

---

### Summary Matrix

> **Downloadable Data** = data files downloaded per language alongside the offline dictionary (dictionary files, lemma tables). JS engines (~865 KB total for kuromoji, kuromoji-ko, snowball-stemmers) are bundled with the app at build time as npm dependencies. nlptoolkit dropped — Node-only, no browser build. See [SPEC-018](../specs/018-local-tokenization-mobile.md) for the distribution model.

| Category | Count | Segmentation | Lemmatization | Downloadable Data per Lang |
|---|---|---|---|---|
| **A** — Both | 5 (`ja`, `ko`, `ar`, `fa`, `tr`) | Complex | Complex | ja: ~3 MB, ko: ~2 MB, ar: ~250 KB, fa: ~80 KB, tr: 0 KB (Snowball) |
| **B** — Segmentation-Only | 16 (11 Chinese varieties + `th`, `km`, `lo`, `my`, `bo`) | Complex | None | 0 KB (Intl.Segmenter) |
| **C1** — LemmatizationList | 19 | Trivial (spaces) | Pre-built TSV table | ~100–300 KB |
| **C2** — Simplemma | 17 | Trivial (spaces) | Pre-built dict table | ~50–200 KB |
| **C3** — spaCy-Only | 1 (`hr`) | Trivial (spaces) | spaCy or server fallback | Server-dependent |
| **C4** — Dedicated Engine | 1 (`ru`) | Trivial (spaces) | pymorphy2 export table | ~300–500 KB |
| **D** — Special | 3 (`vi`, `hi`, `tlh`) | Trivial-ish | Varies | Minimal |
| **E** — Regex-Only | ~146 | Trivial (spaces) | None | 0 KB |
| **Total** | **207** | | | |

---

## Tokenization Strategies

### Regex Word-Split

The baseline tokenizer for all 207 languages. Matches word tokens (including apostrophes for contractions like "don't", "l'homme") and punctuation tokens separately:

```typescript
function tokenizeWords(text: string): string[] {
  return text.match(/[\w']+|[^\w\s']+/g) ?? [];
}
```

This handles:
- **All Latin-script space-separated languages**: English, Spanish, French, German, etc.
- **Apostrophe handling**: `don't`, `l'homme`, `dell'arte` stay as single tokens
- **Punctuation**: Separated from words

Combined with a lemma lookup table, this gives full local tokenization + lemmatization for 100+ languages at near-zero cost.

### Intl.Segmenter — Built-In API

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
| Hermes (React Native) | ❌ Not yet (as of Hermes 0.12 / RN 0.76) |
| JavaScriptCore (iOS) | ✅ iOS 14+ (RN uses JSC on iOS) |
| V8 (Android, if configured) | ✅ Chrome 87+ |
| Hermes with Intl polyfill | ⚠️ Possible via `@formatjs/intl-segmenter` polyfill (~30 KB) |

On iOS, React Native uses JavaScriptCore which supports `Intl.Segmenter` natively since iOS 14. On Android with Hermes, the `@formatjs/intl-segmenter` polyfill is small and works.

### Dictionary-Assisted Maximum Matching

The **downloaded offline dictionary** (SPEC-013) already contains the headwords for a language. For languages without spaces between words (Chinese, Japanese, Thai, Khmer, Burmese, Lao), this word list can be used to segment text:

```
Input: "泰国是东南亚的一个国家"
Dictionary word list: ["泰国", "是", "东南亚", "的", "一个", "国家", ...]

Forward maximum matching:
1. Position 0, longest match: "泰国" ✅ (2 chars)
2. Position 2: "是" ✅ (1 char)
3. Position 3: "东南亚" ✅ (3 chars)
4. Position 6: "的" ✅ (1 char)
5. Position 7: "一个" ✅ (2 chars)
6. Position 9: "国家" ✅ (2 chars)

Result: ["泰国", "是", "东南亚", "的", "一个", "国家"]
```

This is essentially how jieba works — combining a dictionary with statistical models. The dictionary alone gives ~85-90% accuracy for Chinese. Combined with bigram frequency data, accuracy approaches 95%+.

**Implementation** (pure JS, no dependencies):

```typescript
function maxMatchSegment(text: string, wordSet: Set<string>, maxWordLen: number): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < text.length) {
    let longestMatch = text[i];
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

**Accuracy by language**:

| Language | Dict Size (top 30K words) | Segmenter Accuracy (dict-only) | Notes |
|---|---|---|---|
| Chinese | ~30K entries (cedict) | ~90% | Ambiguity resolved with bigram freqs |
| Japanese | ~30K entries (edict) | ~85% | Kanji/kana alternation helps; kuromoji is better |
| Thai | ~30K entries | ~88% | Need to handle leading vowels (สระ) |
| Khmer | ~5K entries (less dict coverage) | ~80% | Smaller dictionary; more OOV words |
| Burmese | ~3K entries (less dict coverage) | ~80% | Complex script; pyidaungsu-style better |
| Lao | ~2K entries | ~75% | Very limited dictionary coverage |
| Korean | ~30K entries (kengdic) | — | Korean HAS spaces; segmentation is not the main problem |

### WASM Libraries in React Native

WASM support in React Native is emerging:

- **expo-webassembly** (Expo SDK 52+): Provides WASM support via a native module
- **react-native-wasm**: Alternative native module
- **Hermes**: Limited WASM support is in development

For `jieba-js` (Chinese tokenizer in WASM), this is viable but adds ~3 MB to the bundle and requires native module setup. Evaluate if dict-based max-matching (~90% accuracy) is good enough first.

---

## Lemmatization Strategies

### Pre-Built Lemma Lookup Tables

The server already has pre-computed lemma mappings. For LemmatizationList languages, these are TSV files. For Simplemma languages, these are compiled Python dictionaries. Export as JSON or SQLite and ship with the app.

**Sources already on the server**:

| Source | Format | Languages | Size (per lang) |
|---|---|---|---|
| `data/lemmatization-lists/lemmatization-{code}.txt` | TSV: `lemma\tsurface` | 24 languages | 0.1–2 MB |
| Simplemma Python package data | Python dict `{surface: [lemmas]}` | 45+ languages | 0.05–1 MB |
| `cedict` table `head` column | Chinese words list | Chinese only | ~0.3 MB |

**Export pipeline** (new Python script):
1. Read each lemmatization-list TSV file
2. Read Simplemma's per-language dictionaries
3. Merge and deduplicate
4. Export as compressed JSON or SQLite `.db` file
5. Serve via a new endpoint

**On-device usage**:

```typescript
const lemmaTable: Map<string, string[]> = await loadLemmaTable('de');

function lemmatizeLocal(word: string): string[] {
  // 1. Exact lookup
  if (lemmaTable.has(word)) return lemmaTable.get(word)!;
  // 2. Lowercase lookup (for sentence-initial capitals)
  const lower = word.toLowerCase();
  if (lower !== word && lemmaTable.has(lower)) return lemmaTable.get(lower)!;
  // 3. Fallback: surface form as lemma
  return [word];
}
```

### Surface-as-Lemma

For the ~166 languages in Categories B, D, and E where surface form = lemma:

```typescript
function surfaceAsLemma(tokens: string[]): LemmatizedToken[] {
  return tokens.map((token) => ({
    text: token,
    lemmas: [{ lemma: token.toLowerCase(), probability: 1.0 }],
  }));
}
```

Lowercasing is safe for these languages — Chinese characters have no case, and the other languages use scripts without case distinctions.

### arabic-stem (Category A — Arabic)

Zero-dependency pure-JS stemmer. At 15 KB bundled, auto-included in Phase 1:

```typescript
import Stemmer from 'arabic-stem';
const arabicStemmer = new Stemmer();

function lemmatizeArabic(tokens: string[]): LemmatizedToken[] {
  return tokens.map((token) => {
    if (!/^[\w]+$/.test(token)) {
      return { text: token, lemmas: [{ lemma: token, probability: 1.0 }] };
    }
    const result = arabicStemmer.stem(token);
    const stem = result.stem[0] ?? token;
    return { text: token, lemmas: [{ lemma: stem, probability: 1.0 }] };
  });
}
```

### Snowball Stemmers

Rule-based suffix-stripping stemmers available for 15 languages via the `snowball-stemmers` npm package (~30 KB each). Snowball is a **stemmer, not a lemmatizer** — it can't resolve irregular forms. For agglutinative languages (hu, fi) the stem often equals the nominative singular lemma. For fusional languages (en, de, es, fr, it, pt) with irregular inflection, the pre-built table is the primary lemmatizer; Snowball catches forms not in the table.

---

## Per-Language Strategy Assignment

| Language Group | Tokenization | Lemmatization | Downloadable Data |
|---|---|---|---|
| **Chinese** | Intl.Segmenter or dict max-match | Surface = lemma (none needed) | 0 KB |
| **Japanese** | kuromoji (browser build + custom loader) | kuromoji `basic_form` | ~3 MB (IPADIC dict) |
| **Korean** | kuromoji-ko (browser build + custom loader) | kuromoji-ko `basic_form` | ~2 MB (mecab-ko-dic) |
| **Thai, Khmer, Burmese, Lao** | Intl.Segmenter or dict max-match | Surface = lemma (none needed) | 0 KB |
| **Arabic** | Space split (spaces exist) | arabic-stem + Qalsadi table | ~250 KB (Qalsadi table) |
| **Persian** | Space split | Pre-built lemma table (Hazm export) | ~80 KB |
| **Turkish** | Space split | snowball-stemmers (nlptoolkit dropped — Node-only) | 0 KB (Snowball bundled, no data) |
| **Russian** | Space split | Pre-built lemma table (pymorphy2 export) | ~500 KB |
| **19 LemmatizationList langs** | Space split | Pre-built lemma table | ~150 KB each |
| **17 Simplemma langs** | Space split | Pre-built lemma table (Simplemma export) | ~100 KB each |
| **~160 fallback langs** | Regex split | Surface = lemma | 0 KB |

### Bundle & Download Impact

**JS engines (bundled with app at build time as npm dependencies)**:
- kuromoji (~200 KB) + kuromoji-ko (~200 KB) + snowball-stemmers (~450 KB for 15 languages) + arabic-stem (15 KB, already in Phase 1) + koroman (~20 KB, Korean romanization)
- **Total bundled: ~885 KB**. These are npm packages — React Native cannot dynamically load arbitrary JS at runtime.

> ⚠️ **RN Compatibility**: kuromoji and kuromoji-ko use Node `fs`/`zlib` in their Node builds but ship separate browser-compatible builds (using XHR + JS inflate). We use the browser build with a custom loader function that reads local files via `expo-file-system`. nlptoolkit has NO browser build and is dropped in favor of the snowball Turkish stemmer. See [SPEC-018](../specs/018-local-tokenization-mobile.md) for details.

**Data files (downloaded on demand, triggered by SPEC-013 dictionary download)**:

| Strategy | Per-Language Download |
|---|---|
| **Download on demand** (selected) | 0 KB preloaded, ~100 KB–3 MB per language when user downloads the offline dictionary |
| Bundle all data | ~10 MB total (not recommended — forces all users to pay for all languages) |

> **Recommendation**: Bundle the ~1 MB of JS engines with the app. Download data files on demand alongside offline dictionaries. This keeps the app small for casual users while giving power users full offline capability for their chosen languages.

---

## Pronunciation / Romanization (Offline)

Offline tokens carry `pronunciation` when the local pipeline can produce it:

| Language(s) | Offline source | Notes |
|---|---|---|
| ja | kuromoji `reading` (katakana) | Furigana-style phonetics |
| zh | cedict `pronunciation` (pinyin) via WebView dict worker | Dictionary-driven; allowed because Chinese is uninflected |
| th | server-generated **Paiboon+** in the offline dictionary `pronunciation` column (same source as online `thai_g2p.py`) | Tone-marked learner romanization (`สวัสดี → sà-wàt-dii`); no RN G2P engine port needed — parity comes from the downloaded table |
| ko | `koroman` (npm) — same codebase as server PyPI `koroman` | Attached to kuromoji-ko surface forms; byte-identical to online |
| ru, bg, uk, el, hy, ka | `apps/mobile/lib/romanize.ts` — 1:1 TS port of server `romanize.py` char maps | Byte-identical to online |

`apps/mobile/lib/romanize.ts` is the single offline romanization module. Its Korean path delegates to the npm `koroman` package (the server uses the same algorithm via PyPI), and the Cyrillic/Greek/Armenian/Georgian tables are copied verbatim from the server so online/offline parity is guaranteed. It is wired into:

- `tokenizeKorean()` — kuromoji-ko tokens get romanized surface forms when no reading is present.
- `lemmatizeLocal()` — the lemma-table / snowball / surface fallback attaches romanization for all seven romanizable languages.

Non-word tokens (spaces/punctuation, `lemmas: []`) never get pronunciation.
Not covered offline: Arabic/Persian (no portable G2P — server-only), yue
(dictionary worker is zh-only for now), Burmese (phonetics suppressed).
Thai was previously in that list; it now gets Paiboon+ from the offline
dictionary's `pronunciation` column (generated server-side by the same
`thai_g2p.py` used online), so web and offline mobile show the same ruby.

---

## Language-Specific Gotchas

### Thai — The Hardest Tokenization Problem

Thai has NO spaces between words AND uses connecting glyphs:

- **Vowels can appear above, below, before, or after** the consonant they modify. A "leading vowel" like `เ` appears before the consonant but is pronounced after it, breaking naive character-by-character segmentation.
- **Tone marks** stack above consonants: `ก้`, `ป๋`, `จ๊`
- **Zero-width spaces** (U+200B) are sometimes used as word delimiters but inconsistently
- **Example**: `การใช้งาน` ("usage") — if you segment naively you might split `การ` + `ใช้งาน`, but `การใช้งาน` as a single compound is also correct depending on context.

**Recommendation**: Use `Intl.Segmenter` with Thai locale on iOS, polyfill on Android. Dictionary-based max matching as fallback. The offline dictionary provides the word list.

**Pronunciation (2026-08-08)**: the offline dictionary download now carries a
Paiboon+ reading for every Thai headword (server-generated by `thaiphon`),
so ruby works offline without porting the G2P engine to React Native.
Tokens not in the downloaded dictionary fall back to no ruby.

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
