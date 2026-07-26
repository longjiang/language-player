# SPEC-016: Non-Trivial Tokenization Languages

## Metadata
- **Spec ID**: SPEC-016
- **Feature**: Enumeration of all L2 languages requiring more than regex word-split for local tokenization/lemmatization
- **Status**: draft
- **Created**: 2026-07-26
- **See also**:
  - [SPEC-015: Local Tokenization & Lemmatization for Mobile](../specs/015-local-tokenization-mobile.md)
  - [ARCH-016: Server-Side Tokenization Pipeline](../arch/016-server-tokenization.md)
  - [ADR-0018: Tokenizer Selection](../adr/0018-tokenizer-prefer-simplemma-over-spacy.md)

---

## Overview

Of the 207 supported L2 languages in `packages/shared/src/constants.ts:SUPPORTED_L2S`, approximately **145** can be tokenized with a simple regex word-split (`/[\w']+|[^\w\s']+/g`) and need no lemmatization (surface form = lemma). This spec documents the **~62 languages that need more**.

There are two independent dimensions:

| Dimension | What It Means | Hard For |
|---|---|---|
| **Segmentation** | Splitting text into word tokens | CJK, Thai, Khmer, Burmese, Lao, Tibetan |
| **Lemmatization** | Reducing inflected words to base form | All inflected languages (verbs, plurals, cases, etc.) |

A language may need zero, one, or both.

---

## Category A: Segmentation + Lemmatization (5 languages)

These languages cannot be split by spaces AND have inflectional morphology.

| Code | Language | Segmentation Strategy | Lemmatization Strategy | Server Engine |
|---|---|---|---|---|
| `ja` | Japanese | **kuromoji** (pure JS, same IPADIC dict as MeCab) | **kuromoji** — `basic_form` gives lemma directly（食べた→食べる, 美味しかった→美味しい） | MeCab |
| `ko` | Korean | Spaces exist ✅ but agglutinative | Pre-built stem table (Okt export: `먹어요→먹다`) | Okt (konlpy) |
| `ar` | Arabic | Spaces exist ✅ but root-based morphology | Pre-built lemma table (Qalsadi export: `السلام→سلام`) | Qalsadi + Mishkal |
| `fa` | Persian | Spaces exist ✅ but verb-heavy inflection | Pre-built lemma table (Hazm export: `دارد→داشتن`) | Hazm + PersianG2p |
| `tr` | Turkish | Spaces exist ✅ but highly agglutinative | Suffix-stripping rules + lemma table (Zeyrek export: `gördüm→görmek`) | Zeyrek |

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

## Category C: Lemmatization-Only (37 languages)

These languages use spaces between words (or other reliable delimiters) for tokenization, but words **do inflect** and need lemma reduction.

### C1 — LemmatizationList Available (18 languages)

Pre-computed `{surface: [lemma]}` TSV files already exist on the server at `data/lemmatization-lists/lemmatization-{code}.txt`. These are the highest-quality lemma sources.

| Code | Language | Notes |
|---|---|---|
| `ca` | Catalan | |
| `cs` | Czech | Rich case system (7 cases) |
| `cy` | Welsh | Simplemma excluded — apostrophe issues |
| `de` | German | Case + gender + plural umlaut |
| `en` | English | Irregular past/participles + plurals |
| `es` | Spanish | Extensive verb conjugation |
| `fr` | French | Verb conjugation; Simplemma excluded (bad verb lemmas) |
| `ga` | Irish | Initial mutations (séimhiú, urú) |
| `gl` | Galician | |
| `gv` | Manx | |
| `hu` | Hungarian | Agglutinative (18+ cases) |
| `it` | Italian | Verb conjugation |
| `pt` | Portuguese | Verb conjugation |
| `ro` | Romanian | |
| `sk` | Slovak | |
| `sl` | Slovenian | Dual number! |
| `sv` | Swedish | |
| `uk` | Ukrainian | Case system |

### C2 — Simplemma Available (18 languages)

Dictionary-based lemmatizer data available from the Simplemma Python package. Can be exported to JSON/SQLite.

| Code | Language | Notes |
|---|---|---|
| `bg` | Bulgarian | |
| `da` | Danish | |
| `el` | Greek | |
| `et` | Estonian | Agglutinative (14 cases) |
| `fi` | Finnish | Highly agglutinative (15 cases) |
| `hy` | Armenian | |
| `id` | Indonesian | Limited inflection (mostly prefix/suffix) |
| `is` | Icelandic | Complex inflection preserved from Old Norse |
| `ka` | Georgian | Agglutinative, complex verb system |
| `la` | Latin | 5 declensions, 4 conjugations |
| `lv` | Latvian | |
| `lt` | Lithuanian | Complex case system, pitch accent |
| `nb` | Norwegian Bokmål | |
| `nn` | Norwegian Nynorsk | |
| `nl` | Dutch | |
| `pl` | Polish | 7 cases, 3 genders |
| `sq` | Albanian | |
| `sw` | Swahili | Noun class prefixes (m-/wa-, ki-/vi-, etc.) |

### C3 — spaCy-Only (1 language)

No LemmatizationList or Simplemma available. spaCy is the only option.

| Code | Language | Notes |
|---|---|---|
| `hr` | Croatian | 7 cases; no lighter lemmatizer alternative exists |

### C4 — Dedicated Server Engine (1 language)

Rich inflection handled by a specialized server engine. Needs a pre-built lemma table exported from that engine's output.

| Code | Language | Notes | Server Engine |
|---|---|---|---|
| `ru` | Russian | 6 cases, 3 genders, verb aspect pairs; highly inflected | pymorphy2 |

---

## Category D: Special Cases (4 languages)

Languages that don't fit cleanly into the above categories.

| Code | Language | Issue | Strategy |
|---|---|---|---|
| `vi` | Vietnamese | Spaces between **syllables**, not words. Compounds like `trường đại học` (university) should be joined. No inflection. | Space-split is acceptable for tokenization; pyvi-style compound joining is a nice-to-have. Surface = lemma. |
| `hi` | Hindi | Spaces exist but postpositions can blur word boundaries. Simplemma excluded (breaks too many words). No equivalent of Devanagari spaCy model available locally. | Space-split + surface-as-lemma for now. Server fallback for better results. |
| `ast` | Asturian | Both LemmatizationList and Simplemma available (covers it well). Listed as special only because it's a small Romance language with dialectal variation. | LemmatizationList table. |
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
| **C1** — LemmatizationList | 18 | Trivial (spaces) | Pre-built TSV table | ~100–300 KB |
| **C2** — Simplemma | 18 | Trivial (spaces) | Pre-built dict table | ~50–200 KB |
| **C3** — spaCy-Only | 1 (`hr`) | Trivial (spaces) | spaCy or server fallback | Server-dependent |
| **C4** — Dedicated Engine | 1 (`ru`) | Trivial (spaces) | pymorphy2 export table | ~300–500 KB |
| **D** — Special | 4 (`vi`, `hi`, `ast`, `tlh`) | Trivial-ish | Varies | Minimal |
| **E** — Regex-Only | ~145 | Trivial (spaces) | None | 0 KB |
| **Total** | **207** | | | |

---

## Phase 1 Implementation Scope

Following the recommendation in SPEC-015, Phase 1 covers the biggest wins at zero bundle cost:

| What | Languages Covered |
|---|---|
| Regex word-split tokenizer | All 207 (trivial) |
| Surface-as-lemma | Categories B, D (vi, hi, tlh), E = **~165 languages** |
| Server fallback for everything else | Categories A, C1–C4 = **~42 languages** |

This means Phase 1 alone gives **functional offline tokenization** for ~80% of all supported L2s with **zero additional bundle size** and **zero new dependencies**.

## See Also

- [SPEC-015: Local Tokenization & Lemmatization for Mobile](../specs/015-local-tokenization-mobile.md) — detailed strategies and gotchas
- [ARCH-016: Server-Side Tokenization Pipeline](../arch/016-server-tokenization.md) — server tokenizer inventory
- [ADR-0018: Tokenizer Selection](../adr/0018-tokenizer-prefer-simplemma-over-spacy.md) — preference order
