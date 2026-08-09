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

| Criterion | Weight | Measure |
|---|---:|---|
| **Tokenization fidelity** | 25% | Reconstructed text (concat token `text` incl. gap tokens) == original block, byte-for-byte. Full credit for exact; partial credit = 1 − (diff chars / total chars). Granularity flags: dict-seg languages (zh/yue/th) fail if average content-token length < 1.5 (char-by-char); any language fails if a whole paragraph collapses to 1 token. |
| **Lemma coverage** | 25% | Content tokens with ≥ 1 non-empty lemma ÷ content tokens. Punctuation and whitespace excluded. |
| **Lemma spot-checks** | 20% | Per-language expected-lemma map (see 3.2). Correct matches ÷ expected forms. Languages with known surface-as-lemma behavior use the surface-consistency variant. |
| **Dictionary hit rate** | 15% | Unique content tokens with ≥ 1 dictionary entry ÷ unique content tokens. Full credit ≥ 50%, partial 30–49%, 0 below 30% (proper nouns/rare words are expected to miss). |
| **Pronunciation coverage** | 10% | Content tokens with non-empty `pronunciation` ÷ content tokens, **only for languages where the server emits pronunciation** (zh, ja, ko, ru, yue, ar, th). N/A for Latin-script/surface languages (en, fr, de, es, vi, tr, it, hi, id, nl, he, pt); weights renormalize. |
| **Reliability & latency** | 5% | No HTTP/5xx errors; p95 block time < 2 s (configurable). Any hard error on a language zeroes this criterion. |

Total = weighted sum of applicable criteria, 0–100. Grades: **A** ≥ 90,
**B** 80–89, **C** 70–79, **D** 60–69, **F** < 60.

### 3.2 Expected-lemma spot maps (initial seed)

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

| L2 | Tokens | Lemma cov. | Spot-check | Dict hit | Pron. | p95 (ms) | Total | Grade |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| zh | 840 | 87% | — | 64% | 92% | 310 | 91 | A |
| … | | | | | | | | |

Each language also gets a short **notes** column entry for warnings (e.g.,
"Arabic Qalsadi known bugs", "Turkish snowball stems only", "Hebrew surface
lemmas").

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
| Corpus quality | A Wikipedia article may include names/foreign terms that dictionaries don't cover — dictionary hit-rate scoring uses generous bands. |

### Initial findings (2026-08-09, local Flask, 200-token budget)

- **Turkish** — the tokenizer drops apostrophes in suffixed forms (`1933'te → 1933te`, `Kurultayı'nın → Kurultayının`), breaking reconstruction fidelity.
- **Arabic** — some punctuation-adjacent spaces are lost (`«النصر»؛«من»` style sequences), also breaking fidelity.
- **Indonesian** — table blocks and percent signs are mangled (`90% → 90`); tables should be excluded from paragraph selection or normalized before sending.
- **Hindi** — the server currently splits Devanagari near char-level (avg token length ≈ 1.36); surface-as-lemma spot-checks fail (`हिन्दी → ह`).
- **Hebrew** — tokenization/lemmas are fine, but dictionary hit rate is very low (9% on the first run), likely a dictionary-coverage issue rather than a tokenizer one.
- **Dictionary coverage** — `tr` (31%), `yue` (33%), `id` (20%), `he` (9%) are the weakest popular-L2 dictionaries in this corpus.

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
