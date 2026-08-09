# SPEC-056 — Automated Tokenization / Lemmatization Evaluation Suite (19 Popular L2s)

## Metadata

- **Spec ID**: SPEC-056
- **Feature**: Automated corpus-driven evaluation of the Flask tokenization/lemmatization pipeline + batch dictionary lookup, scored per language
- **Status**: draft
- **Created**: 2026-08-09
- **Scope**: `zerotohero-python-server` lemmatization + dictionary endpoints; generated corpora/results under `tmp/tokenizer-eval/`
- **Related specs**: [SPEC-055 — Local Tokenizer Testing Checklist](055-local-tokenizer-testing.md) · [SPEC-018 — Mobile Local Tokenization](018-local-tokenization-mobile.md) · [SPEC-013 — Mobile Offline Dictionary](013-mobile-offline-dictionary.md)
- **Related architecture/ADRs**: [ARCH-018 — Local Tokenization Strategy](../arch/018-local-tokenization-strategy.md) · [ARCH-016 — Server Tokenization Pipeline](../arch/016-server-tokenization.md) · [ADR-0029 — Registry / Lemma Table Single Source of Truth](../adr/0029-registry-single-source-of-truth.md) · [ADR-0030 — Data-Driven Popular L2 List](../adr/0030-popular-l2-list-usage-data.md)
- **Key implementation files**: `zerotohero-python-server/routes/text_routes.py`, `zerotohero-python-server/routes/dictionary.py`, `zerotohero-python-server/lemmatize_unified.py`, `packages/shared/src/language-data.ts`

---

## Overview

We need a repeatable, automated way to measure how well the Flask
tokenization/lemmatization pipeline handles real, rich text for the 19 most
popular target languages (`POPULAR_L2S`, ADR-0030). The suite has three stages:

1. **Corpus** — fetch one rich Wikipedia article per language (≥3 medium-to-long
   paragraphs, headings/links/lists retained) and store it as Markdown.
2. **Pipeline** — run each corpus through `POST /lemmatize-normalized/batch` and
   `POST /dictionary/lookup-batch`, storing every tokenized/lemmatized/looked-up
   JSON for inspection.
3. **Scoring** — compute a per-language score from tokenization fidelity, lemma
   coverage, lemma spot-checks, dictionary hit rate, pronunciation coverage
   (where supported), and reliability/latency, and emit a scorecard.

The goal is not to replace the human spot-checks in SPEC-055; it is to give us a
fast, data-backed signal whenever lemmatizers, dictionaries, or the unified
token schema change.

---

## Language Scope

Exactly the 19 languages in `POPULAR_L2S` (`packages/shared/src/language-data.ts`):

| L2 code | Wikipedia subdomain | Expected tokenizer family (server) |
|---|---|---|
| `zh` | `zh` | jieba dict segmentation (surface = lemma) |
| `en` | `en` | spaCy / lemma table |
| `ja` | `ja` | MeCab/kuromoji |
| `ko` | `ko` | mecab-ko / koroman |
| `fr` | `fr` | spaCy / lemma table |
| `de` | `de` | spaCy / lemma table |
| `es` | `es` | spaCy / lemma table |
| `vi` | `vi` | regex split / surface |
| `ru` | `ru` | pymorphy2 / lemma table |
| `ar` | `ar` | Qalsadi / arabic-stem |
| `tr` | `tr` | Zeyrek (server) / snowball (offline) |
| `it` | `it` | spaCy / lemma table |
| `hi` | `hi` | spaCy / surface |
| `yue` | `zh-yue` | dict segmentation + jyutping |
| `th` | `th` | PyThaiNLP `newmm` + `thaiphon` |
| `id` | `id` | Simplemma / surface |
| `nl` | `nl` | spaCy / lemma table |
| `he` | `he` | spaCy / surface |
| `pt` | `pt` | spaCy / lemma table |

---

## 1. Corpus Acquisition

### 1.1 Rules

- One Wikipedia article per language, in that language's Wikipedia.
- The saved page must be **one page** of **rich Markdown**: at least 3
  medium-to-long paragraphs (each ≥ 40 words, total ≥ 300 words), with at least
  one heading, one link, and one bold/italic span. Lists and tables are welcome
  but not required.
- Article selection must be **deterministic**: pin a stable, well-known title per
  language in `corpus_config.json` (e.g., the article about the language itself,
  or a featured article that exists in that Wikipedia). Record title, URL,
  fetched-at timestamp, and source revision/date in the manifest.
- If the pinned title is missing/redirects or fails the richness check, the
  fetcher reports it and moves on — no silent fallback to random articles
  (random breaks reproducibility).

### 1.2 Fetcher

`scripts/tokenizer-eval/fetch_corpus.py` (new, tracked):

1. Read `scripts/tokenizer-eval/corpus_config.json` — `{ "l2": { "lang": "zh", "titles": ["…"] } }`.
2. Fetch the article HTML from the Wikipedia REST API:
   `GET https://{lang}.wikipedia.org/api/rest_v1/page/html/{title}`
3. Convert HTML → Markdown with `pandoc` if available, else a Python HTML→MD
   converter (`markdownify`). Keep headings, links, bold/italic, lists.
4. Strip navigation/citation boilerplate (references, hatnotes, infoboxes) while
   keeping the readable article body.
5. Validate the richness rules above; write `tmp/tokenizer-eval/corpus/{l2}.md`.
6. Write/update `tmp/tokenizer-eval/corpus/manifest.json`.

### 1.3 Corpus folder layout

```
scripts/tokenizer-eval/
├── corpus_config.json        ← pinned titles + Wikipedia lang codes (tracked)
├── expected_lemmas.json      ← seed spot-check maps (tracked)
├── fetch_corpus.py           ← corpus fetcher (tracked)
└── run_eval.py               ← pipeline runner + scorer (tracked)

tmp/tokenizer-eval/
├── corpus/                     ← generated artifacts (gitignored)
│   ├── manifest.json           ← title, URL, fetched_at, revision, word counts
│   ├── zh.md
│   ├── en.md
│   └── … (one .md per popular L2)
└── results/                    ← generated artifacts (gitignored)
    ├── zh.json
    ├── en.json
    ├── …
    ├── scorecard.json
    └── scorecard.md
```

---

## 2. Pipeline Runner

`scripts/tokenizer-eval/run_eval.py` (new) runs each language through the live Flask
server. It must **never start or stop the Flask server** — the developer starts
it (per repo rules) and the script reads `PYTHON_SERVER` (default
`http://127.0.0.1:5001/`) or `PYTHON_API_URL`.

### 2.1 Step 1 — Tokenize / lemmatize

Strip Markdown markup (headings, links, bold/italic, list markers) and select
the **longest paragraphs**, filling a **200-token total budget per language**
(`--max-tokens`, default 200; scriptio-continua languages count characters).
The last paragraph is truncated to the remaining budget. Send one batch request
per language:

```http
POST {PYTHON_SERVER}lemmatize-normalized/batch
Content-Type: application/json

{ "texts": ["# Heading", "Paragraph one…", "Paragraph two…"], "l2": "zh" }
```

Response (already normalized by the server):

```json
{
  "results": [
    [
      { "text": "围城", "lemmas": [{ "lemma": "围城", "part_of_speech": "n" }], "pronunciation": "wéi chéng" },
      { "text": " ", "lemmas": [] }
    ]
  ]
}
```

`results[i]` corresponds to `texts[i]` by index.

Reconstruction fidelity is scored against the **normalized plain-text
paragraphs** (Markdown stripped, `\u202f`/`\xa0` normalized to spaces), not the
raw Markdown source — the pipeline is a tokenizer, not a Markdown renderer.

The stored/processed output is **additionally capped at 200 content tokens per
L2**. If a tokenizer expands the input beyond the budget (e.g., Hindi splits
Devanagari into ~2 tokens per character), the token stream is truncated at the
200-token boundary; a partially included paragraph is scored by comparing the
token prefix against the matching prefix of the original text.

### 2.2 Step 2 — Batch dictionary lookup

Collect **unique content tokens** (non-gap tokens; punctuation may be included
or excluded per a `--include-punct` flag, default excluded) and look them up:

```http
POST {PYTHON_SERVER}dictionary/lookup-batch
Content-Type: application/json

{
  "words": [
    { "text": "围城", "l2": "zh" },
    { "text": "essen", "l2": "de" }
  ]
}
```

Response: `{ "results": { "围城": [DictionaryEntry, …], "essen": […] } }`.
Unmatched words return an empty array. The endpoint is **pure SQL, English
definitions only** — no LLM fallback, no L1 translation.

### 2.3 Step 3 — Store results

For each language write `results/{l2}.json`:

```json
{
  "l2": "zh",
  "corpus": { "file": "corpus/zh.md", "title": "…", "url": "…", "fetched_at": "…" },
  "lemmatize": {
    "request": { "texts": […], "l2": "zh" },
    "response": { "results": […] },
    "latencyMs": 1234
  },
  "dictionary": {
    "request": { "words": […] },
    "response": { "results": { … } },
    "latencyMs": 456
  },
  "stats": {
    "blocks": 12,
    "tokens": 840,
    "uniqueContentTokens": 420,
    "reconstructionExact": true,
    "lemmaCoverage": 0.87,
    "dictHitRate": 0.64,
    "pronunciationCoverage": 0.92,
    "p95BlockMs": 310
  }
}
```

The raw requests/responses are kept so failures can be replayed and reviewed
without re-running the pipeline.

---

## 3. Scoring

### 3.1 Criteria

The v1 regime (25/25/20/15/10/5 with a 50% dict band and no hard spot
checks) saturated at ~95–100 for every language, so v2 reweights and
sharpens the measures. The v1 total is still computed and stored as
`legacyScore` so regressions in either regime stay visible.

| Criterion | Weight | Measure |
|---|---:|---|
| **Tokenization fidelity** | 15% | Reconstructed text (concat token `text` incl. gap tokens) == original block, byte-for-byte. Full credit for exact; partial credit = 1 − (diff chars / total chars). A whole paragraph collapsing to 1 token fails. |
| **Tokenization sanity** | 10% | 100 − 100 × whitespace-containing token fraction − 50 × punctuation-glued token fraction − 50 × over-merged token fraction (scriptio-continua only, content token > 20 chars). Dict-seg languages (zh/yue/th) are capped at 50 when average content-token length < 1.5 (char-by-char fallback). |
| **Lemma coverage** | 10% | Content tokens with ≥ 1 non-empty lemma ÷ content tokens. Coverage only — correctness is scored by spot-checks, since "any lemma" accepts wrong lemmas. |
| **Lemma spot-checks** | 20% | Seed (`expected_lemmas.json`) + hard (`hard_lemmas.json`) forms per language (see 3.2). Primary lemma must equal the expected form; an any-candidate match is recorded as `spotPassedAny` but does not pass. |
| **Dictionary hit (surface)** | 15% | Frequency-weighted content tokens whose surface has ≥ 1 dictionary entry. Linear: score = rate × 100 (no 50% full-credit band). |
| **Dictionary hit (lemma)** | 10% | Frequency-weighted content tokens whose **primary lemma** has ≥ 1 dictionary entry. Linear. Measures the surface-vs-lemma integration gap directly. |
| **Pronunciation coverage** | 10% | Word-like content tokens (`text.isalpha()`, excludes digits/labels) with non-empty `pronunciation`, **only for languages where the server emits pronunciation** (zh, ja, ko, ru, yue, ar, th). Weights renormalize; N/A shown as —. |
| **Reliability & latency** | 5% | No HTTP/5xx errors; **p95** block time < 2 s (configurable). Any hard error zeroes this criterion. |

Total = weighted sum of applicable criteria, 0–100. Grades: **A** ≥ 90,
**B** 80–89, **C** 70–79, **D** 60–69, **F** < 60.

### 3.2 Expected-lemma spot maps (seed + hard)

The seed map lives in `expected_lemmas.json` and covers the classic easy
forms. The hard map (`hard_lemmas.json`) adds corpus-derived failure modes:
noun/verb ambiguity (`fr partie`, `es como`, `pt parte`), particles (`ko
는/서`), Turkish Zeyrek stem errors (`yıl`/`Dil`), Arabic root-stripping
(`فصل`/`لأن`/`كلمة`), and German/Italian inflection misses. Surface-as-lemma
languages (vi/hi/he) and dict-seg languages (zh/yue/th) expect the surface.

| L2 | Expected forms |
|---|---|
| `ja` | `思った→思う`, `食べた→食べる` |
| `ko` | `먹었습니다→먹다`, `드시→들다` |
| `en` | `went→go`, `better→good`, `children→child` |
| `de` | `gelesen→lesen`, `gegangen→gehen`, `besser→gut` |
| `fr` | `suis→être`, `allé→aller`, `acheté→acheter` |
| `es` | `estudiantes→estudiante`, `son→ser` |
| `it` | `sono→essere`, `andato→andare`, `comprato→comprare` |
| `pt` | `fui→ir`, `comprei→comprar` |
| `nl` | `ben→zijn`, `geweest→zijn`, `gekocht→kopen` |
| `ru` | `читаю→читать`, `начал→начать` |
| `zh` / `yue` | segmentation-only: verify `围城` / `動物學` stay one token; lemma = surface expected |
| `th` | segmentation-only: no spaces inserted; lemma = surface expected |
| `tr` | server (Zeyrek) expects dictionary lemmas `gittim→gitmek`, `aldım→almak`; offline snowball stems (`git`, `al`) are the expected fallback, not a pass for the server path |
| `id` | `membeli→beli` where table covers it; otherwise surface-as-lemma acceptable |
| `vi` / `hi` / `he` | surface-as-lemma expected |
| `ar` | known server Qalsadi bugs (`كتبتها→تب`, `أعني→أعنة`) are **documented gaps**, not score-killers; flag in report |

### 3.3 Scorecard output

`results/scorecard.md` (also `scorecard.json`):

| L2 | Tokens | Lemma cov. | Spot | Dict surf. | Dict lem. | Pron. | p95 (ms) | Old | New | Grade |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| zh | 89 | 100% | 5/5 | 90% | 90% | 100% | 22 | 100.0 | 96.5 | A |
| … | | | | | | | | | | | |

Each language also gets a short **notes** column entry for warnings (e.g.,
"Arabic Qalsadi known bugs", "Turkish snowball stems only", "Hebrew surface
lemmas", corpus artifacts such as digit-heavy or initial-heavy samples).
"Old" is the v1 total (kept as `legacyScore`), "New" is the v2 total.

The first committed snapshot of a real run is in
[Section 4.1](#41-scorecard-snapshot-2026-08-09).

---

## 4. Known Limitations / Expected Gaps

| Language | Expected behavior to account for in scoring |
|---|---|
| `tr` | No offline lemma table; server Zeyrek. Snowball stems offline, not lemmas. |
| `hi` / `he` / `vi` | Regex split + surface-as-lemma offline; server may be better. No offline ruby for hi/he. |
| `id` | Simplemma table only; prefix forms (`membeli→beli`) depend on table coverage. |
| `yue` | Offline main-thread dict-seg lacks token-level jyutping; server output should have it. |
| `ar` | Server Qalsadi has known lemma bugs; offline arabic-stem is root-oriented. Pronunciation is SAMPA-style. |
| `pt` | In the popular list by historical weight; zero recent watch activity (not a tokenizer issue). |
| Corpus quality | A Wikipedia article may include names/foreign terms that dictionaries don't cover — v2 scores dict linearly and flags corpus artifacts (initials, digit/Latin labels) in the notes. |

### 4.1 Scorecard snapshot (2026-08-09)

Local Flask, 200-token budget per L2, longest-paragraph selection. Source:
`tmp/tokenizer-eval/results/scorecard.md`, regenerated by `run_eval.py` (sorted
by total score, descending).

| L2 | Tokens | Lemma cov. | Spot | Dict hit | Pron. | Avg ms | Total | Grade | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| zh | 89 | 100% | 2/2 | 86% | 100% | 22.3 | 100.0 | A |  |
| en | 200 | 100% | 3/3 | 77% | 0% | 398.6 | 100.0 | A |  |
| ja | 109 | 100% | 2/2 | 82% | 100% | 6.4 | 100.0 | A |  |
| fr | 176 | 100% | 3/3 | 88% | 0% | 8.6 | 100.0 | A |  |
| de | 200 | 100% | 3/3 | 77% | 0% | 8.9 | 100.0 | A |  |
| es | 196 | 100% | 2/2 | 56% | 0% | 9.9 | 100.0 | A |  |
| vi | 200 | 100% | 2/2 | 88% | 0% | 8.3 | 100.0 | A | surface-as-lemma; syllable-level splitting acceptable |
| it | 200 | 100% | 3/3 | 74% | 0% | 11.0 | 100.0 | A |  |
| hi | 200 | 100% | 2/2 | 74% | 0% | 296.7 | 100.0 | A | spaCy xx_ent_wiki_sm (multilingual; no lemmatizer, surface-as-lemma) |
| id | 200 | 100% | 1/1 | 57% | 0% | 144.7 | 100.0 | A | Simplemma table only; pipe-table blocks excluded from selection |
| nl | 200 | 100% | 3/3 | 73% | 0% | 15.5 | 100.0 | A |  |
| pt | 200 | 100% | 2/2 | 82% | 0% | 11.3 | 100.0 | A | popular by historical weight; low recent activity |
| ar | 200 | 100% | 0/0 | 46% | 99% | 5.2 | 98.8 | A | CAMeL MLE calima-msa-r13; Qalsadi fallback; SAMPA pronunciation; punctuation-adjacent spaces recovered |
| ko | 60 | 100% | 2/2 | 43% | 100% | 14.6 | 98.0 | A |  |
| ru | 196 | 100% | 2/2 | 41% | 100% | 13.4 | 97.4 | A |  |
| he | 200 | 100% | 2/2 | 41% | 0% | 18.5 | 97.2 | A | surface-as-lemma; table-like blocks excluded from selection |
| th | 49 | 100% | 2/2 | 49% | 73% | 6.9 | 97.0 | A |  |
| tr | 200 | 100% | 2/2 | 35% | 0% | 691.9 | 95.0 | A | Zeyrek stems; apostrophe preservation fixed (SPEC-057 P1) |
| yue | 99 | 100% | 2/2 | 33% | 95% | 7.2 | 94.5 | A | dict-seg; offline main-thread lacks jyutping |

### 4.2 Findings & commentary (2026-08-09, after SPEC-057 Phase 1)

**All 19 languages now score A.** SPEC-057 Phase 1 landed four engine fixes and
one corpus-selection fix; this snapshot is the re-run after those changes.

**Fixed in Phase 1:**

- **Hindi (C → A, 100.0)** — Phase 1 first fixed `_fallback_lemmatize` to keep
  Unicode combining marks (Mn/Mc/Me; Devanagari matras are Mc) inside word
  tokens, so `हिन्दी` tokenizes as one word instead of `ह ि न ् द ी`. Hindi was
  then swapped to spaCy's multilingual `xx_ent_wiki_sm` (ADR-0018 names spaCy
  as the `hin` fallback; no Hindi-specific spaCy model exists). That model has
  no lemmatizer, so `lemmatize_spacy` falls back to surface-as-lemma; both
  spot-checks still pass and the dictionary hit rate improved from 68% (after
  Phase 1) to 74%.
- **Arabic (C → A, 98.5 → 98.8)** — `_recover_spaces` emits every gap
  character and repairs tokens merged across a gap, so `النصر»؛ «من`
  reconstructs exactly. Phase 1 kept Qalsadi as the engine; Phase 2 then
  adopted CAMeL Tools MLE (`calima-msa-r13`), which fixes the known lemma
  bugs (`كتبتها→تب` → `كتب`, `أعني→أعنة` → `عنى`) and raised lemma coverage
  to 100%.
- **Turkish (D → A, 95.0)** — `lemmatize_turkish` splits suffixed forms on the
  apostrophe (`1933'te` → `1933` + `'` + `te`), so reconstruction is byte-exact
  while Zeyrek still lemmatizes the stem (`Kurultayı → kurultay`).
- **Indonesian (D → A, 100.0)** — pipe-table blocks (and caption lines merged
  with them) are excluded from paragraph selection, so the mangled numerals
  table no longer enters the corpus.
- **Hebrew (B → A, 97.2)** — the lift comes from paragraph selection:
  excluding table-like blocks picks prose with a 41% dictionary hit rate
  instead of 9%.

**Dictionary coverage is still the biggest systemic gap.** `yue` 33%, `tr` 35%,
`ru`/`he` 41%, `ar` 46%, and `ko` 43% remain below the 50% full-credit band.
These are dictionary/data gaps (SPEC-057 Phase 3), not lemmatizer failures.

**Latency numbers are warm-cache figures.** The `tr` (692 ms avg) and `en`
(399 ms avg) rows include post-reload model warm-up on the first block; later
runs are single-digit ms. Treat the Avg ms column as indicative, not a
benchmark.

**SPEC-057 Phase 2: CAMeL adopted for Arabic, Stanza measured but not
adopted.** CAMeL Tools MLE (`calima-msa-r13`) replaced Qalsadi as the primary
Arabic engine (GPL v2 data accepted server-side, same policy as Qalsadi's
GPL-3.0; Qalsadi remains the automatic fallback). The Arabic row above and the
v2 row in §4.3 reflect the post-CAMeL re-run: known lemma bugs fixed, lemma
coverage 100%, and the single-word `/lemmatize-normalized` path no longer 500s.
Stanza (`he`) was measured with `scripts/tokenizer-eval/compare_prototypes.py`
(results under `tmp/tokenizer-eval/prototypes/`) — it improves spot-checks
(4/4 vs 0/4) and raises Hebrew dictionary hit from 41% to 59% via clitic
tokenization, but its CC BY-NC-SA training data remains a production blocker,
so the Hebrew engine is unchanged.

### 4.3 Scorecard snapshot — v2 regime (2026-08-09)

Same corpus, same server, 200-token budget, but scored with the §3.1 v2
weights (linear dictionary rates, hard spot checks, sanity score, p95).
Source: `tmp/tokenizer-eval/results/scorecard.md`.

| L2 | Tokens | Lemma cov. | Spot | Dict surf. | Dict lem. | Pron. | p95 ms | Old | New | Grade | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| vi | 200 | 100% | 6/6 | 92% | 92% | — | 4.4 | 100.0 | 97.5 | A | surface-as-lemma; syllable-level splitting acceptable |
| zh | 89 | 100% | 5/5 | 90% | 90% | 100% | 17.0 | 100.0 | 97.1 | A | |
| ja | 109 | 100% | 6/6 | 87% | 86% | 100% | 3.3 | 100.0 | 96.5 | A | |
| en | 200 | 100% | 8/8 | 84% | 94% | — | 6.8 | 100.0 | 96.4 | A | lemma lookup would raise dict coverage 84%→94% |
| nl | 200 | 100% | 6/6 | 80% | 88% | — | 4.6 | 100.0 | 95.1 | A | lemma lookup would raise dict coverage 80%→88% |
| hi | 200 | 100% | 6/6 | 80% | 80% | — | 7.0 | 100.0 | 94.3 | A | spaCy xx_ent_wiki_sm; surface-as-lemma |
| fr | 176 | 100% | 5/6 | 89% | 89% | — | 5.5 | 100.0 | 92.8 | A | hard spot `partie→partir` fails |
| id | 200 | 100% | 5/5 | 69% | 76% | — | 3.1 | 100.0 | 91.8 | A | lemma lookup would raise dict coverage 69%→76% |
| pt | 200 | 100% | 5/6 | 80% | 83% | — | 4.6 | 100.0 | 90.6 | A | hard spot `parte→partir` fails; 16% single-letter tokens |
| ru | 196 | 100% | 6/6 | 48% | 80% | 100% | 9.5 | 97.4 | 89.8 | B | 53% single-letter initials; lemma lookup 48%→80% |
| de | 200 | 100% | 6/8 | 82% | 82% | — | 5.7 | 100.0 | 89.0 | B | hard spots `Gesetzestexte`/`staatliche` un-lemmatized |
| it | 200 | 100% | 6/8 | 80% | 80% | — | 9.9 | 100.0 | 88.1 | B | hard spots `attraverso`/`corsi` wrong; any-candidate 7/8 |
| es | 196 | 100% | 5/7 | 71% | 89% | — | 5.4 | 100.0 | 87.0 | B | hard spots `como`/`considerárseles` fail; lemma lookup 71%→89% |
| th | 49 | 100% | 6/6 | 57% | 57% | 75% | 3.4 | 97.0 | 86.0 | B | 20% digit/CEFR labels in sample |
| he | 200 | 100% | 5/5 | 44% | 44% | — | 5.1 | 97.2 | 83.7 | B | surface-as-lemma; prefixed forms miss dict |
| yue | 99 | 100% | 5/5 | 37% | 37% | 96% | 3.3 | 94.5 | 83.1 | B | dict-seg; 粵語 itself not in dict |
| ko | 60 | 100% | 5/7 | 48% | 65% | 100% | 5.9 | 98.0 | 82.0 | B | particles `는`/`서` wrong; lemma lookup 48%→65% |
| tr | 200 | 100% | 7/9 | 42% | 76% | — | 21.3 | 95.0 | 81.8 | B | Zeyrek primary stems wrong; any-candidate 9/9; lemma lookup 42%→76% |
| ar | 200 | 100% | 2/4 | 58% | 84% | 99% | 5.2 | 98.8 | 81.0 | B | CAMeL MLE calima-msa-r13; hard spots `لأن→أن`/`العربية→عربي` vs surface expectations; lemma lookup 58%→84% |

**What the v2 regime changed:**

- Grades now discriminate: 9 A, 10 B, 0 D (old regime: 19 A, 94.5–100).
- Lemma correctness is visible for the first time. Hard spots catch the
  noun/verb errors (`fr partie`, `es como`, `pt parte`, `it corsi`), German
  inflection misses, Korean particle lemmas, and Turkish primary-stem errors.
  Arabic's hard spots now exercise the new CAMeL engine — `لأن→أن` and
  `العربية→عربي` are arguably correct lemmas, so the Arabic hard map may want
  surface-consistency expectations updated if the v2 regime is adopted.
- The **Dict lem.** column is the biggest actionable signal: lemmatizing
  before dictionary lookup would raise coverage from 48→80% (ru), 42→76%
  (tr), 71→89% (es), 58→89% (ar), and 84→94% (en). Surface-form lookup is
  the main fixable gap, and the old scorecard could not see it.
- Corpus artifacts are now flagged instead of silently dragging scores:
  ru's bibliography initials (53% single-letter tokens) and th/tr's digit
  and CEFR labels are called out in the notes.

**Arabic went D → B with CAMeL.** Before the Phase 2 engine swap, the
single-word `/lemmatize-normalized` path 500ed for `فصل`, `لأن`, `كلمة`, and
`العربية` (SQLite cross-thread error in the Qalsadi cache path), zeroing the
spot and reliability criteria (65.6, D). With CAMeL those calls return 200
(spot errors 4/4 → 0/4), lemma coverage is 100%, and Arabic scores 81.0 (B).
The two remaining hard-spot misses are `لأن→أن` and `العربية→عربي` — CAMeL
produces the linguistic lemma while v2's Arabic hard map expects the surface.

---

## 5. Reproducibility & Hygiene

- Pin `corpus_config.json` titles; never silently randomize.
- Record `fetched_at` + source revision in `manifest.json` so a re-fetch after a
  Wikipedia edit is detectable.
- Keep raw request/response JSON in `tmp/tokenizer-eval/results/`; they are
  generated artifacts and are gitignored. `scorecard.md` there is the working
  summary; copy it into a tracked location when a run is promoted to a report.
- Scripts (`scripts/tokenizer-eval/`) are tracked and reusable; corpora/results
  under `tmp/tokenizer-eval/` are regenerated per run.
- Use `python3.10` for all scripts (repo rule).
- Flask must already be running (local or `PYTHON_SERVER` override); the runner
  never starts/stops it.

---

## 6. Definition of Done

1. `fetch_corpus.py` validates 19/19 corpora (richness rules pass).
2. `run_eval.py` produces 19/19 result JSONs with zero HTTP/5xx errors.
3. `scorecard.md` lists all 19 languages with total + grade + notes.
4. Every warning/known gap is either fixed or explicitly documented in the
   scorecard notes.
5. Spot-check results cross-reference SPEC-055 TCs where applicable (e.g., a
   suite failure on `ja` should correlate with TC-01 expectations).

---

## 7. Open Questions

- Should corpora/results live under `tmp/` (throwaway) or a tracked
  `test-data/tokenizer-eval/` folder for CI?
- Should the expected-lemma maps be expanded per language (e.g., 10+ forms), or
  kept at the seed size for a first run?
- Should the suite run against local Flask only, or also against a staging
  deployment with `PYTHON_SERVER` overrides?
- Do we want a `--diff` mode that re-runs after a change and prints only
  score deltas?
