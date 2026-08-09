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

### 4.4 Turkish (`tr`) — D, target B/A

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

---

## 5. Licensing Matrix

Verified 2026-08-09 from project homepages/model cards:

| Tool | Code license | Model/data license | Commercial use |
|---|---|---|---|
| CAMeL Tools | MIT | Data packages download separately (`camel_data`); verify package terms | Likely OK — verify per data package |
| UDPipe | MPL-2.0 | Models CC BY-NC-SA 4.0 | **Blocker** (non-commercial) unless separately licensed |
| Stanza | Apache-2.0 | Per-model, trained on UD treebanks (commonly CC BY-SA; some NC) | Verify per model |
| Zeyrek | MIT | n/a | OK |
| Simplemma | MIT | Per-language linguistic databases have separate licenses | Verify databases in use |
| Qalsadi | GPL-3.0 | n/a | Already in tree; note copyleft consideration |
| DictaBERT-lex | Verify HF model card | Same | Verify before use |

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

7. CAMeL Tools prototype for `ar` vs Qalsadi on the SPEC-056 corpus; verify
   data-package license; measure latency with `light` data.
8. Stanza `he` prototype (license permitting) or DictaBERT-lex table export vs
   regex fallback.
9. Stanza `hi` / UDPipe `hindi-hdtb` only if spaCy `xx_ent_wiki_sm` after the
   Phase 1 swap still fails spot-checks (it passes 2/2 today).
10. Stanza `tr` only if Zeyrek + apostrophe fix still fails.
11. Re-run the suite and promote the new scorecard into SPEC-056 §4.1.

### Phase 3 — data

12. Dictionary-coverage push for `he`/`id`/`tr`/`yue`/`ru`/`ko` (systemic
    gap, tracked from SPEC-056).
13. Generate lemma tables (ADR-0029) from adopted models (e.g., DictaBERT-lex)
    for offline use per SPEC-018.

---

## 7. Definition of Done

1. License review recorded for every newly added engine/data package before
   merge.
2. New engines registered in `LEMMATIZER_REGISTRY` per ARCH-016 and exposed
   through the unified schema with exact space recovery.
3. SPEC-056 re-run shows all five languages at A/B, or a documented blocker
   remains in this spec.
4. SPEC-055 test cases updated where behavior changes.

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
