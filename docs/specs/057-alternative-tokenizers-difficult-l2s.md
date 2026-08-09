# SPEC-057 — Alternative Tokenizer / Lemmatizer Research for Low-Scoring L2s (ar, he, hi, id, tr)

## Metadata

- **Spec ID**: SPEC-057
- **Feature**: Research-backed plan to raise tokenization/lemmatization quality for the five L2s that score below A in SPEC-056
- **Status**: draft
- **Created**: 2026-08-09
- **Scope**: `zerotohero-python-server` lemmatization modules, `LEMMATIZER_REGISTRY`, lemma/dictionary tables
- **Related specs**: [SPEC-056 — Automated Tokenization Eval](056-automated-tokenization-eval.md) · [SPEC-055 — Local Tokenizer Testing Checklist](055-local-tokenizer-testing.md) · [SPEC-018 — Mobile Local Tokenization](018-local-tokenization-mobile.md)
- **Related architecture/ADRs**: [ARCH-016 — Server Tokenization Pipeline](../arch/016-server-tokenization.md) · [ADR-0018 — Prefer Simplemma over spaCy](../adr/0018-tokenizer-prefer-simplemma-over-spacy.md) · [ADR-0029 — Registry / Lemma Table Single Source of Truth](../adr/0029-registry-single-source-of-truth.md) · [ADR-0030 — Data-Driven Popular L2 List](../adr/0030-popular-l2-list-usage-data.md)

---

## Overview

SPEC-056 scored the Flask tokenization/lemmatization pipeline against real
Wikipedia corpora for the 19 popular L2s. 14 languages score A, but five fall
below it: Hebrew (B), Hindi (C), Arabic (C), Turkish (D), and Indonesian (D).
This spec records the research done on 2026-08-09 into alternative
tokenizer/lemmatizer options for those five, with per-language
recommendations, license checks, and a phased implementation plan.

It keeps ADR-0018's stance — lightweight dictionaries preferred, spaCy as last
resort — but explicitly allows exceptions for difficult languages where a
heavier model is materially more accurate and the latency/cost is acceptable
server-side.

---

## 1. Scorecard Motivation

From SPEC-056 §4.1 (2026-08-09, local Flask, 200-token budget per L2):

| L2 | Score | Grade | Primary issue | Current engine |
|---|---:|---|---|---|
| `he` | 86.3 | B | Tokenization fine; dictionary hit rate 9% | regex fallback (surface-as-lemma) |
| `hi` | 77.8 | C | Devanagari split near char-level (avg token len ≈ 1.36) | regex fallback (surface-as-lemma) |
| `ar` | 73.5 | C | Known Qalsadi lemma bugs; punctuation-adjacent space loss | Qalsadi + Mishkal |
| `tr` | 65.8 | D | Apostrophe dropped in suffixed forms; dictionary hit 31% | Zeyrek |
| `id` | 62.1 | D | Corpus table/percent mangling; dictionary hit 20% | Simplemma |

Dictionary coverage is the biggest systemic gap across the suite (`he` 9%,
`id` 20%, `tr` 31%, `yue` 33%, `ru` 41%, `ko` 43%), but this spec focuses on
the tokenizer/lemmatizer side; dictionary coverage is tracked as a data task in
[§6 Phase 3](#6-implementation-plan).

---

## 2. Constraints

- **ADR-0018 ordering**: LemmatizationList > Simplemma > spaCy. spaCy was
  demoted because it is slow. Exceptions are allowed for hard languages where a
  heavier model is materially more accurate, but only server-side with caching
  (warm-cache latency is what the scorecard measures).
- **Unified schema**: every engine must keep producing
  `{ text, lemmas[], pronunciation }` and flow through `_recover_spaces`, so
  reconstruction stays byte-exact (25% of the SPEC-056 score).
- **Licensing**: Language Player is a paid product. Models/data under
  CC BY-NC-SA are a production blocker; every newly added engine/data package
  needs a license review recorded before merge.
- **ADR-0029**: lemma tables are the single source of truth. Model-derived
  tables need the same license review as the model itself.
- **Offline (mobile)**: keep local tokenizers per SPEC-018; heavier models are
  server-only unless we export a compliant lemma table.

---

## 3. Verified Current Routing (2026-08-09)

- `ar` → `lemmatize_arabic` (Qalsadi + Mishkal)
- `tr` → `lemmatize_turkish` (Zeyrek)
- `id` → `lemmatize_simple` (Simplemma)
- `hi` and `he` are **not** in `LEMMATIZER_REGISTRY` — both fall through to
  `_fallback_lemmatize` (regex `[\w']+`, surface-as-lemma). This matches
  ADR-0018, which excludes Hindi from Simplemma (`hin` → "spaCy or
  BaseTokenizer"). ARCH-016's mapping table listing `hin` is simplemma's
  supported ISO mapping, not a registry assignment — the registry has no
  `hi`/`hin` entry by design. Follow-up (2026-08-09): `hi`/`hin` now route to
  spaCy's multilingual `xx_ent_wiki_sm` — the ADR's named fallback.

The Hindi char-splitting is therefore the fallback regex: Python `re`'s `\w`
excludes Unicode combining marks (category Mn/Mc/Me — Devanagari matras are
mostly Mc), so Devanagari matras split off (`हिन्दी → ह`). Hebrew letters are
`\w`, so Hebrew tokenization through the same fallback is fine — its B grade
is entirely the dictionary hit rate.

---

## 4. Research per Language

### 4.1 Arabic (`ar`) — C, target A

**Current**: Qalsadi lemmatizer + Mishkal vocalizer + pyarabic (ARCH-016).
Known lemma bugs (`كتبتها→تب`, `أعني→أعنة`) plus punctuation-adjacent space
loss (`«النصر»؛«من»`).

**Alternatives**:

| Tool | Notes |
|---|---|
| **CAMeL Tools** (`camel_tools`) | **Recommended primary.** MIT-licensed code; mature morphological analyzer (MLE + DBpedia morphology), orthographic normalization, diacritization, tokenization + lemma + POS. `camel_data -l light` keeps runtime small; optional BERT disambiguator (`bert-unfactored`) for accuracy. Directly addresses Qalsadi's bugs. |
| Farasa | Strong segmentation, but JVM/Java-based → more ops burden. |
| MADAMIRA | Accurate but Java/dated; not recommended. |
| Stanza `ar` (UD PADT) | Accurate; slower; per-model license (treebank-derived) — verify before use. |
| UDPipe `arabic-padt` | Fast; models are CC BY-NC-SA → non-commercial blocker. |

**Action**: prototype CAMeL Tools against the SPEC-056 corpus and spot-checks;
independently fix `_recover_spaces` for punctuation-adjacent spaces.

**Prototype (2026-08-09)**: CAMeL Tools 1.5.7 with the `light` data set (MLE
disambiguator + `calima-msa-r13`) vs Qalsadi on the SPEC-056 Arabic corpus
(one 200-token block). CAMeL passes **5/5** lemma spot-checks vs Qalsadi's
2/5, including both documented bugs and one surface-lemma case:

| Surface | Qalsadi (current) | CAMeL |
|---|---|---|
| `كتبتها` | `تب` | `كتب` |
| `أعني` | `أعنة` | `عنى` |
| `يتحدثها` | `يتحدثها` (surface) | `تحدث` |
| `اللغات` | `لغة` | `لغة` |
| `المتحدثون` | `متحدث` | `متحدث` |

Lemma coverage is 100% vs 99%; reconstruction is byte-exact (100%) for both;
dictionary hit is unchanged at 46% (the gap is dictionary data, not the
lemmatizer). Warm latency is ~202 ms per 200-token block (~1 ms/token) plus a
~5 s one-time load; Qalsadi is ~11 ms/block. **License blocker**: the MSA
morphology DB and MLE model shipped by `camel_data -i light` are **GPL v2**
(`morphology-db-msa-r13`, `disambig-mle-calima-msa-r13`), and `light` also
installs `morphology-db-msa-s31`, which is **LDC-licensed** (SAMA 3.1). The MIT
code license does not clear the data packages, but GPL v2 server-side use is
accepted in this architecture (Qalsadi GPL-3.0 already runs in the server
tree), so **CAMeL is adopted as the primary Arabic engine** — see
[Phase 2 results](#phase-2-results).

### 4.2 Hebrew (`he`) — B, target A/B+

**Current**: regex fallback (surface-as-lemma). Tokenization itself is perfect
in the eval; the score is dominated by the 9% dictionary hit rate.

**Alternatives**:

| Tool | Notes |
|---|---|
| UDPipe `hebrew-htb` | Accurate + fast; models CC BY-NC-SA → licensing blocker for production. |
| **Stanza `he`** | Strong UD model (tokenization + lemmas + POS); slower; per-model license (treebank-derived) — verify. Best candidate if licensing clears. |
| **DictaBERT-lex** (`dicta-il/dictabert-lex`) | State-of-the-art Hebrew lemmatization (fine-tuned BERT mapping surface → lexeme). Transformer runtime → best used to **generate a lemma table** (ADR-0029) rather than as a live per-block API. Verify the HF model card license. |

**Action**: prototype Stanza `he` (license permitting) or DictaBERT-lex table
export; pursue dictionary-coverage work separately for the 9% hit rate.

**Prototype (2026-08-09)**: Stanza 1.14 Hebrew (`tokenize,mwt,pos,lemma`,
UD Hebrew HTB) vs the regex fallback on the SPEC-056 Hebrew corpus (one
200-token block). Stanza passes **4/4** lemma spot-checks vs 0/4 for the
surface-as-lemma fallback:

| Surface | Regex (current) | Stanza |
|---|---|---|
| `שפות` | `שפות` | `שפה` |
| `יהודים` | `יהודים` | `יהודי` |
| `מדוברת` | `מדוברת` | `מדובר` |
| `העברית` | `העברית` | `עברית` |

Stanza changes 65/200 tokens to a real lemma (regex changes 0/200), and its
clitic tokenization (`ביהודים → ב + יהודים`) raises the dictionary hit rate
from 41% to 59%. Reconstruction is byte-exact (100%). Warm latency is ~1 s per
200-token block (~5 ms/token) plus a ~5 s one-time load; the regex fallback is
~6 ms/block. **License blocker**: the Stanza model card is Apache-2.0, but the
model is trained on **UD Hebrew HTB, which is CC BY-NC-SA 4.0** — a production
blocker for a paid product. **DictaBERT-lex** (`dicta-il/dictabert-lex`) is
verified **CC BY 4.0**, so the commercially usable path is a lemma-table
export from DictaBERT-lex (ADR-0029), tracked in Phase 3, rather than a live
Stanza engine.

**Follow-up recommendations (2026-08-09, v2 eval)**:

- When the DictaBERT-lex table ships, register `he` in
  `TOKENIZER_CONFIG` so mobile downloads and uses it (today it has no entry
  at all — regex + surface everywhere).
- Add clitic-aware dictionary lookup (strip `ב/כ/ל/ה/ו/ש` prefixes for
  lookup, or include prefixed forms in the table). The Stanza prototype
  showed this alone raises dict coverage 41% → 59%, which is the difference
  between B and A for `he`.

### 4.3 Hindi (`hi`) — C, target A

**Current**: regex fallback despite ARCH-016 listing Simplemma for `hin`.
The near-char-level Devanagari split is the tokenizer bug, not a lemma gap.

**Alternatives**:

| Tool | Notes |
|---|---|
| **Fix the fallback tokenizer first** | Treat Unicode combining marks (Mn/Mc/Me — Devanagari matras, and all Indic scripts) as part of the preceding token. Zero new dependencies; expected to recover most of the score. |
| **Keep `hi`/`hin` on BaseTokenizer** | ADR-0018 excludes Hindi from Simplemma ("breaks too many words"); the fixed BaseTokenizer (whole Devanagari words, surface-as-lemma) was the Phase 1 engine. Follow-up (2026-08-09): swapped to spaCy `xx_ent_wiki_sm` (multilingual, no lemmatizer → surface-as-lemma); dict hit improved 68% → 74% with no score change. |
| UDPipe `hindi-hdtb` | Accurate + fast; CC BY-NC-SA models → blocker. |
| Stanza `hi` | Accurate; slower; per-model license — verify. Only if Simplemma still fails after the tokenizer fix. |

**Action**: fix matra tokenization, register Simplemma, re-run eval; escalate to
Stanza only if lemma spot-checks still fail.

### 4.4 Turkish (`tr`) — D (v1) → B (v2), target A

**Current**: Zeyrek (server). Lemma spot-checks pass (`gittim→gitmek`,
`aldım→almak`); the D comes from apostrophe loss (`1933'te → 1933te`,
`Kurultayı'nın → Kurultayının`) and the 31% dictionary hit rate.

**Alternatives**:

| Tool | Notes |
|---|---|
| **Keep Zeyrek** (MIT) | The analyzer is not the problem. Fix apostrophe handling so Turkish suffixed forms (`'te`, `'nın`, …) survive analysis and `_recover_spaces`; Turkish orthography treats `'` as a suffix boundary. |
| Stanza `tr` | Accurate UD model; slower; per-model license — verify. Fallback only if Zeyrek + fix still fails. |

**Action**: fix apostrophe preservation; improve dictionary coverage; only then
consider Stanza.

**Follow-up recommendations (2026-08-09, v2 eval)**:

- **Fix Zeyrek analysis ranking before replacing it.** For `yıl` and `Dil`
  the correct noun lemma is already candidate #2 — primary spot 7/9 vs
  any-candidate 9/9. Prefer a nominal analysis when one of the candidates is
  a dictionary headword (`yıl`, `dil`), which converts the remaining two
  hard-spot failures without an engine swap.
- **Export a Zeyrek surface→headword table for offline** (ADR-0029). Snowball
  stems (`git`, `al`) are not dictionary lemmas, so offline taps miss even
  when the base word is in the dictionary. Turkish is agglutinative; a
  table of common forms (same pattern as Persian) is the practical fix.
- **Lemma-based dictionary lookup** is worth 42 → 76% weighted coverage for
  `tr` in the v2 eval — the single largest scorecard lever.

### 4.5 Indonesian (`id`) — D, target B/A

**Current**: Simplemma. The D is partly a corpus artifact — table blocks and
percent signs are mangled (`90% → 90`) — plus the 20% dictionary hit rate.

**Alternatives**:

| Tool | Notes |
|---|---|
| **Keep Simplemma** | MIT code (per-language database licenses separate); affix lemmatization (`membeli→beli`) is fine where the table covers it. Expand table coverage. |
| UDPipe `indonesian-gsd` | Fast; CC BY-NC-SA models → blocker. |
| Stanza `id` | Accurate; slower; per-model license — verify. Only if accuracy demands outweigh latency. |

**Action**: exclude pipe-table blocks from SPEC-056 paragraph selection (fix
the artifact), improve dictionary coverage, re-run eval.

### 4.6 German / Italian / Spanish (de / it / es) — B in v2, target A

**Current**: all three route to `lemmatize_lemmatization_lists` — static ODbL
TSV tables (`data/lemmatization-lists/`), regex tokenization, **no POS**.
Lookup is context-free: when a surface has multiple lemma candidates, the
file's first candidate wins. Mobile offline uses the exported table; when the
table is installed, misses fall back to surface (snowball only when the table
is not downloaded).

**v2 scorecard symptoms**:

- de 89.0 B — `Gesetzestexte`/`staatliche` left unchanged (forms missing from
  the table).
- it 88.1 B — `corsi→correre`, `attraverso→attraversare` (the verb sense is
  listed first); any-candidate 7/8, primary 6/8.
- es 87.0 B — `como→comer`, `considerárseles` unchanged.

**Why not just enable spaCy?** ARCH-016's concern is real: the full spaCy
pipeline (tagger + parser + NER + lemmatizer) is **10–50× slower** than
LemmatizationList, which is why ADR-0018 demoted it to last resort. That
measurement applies to the full pipeline, not to a trimmed
tagger+lemmatizer-only configuration.

**Alternatives**:

| Option | Context-aware | Latency | License | Fit |
|---|---|---|---|---|
| Current LemmatizationList | No | baseline (~5 ms/block) | ODbL | keep as fallback + offline table source |
| **Curated LemmatizationList** (Phase A) | No (deterministic ordering) | baseline | ODbL | **recommended first** — zero deps; add missing inflections; order candidates by dictionary-headword preference |
| **Trimmed spaCy sm** (tagger + lemmatizer only, exclude parser/NER) | Yes | **verified 2026-08-09**: de 20.8 ms, it 16.0 ms, es 14.0 ms per 200-token block (warm, best of 3, local Mac) — ~2× faster than the full pipeline (31–42 ms) | MIT (models MIT) | **recommended Phase B** when POS context matters (`como`, `corsi`, `attraverso`) |
| Simplemma | No | fast | MIT code; per-language data verify | alternative table source; already in the stack |
| Stanza de/es/it (UD GSD/ISDT) | Yes | slow (~hundreds ms/block) | Apache-2.0 code; UD treebanks CC BY-SA 4.0 — commercial OK with attribution, verify model card | fallback only if accuracy demands |
| UDPipe de/es/it | Yes | fast | models CC BY-NC-SA 4.0 | **blocker** |

**Verified (2026-08-09)** — spaCy 3.7.5, `de_core_news_sm` /
`it_core_news_sm` / `es_core_news_sm`, loaded with
`exclude=["parser","ner"]`:

- The trimmed pipeline keeps
  `tok2vec → tagger → morphologizer → lemmatizer → attribute_ruler`. The
  spaCy lemmatizer is a **separate rule-based component that consumes
  `token.tag_`/`pos_`** — it does not need the parser or NER, and lemma
  output is identical to the full pipeline on every hard form.
- de: `Gesetzestexte→Gesetzestext`, `staatliche→staatlich`,
  `Ausschreibungen→Ausschreibung`, `französischen→französisch`,
  `Fassungen→Fassung` — **5/5 fixed**.
- it: `corsi→corso`, `attraverso→attraverso` (ADP),
  `italiana→italiano`, `assicura→assicurare`, `promozione→promozione` —
  **5/5 fixed**.
- es: `como→como` (SCONJ), `tienen→tener`, `otros→otro`,
  `española→español` — **4/5**; `considerárseles→considerársel` (spaCy
  tags the enclitic as NOUN) remains wrong. Cover it with an
  `attribute_ruler` rule or a table entry.
- Warm latency per 200-token block (best of 3, local Mac): trimmed
  de 20.8 / it 16.0 / es 14.0 ms vs full 41.8 / 35.7 / 31.2 ms — well
  inside the proposed < 50 ms budget.

**Action**:

1. ✅ **Implemented 2026-08-09 — trimmed spaCy.** `LEMMATIZER_REGISTRY`
   routes de/es/it to `lemmatize_spacy` with `exclude=("parser","ner")` and
   cache namespace `spacy-trim-v2`. Hard spots verified via the module
   directly: de 5/5, it 5/5, es 4/5 (`considerárseles` still wrong — needs
   an `attribute_ruler` rule or table entry). LemmatizationList remains the
   transitional offline-table source for mobile.
2. **Remaining — table curation (no new dependencies).** Add
   `considerárseles→considerar` and the missing German forms to the TSVs for
   offline parity until spaCy-backed tables land.
3. **Pending — regenerate mobile lemma tables** from the trimmed spaCy
   engine (ADR-0029) so offline headwords match the server's POS-aware
   output. Until then `/lemmatization/export` serves the existing TSVs
   (transitional `SPACY_TSV_EXPORT_LANGS`).

### 4.7 Thai (th) — B in v2, target A

**Current**: server PyThaiNLP `newmm` segmentation + `thaiphon`
pronunciation, surface-as-lemma; mobile dictionary max-matching + surface.
Thai does not inflect, so there is no lemma engine to replace — the gap is
data.

**v2 scorecard symptoms**: segmentation and word pronunciation are fine
(pronunciationCoverageWords 75%; the misses are digits and CEFR labels such
as `A1`–`C2`). Dictionary coverage is 57% weighted, with common words
(`แตกตัว`, `รวมทั้งหมด`) missing.

**Alternatives**:

| Option | Fit |
|---|---|
| **Keep newmm** | Correct segmentation for normal text; no change needed |
| AttaCut (MIT) | Optional spike for OOV-heavy subtitle text; neural segmenter, still surface-as-lemma |
| **Dictionary headword/alternate export** | The actual fix — same `head UNION alternate` pattern that fixed zh in SPEC-058 |

**Action** (Phase 6): expand the th dictionary export used by mobile
max-matching; target weighted dict coverage ≥ 60%; optional AttaCut spike if
OOV splits regress on subtitle corpora.

### 4.8 Cantonese (yue) — B in v2, target A

**Current**: server jieba + cccanto lexicon overlay + jyutping polyfill
(surface-as-lemma); mobile dictionary max-matching. The mobile main-thread
dict-seg path lacks jyutping (the WebView worker covers it per SPEC-058).

**v2 scorecard symptoms**: dict coverage 37% weighted — **粵語 itself has no
dictionary entry**; pronunciation 96% with common function words missing
(`但`, `喺`, `年`, `快`). Segmentation is otherwise fine.

**Alternatives**:

| Option | Fit |
|---|---|
| **Expand cccanto / CC-Canto headwords + alternates** | Raise coverage in both the jieba overlay and the mobile word set; 粵語/生存環境/前所未有 are the first targets |
| **ToJyutping** (BSD-2-Clause/MIT) | Fill jyutping gaps (`但`→`daan6`, `喺`→`hai2`); verify data attribution |
| **PyCantonese** (MIT code; bundled data mixed: HKCanCor CC BY, CantoMap GPL-3.0, Common Voice MPL-2.0) | Alternative jyutping/segmentation source; server-side OK under the existing GPL policy, verify redistribution |
| Mobile main-thread jyutping parity | Ship jyutping via dictionary rows or the worker path so main-thread matches SPEC-058's worker score |

**Action** (Phase 6): expand the Cantonese dictionary export; spike ToJyutping
or PyCantonese for pronunciation; re-run v2 (target weighted dict ≥ 60%,
word-like pron 100% on the corpus).

### 4.9 Korean (ko) — B in v2, target A

**Current**: server **Kiwi** (`kiwipiepy`, LGPL-3.0) — adopted 2026-08-09,
replacing konlpy **Okt** (`norm=True`, `stem=True`) whose particle lemmas
were wrong (`는→늘다`, `서→서다`). Mobile uses kuromoji-ko (mecab-ko-dic) +
koroman romanization, with a known pronunciation gap (per-token surfaces vs
word-level romanization).

**v2 scorecard symptoms**: hard spots 5/7; lemma-based dictionary lookup
would raise coverage 48→65%.

**Alternatives**:

| Option | Fit |
|---|---|
| **Kiwi (`kiwipiepy`, LGPL-3.0)** | **Recommended server engine.** Fast C++ core, accurate lemma+POS output, fixes particle lemmas; LGPL is acceptable under the same policy that already accepts GPL Qalsadi/CAMeL server-side — verify model-data terms |
| mecab-ko (eunjeon) | Alternative if LGPL/JVM concerns; same MeCab family as mobile |
| **Keep kuromoji-ko on mobile** | Engine is fine; fix pronunciation by romanizing dictionary headwords/lemmas instead of every surface token |
| Lemma-based dictionary lookup | 48→65% weighted coverage; integration fix, not an engine swap |

**Action** (Phase 5):

1. ✅ **Implemented 2026-08-09** — `lemmatize_korean` rewritten around Kiwi:
   `text` is the exact surface substring (Kiwi's `form` can be a normalized
   morpheme, e.g. `부르` for surface `불` in `불렀`), `stem` is Kiwi's lemma
   plus the suppletive override (`드시→들다`, ported from mobile), cache
   namespace `kiwi-v2`. Verified on the SPEC-056 corpus: particles correct in
   context, no >20-char tokens, weighted dict coverage surface 48→61% /
   lemma 65→68%, warm latency 1.6 ms vs Okt 84 ms per block.
2. **Eval follow-up** — the standalone single-character particle spots
   (`는`, `서`) are ambiguous in isolation: Kiwi analyzes `는` alone as
   `늘+는`, though it is correct in corpus context (`현재는 → 는/는`).
   Move the ko hard spots to contextual phrases so the scorecard measures
   real subtitle behavior.
3. **Pending** — mobile per-token romanization fix (romanize dictionary
   headwords/lemmas instead of every surface token).

### 4.10 Vietnamese (vi) — A in v2, low priority

**Current**: `vi`/`vie` route to `lemmatize_vietnamese` — a **dictionary-first
word merge** over Vietnamese Wiktionary headwords (surface-as-lemma).
Implemented 2026-08-09; the legacy pyvi wrapper (unregistered, buggy cache,
lowercased lemmas) was replaced. The v2 scorecard is A (97.5) — Vietnamese is
analytic, so surface-as-lemma is linguistically correct.

**Verified 2026-08-09 on the SPEC-056 vi result JSON**:

- Tokenization is syllable-level: `Chữ Quốc ngữ` → `Chữ`/`Quốc`/`ngữ`,
  `tiếng Việt` → `tiếng`/`Việt`, `Việt Nam` → `Việt`/`Nam`. No content token
  contains a space; lemma = surface exactly.
- The dictionary **does** contain word-level headwords (`tiếng Việt`,
  `chữ Nôm`, `Việt Nam`) that the tokenizer never produces, so they are never
  looked up. `Quốc ngữ` has **no** entry as a phrase, while its syllables
  `Quốc`/`ngữ` both hit individually — the 92% coverage is partly an artifact
  of syllable-level splitting counting each syllable as a hit.

**Verified 2026-08-09 (pyvi 0.1.1, MIT)**:

- pyvi does real word-level segmentation: `Quốc ngữ` → `Quốc_ngữ`,
  `Việt Nam` → `Việt_Nam`, `Hà Nội` → `Hà_Nội`, `đại học bách khoa` →
  `đại_học bách_khoa`, `văn hóa` → `văn_hóa`. But it is inconsistent:
  `tiếng Việt` and `chữ Nôm` are **not** merged even though the dictionary
  has word-level headwords for them.
- Raw output is not byte-aligned (pyvi inserts a space before commas:
  `phát triển , nhưng`; 871 → 884 chars). Feeding it through the unified
  `_recover_spaces` realigns it and reconstruction is **exact** (verified).
- Word-level tokens **lower** weighted dictionary coverage: 87.7% vs 91.5%
  for the current syllable split. The corpus's `Quốc ngữ` (×4) misses as a
  phrase, and so do `bắt đầu từ`, `truyền bá`, `dân trí`, `Cải cách`,
  `bóc lột`, `Thực dân` — while their syllables individually hit.
- The legacy `lemmatize_vietnamese` wrapper is not usable as-is: it
  lowercases lemmas (`Hà Nội` → `hà nội`, `Việt Nam` → `việt nam` — both
  lowercase forms miss the dictionary) and its cache namespace is hardcoded
  to `qalsadi`/`ara`.
- Speed is fine (~0.9 ms per 200-char block, warm); license is MIT; the
  package is effectively unmaintained (0.1.1 is the latest PyPI release).

**Full benchmark (2026-08-09, SPEC-056 vi block, weighted dict coverage)**:

| Candidate | Dict coverage (CI) | Multiword tokens | Warm ms/block |
|---|---:|---:|---:|
| regex baseline (current at the time) | 96.5% | 0 | 0.03 |
| pyvi 0.1.1 (MIT) | 94.2% | 36 | 0.9 |
| underthesea 9.5 (GPL-3.0) | 91.8% | 43 | 4.8 |
| **dict-first merge (adopted)** | **97.3%** | 38 | 0.34 |
| dict-first + pyvi lexicon | 90.5% | 43 | 1.3 |

VnCoreNLP (GPL-3.0, Java) was researched but not benchmarked: the 1.2
release has no direct download assets (Google Drive distribution), and a
Java server dependency is not viable for this stack.

**Implemented (Phase 8)**:

1. `lemmatize_vietnamese.py` rewritten as a dictionary-first merge (greedy
   longest match over wiktionary heads, ≤ 4 syllables, phrase/proverb
   excluded, casing preserved, cache `vi-dictfirst-v1`) and registered for
   `vi`/`vie` in `LEMMATIZER_REGISTRY`.
2. `WiktionaryLoader.batch_lookup` gained a case-insensitive fallback
   (Python-lowered index, capped at 350k keys, alternates included) — fixes
   capitalized forms and Unicode case pairs (`Đ/đ`) for all wiktionary-backed
   languages.
3. Verified on the corpus: 146 content tokens, 38 merged words (`Quốc ngữ`,
   `tiếng Việt`, `Việt Nam`, `chữ Nôm`, `phổ biến`, …), weighted dict
   coverage **97.3%** (CI), reconstruction exact, warm ~0.37 ms; the only
   misses are numbers (`200`, `19`, `1906`) and the rare word `súy`.

---

## 5. Licensing Matrix

Verified 2026-08-09 from project homepages/model cards:

| Tool | Code license | Model/data license | Commercial use |
|---|---|---|---|
| CAMeL Tools | MIT | Data packages download separately: MSA morphology/MLE (`calima-msa-r13`) GPL v2; `morphology-db-msa-s31` LDC (SAMA 3.1); Levantine/Gulf DBs CC BY 4.0; dialect-id MIT | **Accepted server-side** (GPL v2, not distributed to clients; LDC `s31` excluded) |
| UDPipe | MPL-2.0 | Models CC BY-NC-SA 4.0 | **Blocker** (non-commercial) unless separately licensed |
| Stanza | Apache-2.0 | Hebrew model card Apache-2.0, but trained on UD Hebrew HTB (CC BY-NC-SA 4.0); de/es/it trained on UD GSD/ISDT (CC BY-SA 4.0) | **Blocker for `he`**; de/es/it commercial OK with attribution — verify per model card |
| Zeyrek | MIT | n/a | OK |
| Simplemma | MIT | Per-language linguistic databases have separate licenses | Verify databases in use |
| Qalsadi | GPL-3.0 | n/a | Already in tree; note copyleft consideration |
| DictaBERT-lex | CC BY 4.0 (HF model card) | CC BY 4.0 | OK with attribution — recommended `he` table source |
| spaCy de/es/it sm | MIT | MIT (model cards; TIGER/GSD-derived) | OK |
| Kiwi (`kiwipiepy`) | LGPL-3.0 | verify model/data terms | **Adopted server-side 2026-08-09** (same policy as GPL Qalsadi/CAMeL); not for client distribution |
| AttaCut | MIT | MIT | OK |
| ToJyutping | BSD-2-Clause (MIT on some channels) | verify data attribution | OK |
| PyCantonese | MIT | bundled data mixed: HKCanCor CC BY, CantoMap GPL-3.0, Common Voice MPL-2.0 | Server-side OK; verify redistribution |

---

## 6. Implementation Plan

### Phase 1 — fixes with no new dependencies (highest ROI) ✅ DONE 2026-08-09

1. ✅ Fix `_fallback_lemmatize` to keep Unicode combining marks (Mn/Mc/Me —
   Devanagari matras are Mc, not Mn) attached to the preceding token — fixes
   Hindi and all Indic scripts.
2. ❌ **Superseded** — do not register `hi`/`hin` → Simplemma. ADR-0018
   excludes Hindi from Simplemma ("breaks too many words"), so the §4.3
   BaseTokenizer fix above is the actual Phase 1 engine change. Follow-up
   (2026-08-09): `hi`/`hin` swapped to spaCy `xx_ent_wiki_sm` (the ADR's named
   fallback) — see Phase 1 results.
3. ✅ Fix Turkish apostrophe preservation: `lemmatize_turkish` splits on
   apostrophe boundaries, analyzes each side with Zeyrek, and re-emits `'` as a
   punctuation token. Cache namespace bumped to `zeyrek-v2`.
4. ✅ Fix `_recover_spaces` to emit every gap character (not just whitespace)
   and to repair tokens a lemmatizer merged across a gap — Arabic
   punctuation-adjacent spaces now reconstruct byte-exactly.
5. ✅ Exclude pipe-table blocks (including captions merged with table rows)
   from SPEC-056 paragraph selection — fixes the Indonesian corpus artifact.
6. ✅ Re-run `run_eval.py` — see [Phase 1 results](#phase-1-results).

### Phase 1 results

*2026-08-09, local Flask, 200-token budget.*

| L2 | Before | After | Grade before → after | Notes |
|---|---:|---:|---|---|
| `he` | 86.3 | 97.2 | B → A | Paragraph selection now excludes table-like blocks; dict hit 9% → 41% |
| `hi` | 77.8 | 100.0 | C → A | Whole-word Devanagari tokens; spot-checks 0/2 → 2/2; dict hit 55% → 68% (BaseTokenizer), then 74% after the spaCy `xx_ent_wiki_sm` swap |
| `ar` | 73.5 | 98.5 | C → A | Punctuation-adjacent spaces recovered; Qalsadi lemma bugs remain (no seeded spot-checks) |
| `tr` | 65.8 | 95.0 | D → A | Apostrophes preserved (`1933'te` reconstructs); dict hit 31% → 35% |
| `id` | 62.1 | 100.0 | D → A | Pipe-table block no longer selected; dict hit 20% → 57% |

All 19 SPEC-056 languages now score A. The remaining weak spots are
dictionary/data coverage (`yue` 33%, `tr` 35%, `ru`/`he` 41%, `ar` 46%,
`ko` 43%), tracked in Phase 3 — not tokenization.

### Phase 2 — prototype model alternatives

7. ✅ **Done + adopted (2026-08-09)** — CAMeL Tools prototype for `ar` vs
   Qalsadi on the SPEC-056 corpus; data-package licenses verified (GPL v2
   accepted server-side, LDC `s31` excluded); warm latency measured; engine
   registered in `LEMMATIZER_REGISTRY` — see [§4.1](#41-arabic-ar--c-target-a)
   and Phase 2 results below.
8. ✅ **Done (2026-08-09)** — Stanza `he` prototype vs regex fallback; training
   data verified CC BY-NC-SA 4.0 (blocker). DictaBERT-lex license verified
   CC BY 4.0 (permissive), making it the recommended table-export source — see
   [§4.2](#42-hebrew-he--b-target-ab) and Phase 2 results below.
9. ⏭️ **Skipped** — Stanza `hi` / UDPipe only if spaCy `xx_ent_wiki_sm` after
   the Phase 1 swap still fails spot-checks (it passes 2/2 today).
10. ⏭️ **Skipped** — Stanza `tr` only if Zeyrek + apostrophe fix still fails
    (it passes 2/2 today).
11. ⏭️ **Not applicable** — no engine was adopted in Phase 2 (license
    blockers), so the SPEC-056 scorecard is unchanged. Prototype numbers are
    reproducible via `scripts/tokenizer-eval/compare_prototypes.py`, which
    writes `tmp/tokenizer-eval/prototypes/{ar,he}.json`.

### Phase 2 results

*2026-08-09, local Flask + local prototypes, SPEC-056 corpus, one 200-token
block per L2, CPU (Mac, no GPU). Warm latency excludes one-time model load
and a warm-up call.*

| L2 | Engine | Spot | Lemma cov. | Dict hit | Recon | Warm ms/block | Load ms | Verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|
| ar | Qalsadi + Mishkal (current) | 2/5 | 99% | 46% | 100% | 11 | — | keep; score driver is dictionary data |
| ar | CAMeL MLE `calima-msa-r13` | 5/5 | 100% | 46% | 100% | 202 | 5,356 | **adopted server-side** (GPL v2 accepted; LDC `s31` excluded; Qalsadi fallback) |
| he | regex fallback (current) | 0/4 | 100% | 41% | 100% | 6 | — | keep |
| he | Stanza `he` (UD HTB) | 4/4 | 100% | 59% | 100% | 1,006 | 5,329 | more accurate + better dict hit, but CC BY-NC-SA training data → **blocker** |
| he | DictaBERT-lex | not run | — | — | — | — | — | CC BY 4.0; export a lemma table (ADR-0029) instead of a live engine |

Stanza remains research-only: its dependency and model were installed locally,
not added to server requirements or `LEMMATIZER_REGISTRY`.

**CAMeL adoption for Arabic (2026-08-09, after the prototype run):**

- New `lemmatize_camel.py` uses `MLEDisambiguator.pretrained()` (defaults to
  `calima-msa-r13`, GPL v2) with `simple_word_tokenize`; lemmas are
  de-diacritized `lex` values, POS comes from the MLE analysis, and
  pronunciation comes from CAMeL's per-analysis diacritized form converted to
  SAMPA (replaces Mishkal; coverage 99% on the SPEC-056 corpus).
- `ar`/`ara` now route to `lemmatize_camel` in `LEMMATIZER_REGISTRY`; Qalsadi
  + Mishkal remain as an automatic fallback when CAMeL or its data is missing.
- Production data install is `camel_data -i disambig-mle-calima-msa-r13`
  (pulls `morphology-db-msa-r13`); `install_camel_data.sh` documents it. The
  LDC-licensed `calima-msa-s31` package is intentionally not installed.
- SPEC-056 re-run: v1 total 98.5 → 98.8 (A); v2 total 65.6 (D) → 81.0 (B).
  The v2 lift comes from 100% lemma coverage and the single-word
  `/lemmatize-normalized` path no longer 500ing (spot errors 4/4 → 0/4).
  `كتبتها→كتب`, `أعني→عنى`, `يتحدثها→تحدث` all confirmed via the live API.

### Phase 3 — data

12. Dictionary-coverage push for `he`/`id`/`tr`/`yue`/`ru`/`ko` (systemic
    gap, tracked from SPEC-056).
13. Generate lemma tables (ADR-0029) from **DictaBERT-lex** (CC BY 4.0,
    verified 2026-08-09) for offline use per SPEC-018.

### Phase 4 — de / it / es: table curation + trimmed spaCy prototype

14. Curate the de/it/es `lemmatization-lists` tables for the remaining gaps
    (`considerárseles→considerar`, plus any forms trimmed spaCy still
    misses) and for offline parity until spaCy-backed tables land.
15. ✅ **Implemented 2026-08-09** — de/es/it route to trimmed spaCy
    (`de_core_news_sm` / `it_core_news_sm` / `es_core_news_sm` with
    `exclude=("parser","ner")`, cache `spacy-trim-v2`). Verified identical
    lemmas to the full pipeline at de 20.8 / it 16.0 / es 14.0 ms per
    200-token block (full: 41.8 / 35.7 / 31.2). Hard spots: de 5/5, it 5/5,
    es 4/5. `/lemmatization/export` keeps serving the existing TSVs
    (transitional).
16. Pending — regenerate mobile lemma tables from the trimmed spaCy engine
    (ADR-0029) so offline output matches server POS-aware lemmas.

### Phase 5 — Korean server engine spike

17. ✅ **Done 2026-08-09** — Kiwi prototype vs Okt on the SPEC-056 Korean
    corpus + hard spots. Results: warm 1.6 ms vs 84 ms per block; weighted
    dict coverage surface 48→61% / lemma 65→68%; fixes `서→서` and corpus
    `는→는`; `드시` needs the suppletive override. LGPL-3.0 verified
    acceptable under the existing GPL server-side policy.
18. ✅ **Implemented 2026-08-09** — `lemmatize_korean` rewritten around Kiwi
    (surface-slice `text`, lemma `stem`, suppletive override, cache
    `kiwi-v2`); `/lemmatize-korean` fixture regenerated; unit tests added.
    Re-run SPEC-056 v2 after server restart; the ko hard-spot set should move
    to contextual phrases (see §4.9).
19. Pending — mobile: keep kuromoji-ko; fix per-token pronunciation by
    romanizing dictionary headwords/lemmas (addresses the SPEC-058 ~11%
    coverage gap).

### Phase 6 — th / yue dictionary data + pronunciation

20. Expand th and yue dictionary exports (`head UNION alternate`) used by
    mobile max-matching and the jieba/cccanto overlay; first targets: th
    `แตกตัว`/`รวมทั้งหมด`, yue `粵語`/`生存環境`/`前所未有`; target weighted
    dict coverage ≥ 60% for both.
21. Spike **ToJyutping** or **PyCantonese** for yue jyutping gaps (`但`,
    `喺`, `年`, `快`); target 100% word-like pronunciation on the corpus.
    Optionally spike **AttaCut** (MIT) for th OOV-heavy text.
22. Ship yue jyutping on the mobile main-thread path (dictionary rows or
    worker fallback) for SPEC-058 parity.

### Phase 7 — he / tr offline parity + lemma lookup

23. Generate the **DictaBERT-lex** `he` lemma table (CC BY 4.0); add
    clitic-aware lookup or prefixed forms (target dict coverage 41 → 59%+);
    register `he` in `TOKENIZER_CONFIG`.
24. Turkish: rank Zeyrek analyses to prefer dictionary-headword candidates
    (`yıl`, `dil`); export a Zeyrek surface→headword table for offline use,
    replacing the snowball-only path.
25. Lemma-based dictionary lookup across inflected languages (en 84→94,
    es 71→89, ru 48→80, tr 42→76, ar 58→89, ko 48→65 in the v2 eval) —
    integration change in the lookup step, not the lemmatizers.

### Phase 8 — Vietnamese word-level segmentation (optional)

26. ✅ **Implemented 2026-08-09** — benchmarked pyvi 0.1.1 (94.2% CI),
    underthesea 9.5 (91.8% CI), dict-first merge (97.3% CI), and
    dict-first+pyvi (90.5% CI) on the SPEC-056 vi block; VnCoreNLP skipped
    (no direct download; Java dependency). Adopted **dict-first merging**
    (no new deps, casing preserved, cache `vi-dictfirst-v1`) plus a
    case-insensitive batch-lookup fallback in `WiktionaryLoader`. Registered
    `vi`/`vie`; corpus re-check: 97.3% weighted coverage, exact
    reconstruction, ~0.37 ms/block.

---

## 7. Definition of Done

1. License review recorded for every newly added engine/data package before
   merge — ✅ Phase 2 licenses recorded in §5 (CAMeL GPL v2/LDC, Stanza he
   NC training data, DictaBERT-lex CC BY 4.0).
2. New engines registered in `LEMMATIZER_REGISTRY` per ARCH-016 and exposed
   through the unified schema with exact space recovery — ✅ Arabic (CAMeL via
   `lemmatize_camel`, byte-exact reconstruction verified); Hebrew remains N/A.
3. SPEC-056 re-run shows all five languages at A/B, or a documented blocker
   remains in this spec — ✅ Arabic re-run and promoted into SPEC-056;
   Hebrew/Stanza blocker documented (CC BY-NC-SA).
4. SPEC-055 test cases updated where behavior changes.
5. de/it/es: curated tables committed and v2 hard spots at target (8/8, 8/8,
   7/7), or the trimmed-spaCy benchmark is recorded with a go/no-go decision.
6. Kiwi prototype recorded with LGPL-3.0 verification and a go/no-go note for
   `ko`.
7. th/yue dictionary exports expanded and re-run (weighted dict ≥ 60%); yue
   pronunciation gaps closed or explicitly documented.
8. he/tr offline lemma tables generated, `TOKENIZER_CONFIG` entries registered,
   and lemma-based dictionary lookup landed or tracked in its owning spec.

---

## 8. Open Questions

- Is CC BY-NC-SA acceptable for internal/prototype evaluation only? (Production
  use remains blocked.)
- Do we already accept GPL-3.0 in the Python server (Qalsadi is in the tree
  today)? If not, the permissive CAMeL replacement becomes a priority.
- Transformer engines (DictaBERT, CAMeL BERT): server-only with cache, or also
  exported as offline lemma tables?
- Is the dictionary-coverage gap part of this spec, SPEC-056, or a separate
  data spec?
- Is < 50 ms per 200-token block the right p95 budget for trimmed spaCy on
  de/es/it, or should it match the current LemmatizationList latency (~5 ms)?
- Is LGPL-3.0 (Kiwi) acceptable server-side under the same policy as GPL
  Qalsadi/CAMeL? If yes, record it in the accepted-license list.
- Should lemma-based dictionary lookup land in SPEC-057, SPEC-056, or a
  separate integration spec?
- Are AttaCut / ToJyutping / PyCantonese runtime dependencies or offline data
  generators (tables/exports) only?
