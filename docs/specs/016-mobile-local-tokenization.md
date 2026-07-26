# SPEC-016: Mobile Local Tokenization

## Metadata
- **Spec ID**: SPEC-016
- **Feature**: On-device tokenization & lemmatization fallback for offline use, with downloadable language packs
- **Status**: draft
- **Created**: 2026-07-26
- **See also**:
  - [SPEC-015: Local Tokenization & Lemmatization for Mobile](../specs/015-local-tokenization-mobile.md)
  - [SPEC-013: Mobile Offline Dictionary](../specs/013-mobile-offline-dictionary.md)
  - [ARCH-016: Server-Side Tokenization Pipeline](../arch/016-server-tokenization.md)
  - [ADR-0018: Tokenizer Selection](../adr/0018-tokenizer-prefer-simplemma-over-spacy.md)

---

## Overview

Of the 207 supported L2 languages in `packages/shared/src/constants.ts:SUPPORTED_L2S`, approximately **146** can be tokenized with a simple regex word-split (`/[\w']+|[^\w\s']+/g`) and need no lemmatization (surface form = lemma). This spec documents the **~61 languages that need more**.

There are two independent dimensions:

| Dimension | What It Means | Hard For |
|---|---|---|
| **Segmentation** | Splitting text into word tokens | CJK, Thai, Khmer, Burmese, Lao, Tibetan |
| **Lemmatization** | Reducing inflected words to base form | All inflected languages (verbs, plurals, cases, etc.) |

A language may need zero, one, or both.

### Priority: Server First, Local as Fallback

Local tokenization exists for **graceful offline degradation** (airplane mode, tunnels, poor connectivity). The server always wins when reachable:

```
1. POST /lemmatize-normalized  →  Server (best accuracy, always preferred)
2. Local JS library             →  kuromoji, arabic-stem, nlptoolkit, snowball-stemmers, etc.
3. Downloaded lemma table       →  Language pack stored in SQLite (SPEC-013 pattern)
4. Regex word-split + surface   →  Last resort (~146 languages, zero cost)
```

Tokenizers and lemma tables are **downloadable on demand**, following the same UX pattern as offline dictionaries (see [SPEC-013](../specs/013-mobile-offline-dictionary.md)): the user selects a language, downloads its tokenizer/lemma pack, and it's stored locally in SQLite. No tokenizers are bundled with the app — everything is opt-in.

---

## Category A: Segmentation + Lemmatization (5 languages)

These languages cannot be split by spaces AND have inflectional morphology.

| Code | Language | Segmentation Strategy | Lemmatization Strategy | Server Engine |
|---|---|---|---|---|
| `ja` | Japanese | **kuromoji** (pure JS, same IPADIC dict as MeCab) | **kuromoji** — `basic_form` gives lemma directly（食べた→食べる, 美味しかった→美味しい） | MeCab |
| `ko` | Korean | **kuromoji-ko** (pure TS, based on mecab-ko-dic) | **kuromoji-ko** — `basic_form` gives stem directly（먹었겠습니다→먹다, 했어요→하다） | Okt (konlpy) |
| `ar` | Arabic | Spaces exist ✅ | **`arabic-stem`** (pure JS, 15 KB) — zero-dep prefix/suffix stemmer（المستنقعات→نقع）; supplemental Qalsadi export table for production accuracy | Qalsadi + Mishkal |
| `fa` | Persian | Spaces exist ✅ | **No JS lemmatizer exists.** Pre-built lemma table from server Hazm export（دارد→داشتن）is the only viable approach. | Hazm + PersianG2p |
| `tr` | Turkish | Spaces exist ✅ | **`nlptoolkit-morphologicalanalysis`** (pure JS/TS, ~2 MB dict) — full finite-state transducer morphological analyzer（yarına→yar+NOUN+DAT）; lighter alt: `snowball-stemmers` (~50 KB) | Zeyrek |

**Japanese: kuromoji is the recommended approach.** kuromoji is a pure-JavaScript port of the same IPADIC dictionary that MeCab uses on the server. A single library call handles both segmentation and lemmatization:

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

Japanese verbs have rich conjugation:

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

| Form | Surface | Lemma (kuromoji `basic_form`) |
|---|---|---|
| Dictionary | 美味しい | 美味しい |
| Past | 美味しかった | 美味しい |
| Te-form | 美味しくて | 美味しい |
| Negative | 美味しくない | 美味しい |

**Dictionary size tradeoff**: Full IPADIC is ~15 MB. Pruned to top 30K frequency-ranked entries → ~3 MB. Recommend downloading on demand (like SPEC-013 offline dictionaries) rather than bundling for all users. kuromoji requires no native modules — it works in React Native as pure JavaScript.

**Korean: kuromoji-ko is the recommended approach.** `kuromoji-ko` is a pure-TypeScript port of kuromoji.js adapted for mecab-ko-dic, the same dictionary format the server uses via konlpy/Okt. Like its Japanese counterpart, a single library call handles both segmentation and lemmatization:

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

**Arabic: `arabic-stem` is the recommended approach.** A zero-dependency pure-JS Arabic word stemmer that strips the definite article (الـ), common prefixes (مـ, تـ, يـ, استـ), and suffixes to extract the root:

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

**Persian: no JS lemmatizer exists.** Despite extensive searching of npm, GitHub, and the broader JS ecosystem, there is no Persian morphological analyzer or lemmatizer in JavaScript. The Persian NLP community primarily uses Python (Hazm, parsivar) and no one has ported these to JS. Persian npm packages are almost exclusively calendar/date utilities.

**Recommendation**: Pre-built lemma table exported from the server's Hazm engine. The server runs `lemmatize_persian.py` which calls Hazm's `lemmatizer.lemmatize()` — we export the resulting `{surface_form: [lemma1, lemma2, ...]}` mapping as JSON/SQLite. Persian has ~5,000 commonly inflected forms (mainly verbs — other POS classes have minimal inflection), so the table is compact (~80 KB).

```js
// Pre-built table lookup (exported from server Hazm)
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

**Turkish: `nlptoolkit-morphologicalanalysis` is the recommended approach.** A pure-JS/TS implementation of a published academic morphological analyzer (RANLP 2019). Uses a finite-state transducer with a full Turkish dictionary:

```js
import { FsmMorphologicalAnalyzer } from 'nlptoolkit-morphologicalanalysis';

const fsm = new FsmMorphologicalAnalyzer();
const parseList = fsm.morphologicalAnalysis('yarına');
// → yar+NOUN+A3SG+P2SG+DAT  (to my tomorrow/precipice)
// → yar+NOUN+A3SG+P3SG+DAT  (to his/her tomorrow/precipice)
// → yarı+NOUN+A3SG+P2SG+DAT (to my half)
// → yarın+NOUN+A3SG+PNON+DAT (to tomorrow)
```

Handles the full Turkish agglutinative complexity. The canonical example `Batılılaştırılamayanlardanmışız` ("it appears we are among the ones that cannot be westernized") parses correctly into all constituent morphemes. Processes "hundreds of thousands of words per second" per the published benchmarks.

The ecosystem (StarlangSoftware) has ports in Java, Python, C++, C, Swift, C# — it's a well-maintained academic project. Dependencies are 5 other `nlptoolkit-*` packages (dictionary, math, util, etc.), all pure JS/TS.

| Surface | Analysis | Lemma |
|---|---|---|
| yarına | yar+NOUN+DAT, yarın+NOUN+DAT | yar / yarın |
| gördüm | gör+VERB+PAST+A1SG | görmek |
| evlerimizden | ev+NOUN+PL+P1PL+ABL | ev |
| yapamayacaklar | yap+VERB+NEG+ABIL+FUT+A3PL | yapmak |

**Dictionary size**: ~2 MB (Turkish lexicon + FSM XML). Not prunable like kuromoji — the FST needs the full rule engine. Download on demand.

**Lighter alternative**: `snowball-stemmers` includes the Snowball Turkish stemmer (~50 KB, rule-based suffix stripping). Less accurate (~80%) but zero setup — useful as a fallback or for Phase 1.

---

## Category B: Segmentation-Only (16 languages)

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

---

## Category C: Lemmatization-Only (36 languages)

These languages use spaces between words (or other reliable delimiters) for tokenization, but words **do inflect** and need lemma reduction.

### C1 — LemmatizationList Available (18 languages)

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
| `ast` | Asturian | LemmatizationList table | — | 108K rows — larger than many C1 langs. Romance; dialectal variation doesn't affect lemmatization. |

### C2 — Simplemma Available (17 languages)

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

### C3 — spaCy-Only (1 language)

No LemmatizationList or Simplemma available. spaCy is the only option.

| Code | Language | Strategy | JS Library | Notes |
|---|---|---|---|---|
| `hr` | Croatian | spaCy export table | **Nothing** ❌ — spaCy is Python-only | 7 cases; no JS library available. Server spaCy export table (~800 KB gzipped). |

### C4 — Dedicated Server Engine (1 language)

Rich inflection handled by a specialized server engine. Needs a pre-built lemma table exported from that engine's output.

| Code | Language | Strategy | JS Library | Notes | Server Engine |
|---|---|---|---|---|---|
| `ru` | Russian | pymorphy2 export table | `snowball-stemmers` (Snowball Russian is available as fallback) | 6 cases, 3 genders, verb aspect pairs; highly inflected | pymorphy2 |

### Agglutinative Languages in Category C

These languages have high surface-form-to-lemma ratios (thousands of inflected forms per lemma). Pre-built lemma tables are essential — rule-based stemmers like Snowball provide a baseline but won't match dedicated morphological analyzer accuracy:

| Code | Language | Family | Cases/Features | Local Option |
|---|---|---|---|---|
| `hu` | Hungarian | Uralic (Ugric) | 18+ cases, possessive suffixes | `snowball-stemmers` ✅ (~80%) + LemmatizationList table |
| `fi` | Finnish | Uralic (Finnic) | 15 cases, consonant gradation | `snowball-stemmers` ✅ (~80%) + Simplemma table |
| `et` | Estonian | Uralic (Finnic) | 14 cases, lost vowel harmony | ⚠️ Snowball upstream exists; npm uncertain. Simplemma table. |
| `ka` | Georgian | Kartvelian | Polypersonal verb agreement, screeves | **Nothing.** Pre-built Simplemma table only. |
| `sw` | Swahili | Bantu (Niger-Congo) | Noun class prefixes (8+ classes) | **Nothing.** Pre-built Simplemma table + prefix-stripper fallback. |

**Note**: Indonesian (`id`) is **not agglutinative** — it's analytic/isolating with derivational prefixes only. Surface-as-lemma works for Indonesian. It has been moved to Category E (regex-only).

---

## Category D: Special Cases (3 languages)

Languages that don't fit cleanly into the above categories.

| Code | Language | Issue | Strategy |
|---|---|---|---|
| `vi` | Vietnamese | Spaces between **syllables**, not words. Compounds like `trường đại học` (university) should be joined. No inflection. | Space-split is acceptable for tokenization; pyvi-style compound joining is a nice-to-have. Surface = lemma. |
| `hi` | Hindi | Spaces exist but postpositions can blur word boundaries. Simplemma excluded (breaks too many words). No equivalent of Devanagari spaCy model available locally. | Space-split + surface-as-lemma for now. Server fallback for better results. |
| `tlh` | Klingon | Apostrophes are part of words (`puqbe'pu'`). Regex tokenizer must treat `'` as a word character. | Regex `[\w']+` handles it correctly. |

---

## Category E: Regex-Only (~145 languages)

Everything else. Tokenization: `text.match(/[\w']+|[^\w\s']+/g)`. Lemmatization: surface form = lemma. Zero additional work needed.

A sampling: `af`, `am`, `az`, `bn`, `eo`, `eu`, `fo`, `fy`, `gd`, `gu`, `ha`, `he`, `kn`, `ku`, `ky`, `mg`, `mi`, `ml`, `mn`, `mr`, `mt`, `ne`, `no`, `oc`, `or`, `pa`, `ps`, `qu`, `sa`, `sd`, `si`, `sm`, `so`, `sr`, `su`, `ta`, `te`, `tg`, `tl`, `tt`, `ug`, `ur`, `uz`, `wo`, `xh`, `yi`, `yo`, `zu`, and ~100 more.

---

## Summary Matrix

| Category | Count | Segmentation | Lemmatization | Bundle Cost per Lang |
|---|---|---|---|---|
| **A** — Both | 5 (`ja`, `ko`, `ar`, `fa`, `tr`) | Complex | Complex | ~200–500 KB |
| **B** — Segmentation-Only | 16 (11 Chinese varieties + `th`, `km`, `lo`, `my`, `bo`) | Complex | None | 0 KB (Intl.Segmenter) |
| **C1** — LemmatizationList | 19 | Trivial (spaces) | Pre-built TSV table | ~100–300 KB |
| **C2** — Simplemma | 17 | Trivial (spaces) | Pre-built dict table | ~50–200 KB |
| **C3** — spaCy-Only | 1 (`hr`) | Trivial (spaces) | spaCy or server fallback | Server-dependent |
| **C4** — Dedicated Engine | 1 (`ru`) | Trivial (spaces) | pymorphy2 export table | ~300–500 KB |
| **D** — Special | 3 (`vi`, `hi`, `tlh`) | Trivial-ish | Varies | Minimal |
| **E** — Regex-Only | ~146 | Trivial (spaces) | None | 0 KB |
| **Total** | **207** | | | |

---

## Phase 1 Implementation Scope

Following the recommendation in SPEC-015, Phase 1 covers the biggest wins at zero bundle cost:

| What | Languages Covered |
|---|---|
| Regex word-split tokenizer | All 207 (trivial) |
| Surface-as-lemma | Categories B, D (vi, hi, tlh, id), E = **~166 languages** |
| `arabic-stem` (zero-dep, 15 KB) | Arabic — stemmer covers ~85% of forms |
| Server fallback (`POST /lemmatize-normalized`) | Everything else when offline packs aren't downloaded |

### Phase 2 — Downloadable Language Packs (on demand, same UX as SPEC-013 offline dictionaries)

Users download tokenizer/lemma packs per language. Nothing is bundled — everything is opt-in and stored in SQLite.

| Downloadable Pack | Language(s) | Size | Offline Fallback When |
|---|---|---|---|
| `kuromoji` + IPADIC dict (pruned top 30K) | Japanese | ~3 MB | Server unreachable |
| `kuromoji-ko` + mecab-ko-dic (pruned) | Korean | ~2 MB | Server unreachable |
| `nlptoolkit-morphologicalanalysis` | Turkish | ~2 MB | Server unreachable |
| Persian lemma table (Hazm export) | Persian | ~80 KB | Server unreachable |
| `snowball-stemmers` (stemmer fallback) | de, en, es, fr, ga, it, pt, ro, sv, da, nb, nl, hu, fi, hy | ~30 KB each | Server unreachable; catches forms not in lemma table |
| Pre-built lemma tables | ca, cs, cy, gl, gv, sk, sl, uk, bg, el, et, is, la, lv, lt, nn, pl, sq, hr, ru, ka, sw, ast | ~100–500 KB each | Server unreachable; primary offline lemmatizer for these langs |

**Server always wins when reachable.** Local tokenization is strictly a fallback for offline use (airplane mode, tunnels, poor connectivity).

This means Phase 1 alone gives **functional offline tokenization** for ~80% of all supported L2s with **zero additional bundle size** and **near-zero new dependencies** (only `arabic-stem` at 15 KB). Phase 2 adds downloadable packs for the remaining ~20%.

---

## UI: Offline Tokenizers Settings Screen

### New Tab: "Offline Tokenizers"

A new tab in **Settings → Offline Tokenizers**, sibling to the existing "Offline Dictionaries" (SPEC-013). Same download UX pattern, different data.

### Tokenizer Categories per Language

Each language gets a row showing what tokenizer it uses and whether a download is available:

| Category | What It Means | UI Treatment |
|---|---|---|
| **Built-in (free)** | Regex word-split. Works offline with zero download. ~146 languages. | Shows ✅ "Built-in" with green check. No download button. |
| **Downloadable library** | kuromoji, kuromoji-ko, nlptoolkit, etc. Must download to use offline. | Shows download button with size. Progress bar during download. |
| **Downloadable table** | Pre-built lemma table (LemmatizationList, Simplemma, spaCy export). | Shows download button with size. Progress bar during download. |
| **Server-only** | No local option exists yet. Server fallback is the only path. | Shows "Online only" with cloud icon. |

### Screen Layout

```
┌──────────────────────────────────────┐
│  ← {title.offline_tokenizers}        │
│                                      │
│  {msg.offline_tokenizers_desc}       │
│                                      │
│  ── {label.downloaded} ──           │
│                                      │
│  {$lang.en}  English                 │
│  ├─ ✅ Built-in — regex word-split   │  ← Free, always "downloaded"
│  └─ {label.words} tokenized offline  │
│                                      │
│  {$lang.ja}  Japanese                │
│  ├─ 📦 kuromoji · ~3 MB              │  ← Downloadable library
│  ├─ ████████████░░░░  78%           │  ← Progress during download
│  └─ [{action.cancel}]               │
│                                      │
│  {$lang.es}  Spanish                 │
│  ├─ 📋 Lemma table · ~200 KB         │  ← Downloadable table
│  └─ [{action.download}]             │
│                                      │
│  {$lang.zh}  Chinese                 │
│  ├─ ✅ Built-in — Intl.Segmenter     │  ← Segmentation is free via
│  └─ {label.words} segmented offline  │     Intl.Segmenter (built-in API)
│                                      │
│  ── {label.available} ──            │
│                                      │
│  {$lang.ko}  Korean                  │
│  ├─ 📦 kuromoji-ko · ~2 MB          │
│  └─ [{action.download}]             │
│                                      │
│  {$lang.tr}  Turkish                 │
│  ├─ 📦 nlptoolkit · ~2 MB           │
│  └─ [{action.download}]             │
│                                      │
│  {$lang.de}  German                  │
│  ├─ 📋 Lemma table · ~300 KB        │
│  └─ [{action.download}]             │
│                                      │
│  {$lang.ar}  Arabic                  │
│  ├─ 📦 arabic-stem · 15 KB          │  ← Tiny — auto-downloaded
│  ├─ 📋 Lemma table · ~250 KB        │     in Phase 1
│  └─ [{action.download}]             │
│                                      │
│  {$lang.hr}  Croatian                │
│  ├─ ☁️ Online only                  │  ← No local option; server only
│  └─ No offline tokenizer available   │
│                                      │
│  ──────────────────────────────────  │
│  {msg.storage_usage}                 │
│                                      │
│  [{action.delete_all}]               │
└──────────────────────────────────────┘
```

### Row States

Each language row has one of these states:

| State | Icon | Subtext | Action Button |
|---|---|---|---|
| **Built-in** (regex) | ✅ | "Regex word-split — always available" | None |
| **Built-in** (Intl.Segmenter) | ✅ | "Uses built-in text segmentation" | None |
| **Not downloaded** | 📦 or 📋 | "kuromoji · ~3 MB" or "Lemma table · ~200 KB" | `[{action.download}]` |
| **Downloading** | ↓ | Progress bar + "{downloaded}/{total}" | `[{action.cancel}]` |
| **Downloaded** | ✅ | "Saved · Jul 15" | `[{action.delete}]` |
| **Online only** | ☁️ | "No offline tokenizer available" | None |
| **Download failed** | ⚠️ | "Tap to retry" | `[{action.download}]` |

### "Built-in" Languages (no download needed)

These always show as downloaded with a green check:

| Tokenizer Type | Languages | Label |
|---|---|---|
| Regex word-split | ~146 Category E + B languages | "Regex word-split — always available" |
| Intl.Segmenter (built-in API) | `zh`, `ja`, `th`, `km`, `lo`, `my`, `bo` (when Intl.Segmenter is available on device) | "Uses built-in text segmentation" |
| `arabic-stem` | `ar` | "arabic-stem · 15 KB — included" (auto-downloaded in Phase 1) |

> **Intl.Segmenter availability**: On iOS (JavaScriptCore), Intl.Segmenter is native and supports zh/ja/ko/th/lo/km/my word segmentation. On Android (Hermes), the `@formatjs/intl-segmenter` polyfill (~30 KB) provides the same. The UI reflects actual device capability — if polyfill not yet loaded, the row shows as downloadable instead of built-in.

### Current L2 Priority

The user's current L2 always appears first in the Available list (if not already downloaded), marked with a subtle "★ Current" badge — same pattern as SPEC-013's offline dictionaries screen.

### Storage Summary

Footer shows total offline tokenizer storage used vs. available, identical to SPEC-013:

> `{msg.storage_usage}`: "Storage: 8.2 MB used of 12.1 GB free"

### i18n Keys Required (~15 new keys)

| Key | English Text | Used In |
|---|---|---|
| `title.offline_tokenizers` | Offline Tokenizers | Settings tab title |
| `msg.offline_tokenizers_desc` | Download tokenizers to process text without an internet connection. Built-in tokenizers work offline automatically. | Page subtitle |
| `label.built_in` | Built-in | Row status for regex/Intl.Segmenter |
| `label.lemma_table` | Lemma table | Downloadable pack type label |
| `msg.tokenizer_built_in_regex` | Regex word-split — always available | Built-in row subtext |
| `msg.tokenizer_built_in_segmenter` | Uses built-in text segmentation | Intl.Segmenter row subtext |
| `msg.tokenizer_online_only` | No offline tokenizer available | Online-only row subtext |
| `label.tokenizer_size` | {type} · {size} | Row subtext for downloadable packs |
| `msg.confirm_delete_tokenizer` | Delete offline tokenizer for {lang}? You'll need internet to tokenize text. | Delete confirmation |
| `msg.tokenizer_ready` | {lang} tokenizer ready | Completion toast |
| `action.download` | Download | (reused from SPEC-013) |
| `action.cancel` | Cancel | (reused) |
| `action.delete` | Delete | (reused) |
| `action.delete_all` | Delete All Offline Data | (reused) |
| `msg.storage_usage` | Storage: {used} used of {free} free | (reused) |

### Files to Touch

| File | Change |
|---|---|
| `apps/mobile/app/(tabs)/(me)/offline-tokenizers.tsx` | **NEW** — Tokenizer download management screen |
| `apps/mobile/app/(tabs)/(me)/settings.tsx` | Add "Offline Tokenizers" tab |
| `apps/mobile/lib/tokenizer-db.ts` | **NEW** — SQLite table for downloaded tokenizer/lemma packs, lookup functions |
| `apps/mobile/contexts/DictionaryContext.tsx` | Add `tokenizeOffline()` fallback chain (server → local library → lemma table → regex) |
| `packages/shared/src/constants.ts` | Add `TOKENIZER_CONFIG` map: language → tokenizer type + size + download URL |

---

## See Also

- [SPEC-015: Local Tokenization & Lemmatization for Mobile](../specs/015-local-tokenization-mobile.md) — detailed strategies and gotchas
- [SPEC-013: Mobile Offline Dictionary](../specs/013-mobile-offline-dictionary.md) — download UX pattern this spec follows
- [ARCH-016: Server-Side Tokenization Pipeline](../arch/016-server-tokenization.md) — server tokenizer inventory
- [ADR-0018: Tokenizer Selection](../adr/0018-tokenizer-prefer-simplemma-over-spacy.md) — preference order
