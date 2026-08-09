# SPEC-058 — Automated Mobile Offline Tokenization Evaluation Suite (19 Popular L2s)

## Metadata

- **Spec ID**: SPEC-058
- **Feature**: Automated corpus-driven evaluation of the mobile **offline** tokenization/lemmatization fallback chain, scored per language
- **Status**: draft
- **Created**: 2026-08-09
- **Scope**: `apps/mobile` local tokenizer (`lib/tokenizer.ts` + a Node/vitest test harness), fixture-generation scripts, `vitest.mobile.config.ts`; generated corpora/results under `tmp/tokenizer-eval-mobile/`
- **Related specs**: [SPEC-056 — Automated Tokenization Eval](056-automated-tokenization-eval.md) · [SPEC-055 — Local Tokenizer Testing Checklist](055-local-tokenizer-testing.md) · [SPEC-018 — Mobile Local Tokenization](018-local-tokenization-mobile.md) · [SPEC-023 — Mobile E2E Testing](023-mobile-e2e-testing.md) · [SPEC-013 — Mobile Offline Dictionary](013-mobile-offline-dictionary.md)
- **Related architecture/ADRs**: [ARCH-018 — Local Tokenization Strategy](../arch/018-local-tokenization-strategy.md) · [ARCH-016 — Server Tokenization Pipeline](../arch/016-server-tokenization.md) · [ADR-0029 — Registry / Lemma Table Single Source of Truth](../adr/0029-registry-single-source-of-truth.md) · [ADR-0030 — Data-Driven Popular L2 List](../adr/0030-popular-l2-list-usage-data.md)
- **Key implementation files**: `apps/mobile/lib/tokenizer.ts`, `apps/mobile/tests/tokenizer-eval/*`, `vitest.mobile.config.ts`, `scripts/tokenizer-eval-mobile/prepare_fixtures.mjs`, `packages/shared/src/language-data.ts`

---

## Overview

SPEC-056 gives us a repeatable, automated, corpus-driven scorecard for the
Flask tokenization/lemmatization pipeline across the 19 popular L2s. Mobile
offline tokenization (SPEC-018 / ARCH-018) has the same shape — tokenize,
lemmatize, pronounce — but runs through a completely different stack: a
JS/TS fallback chain in `apps/mobile/lib/tokenizer.ts` with downloaded
lemma tables, dictionary headword sets, kuromoji packs, and bundled engines.
SPEC-058 builds the mobile counterpart: an automated Node/vitest suite that
runs the same 19-language Wikipedia corpus through the **local offline chain**
and produces the same kind of per-language scorecard.

The suite has three stages, mirroring SPEC-056:

1. **Corpus** — the same pinned Wikipedia articles per language, stored as
   Markdown in a tracked snapshot.
2. **Pipeline** — run each corpus through the mobile local fallback chain
   (`runLocalFallback`), storing every tokenized/lemmatized JSON for
   inspection. No server calls.
3. **Scoring** — compute a per-language score from tokenization fidelity,
   lemma coverage, lemma spot-checks, offline-dictionary hit rate,
   pronunciation coverage (where the offline chain supports it), and
   reliability/latency; emit a scorecard.

### Relationship to E2E testing

**The WebView worker path (`tokenizer-worker.ts`) is out of scope and
assumed to work.** The worker is a UI-thread optimization around the same
engines (kuromoji, dict max-matching); this suite mocks it to `null` and
exercises the deterministic main-thread fallback chain, which is the
functional equivalent. The worker, real-device latency, SQLite/file-system
pack loading, and offline-mode UX are covered by mobile E2E testing
(SPEC-023). This spec explicitly cross-references what each suite owns so
the two don't duplicate each other.

| Concern | Owner |
|---|---|
| Engine correctness (segmentation, lemmas, pronunciation, reconstruction) | This suite (SPEC-058) |
| WebView worker behavior (ja, dict-seg) | E2E (SPEC-023) |
| Real-device latency / frame drops / time-slicing | E2E (SPEC-023) |
| Real SQLite + expo-file-system pack loading | E2E (SPEC-023) |
| Offline Mode toggle UX | E2E (SPEC-023) |

---

## Language Scope

Exactly the 19 languages in `POPULAR_L2S`
(`packages/shared/src/language-data.ts`, ADR-0030):

| L2 code | Mobile offline engine (ARCH-018) | Test data needed |
|---|---|---|
| `zh` | dict max-matching (surface = lemma) | dictionary headword fixture |
| `en` | lemma table + snowball | lemma table fixture |
| `ja` | kuromoji (IPADIC) | kuromoji pack fixture |
| `ko` | kuromoji-ko (mecab-ko-dic) + koroman | kuromoji-ko pack fixture |
| `fr` | lemma table + snowball | lemma table fixture |
| `de` | lemma table + snowball | lemma table fixture |
| `es` | lemma table + snowball | lemma table fixture |
| `vi` | regex split + surface | — |
| `ru` | lemma table + snowball + romanize | lemma table fixture |
| `ar` | arabic-stem | — |
| `tr` | snowball | — |
| `it` | lemma table + snowball | lemma table fixture |
| `hi` | regex split + surface | — |
| `yue` | dict max-matching (surface = lemma) | dictionary headword fixture |
| `th` | dict max-matching (surface = lemma) | dictionary headword fixture |
| `id` | lemma table | lemma table fixture |
| `nl` | lemma table + snowball | lemma table fixture |
| `he` | regex split + surface | — |
| `pt` | lemma table + snowball | lemma table fixture |

All 19 languages have a defined offline strategy, so full coverage is
possible with no server dependency at test time.

---

## Test Architecture

### 1. Corpus

Reuse SPEC-056's corpus rule set and pinned titles
(`scripts/tokenizer-eval/corpus_config.json`). The mobile suite reads from a
**tracked snapshot**:

```
test-data/tokenizer-eval-mobile/
├── corpus/
│   ├── manifest.json        ← title, URL, fetched_at, revision, word counts
│   ├── zh.md
│   ├── en.md
│   └── … (one .md per popular L2)
├── spot-checks.json         ← expected lemma/stem/surface/pron forms (tracked)
└── README.md                ← how to refresh from SPEC-056 corpus
```

Implementation step: copy the already-generated SPEC-056 corpus
(`tmp/tokenizer-eval/corpus/`) into the tracked snapshot once. Refreshing is
an explicit, reviewed act (re-run `scripts/tokenizer-eval/fetch_corpus.py`,
verify the richness rules, copy the new files) — never silent.

### 2. Fixtures (generated, gitignored)

The runner needs real on-device data, not mocks of the data itself. A prep
script snapshots it:

```
tmp/tokenizer-eval-mobile/
├── fixtures/
│   ├── lemmas/{l2}.json          ← GET /lemmatization/export?l2=X&format=json
│   ├── dicts/{l2}.json           ← offline dictionary rows (head/alternate/pron/POS)
│   └── kuromoji/ja/, kuromoji/ko/ ← tokenizer data packs (.dat.gz)
├── results/
│   ├── {l2}.json
│   ├── scorecard.json
│   └── scorecard.md
```

Sources:

| Fixture | Source | Notes |
|---|---|---|
| Lemma tables | `GET /lemmatization/export?l2=X&format=json` | Requires Flask running during prep (same convention as SPEC-056). Full tables are large; keep them under `tmp/` (gitignored). |
| Dictionary rows | `GET /dictionary/download?l2=X&format=ndjson` (primary) or the precompiled DB | Keep `head`, `alternate`, `pronunciation`, `part_of_speech` per row — the exact columns `loadDictWordSet()` queries. |
| ja pack | `GET /lemmatization/download?l2=ja` **or** seed from `node_modules/kuromoji/dict/` | The npm package ships the same `.dat.gz` files the app loads. |
| ko pack | `GET /lemmatization/download?l2=ko` **or** seed from `node_modules/kuromoji-ko/dict/` | Same files as the on-device pack. |

If a fixture is missing, the runner skips only that language and reports it
— no silent fallback to a different corpus or data source.

### 3. Test-only production hooks (minimal change)

Production behavior is unchanged; only additive exports are allowed:

- Export `runLocalFallback` and `runLocalFallbackRaw` from
  `apps/mobile/lib/tokenizer.ts` under a clearly-marked
  `// ── Eval/test hooks ──` section. `runLocalFallback` is the exact path
  the app uses (canonicalized + cached); `runLocalFallbackRaw` is the
  uncached variant for latency measurement.
- `clearDictionaryCaches(l2)` and `resetTokenizer(l2)` are already exported
  and are used to reset state between languages.

No other production code changes are permitted by this spec. In particular,
the runner must NOT skip `canonicalizeLocalTokens()` — reconstruction
fidelity is one of the scored criteria and is guaranteed by that step.

### 4. Mobile vitest configuration

New `vitest.mobile.config.ts` at the repo root:

- `test.environment: 'node'`
- `test.include: ['apps/mobile/**/*.test.ts']`
- `resolve.alias`:
  - `@` → `apps/mobile` (⚠️ the root config aliases `@` to `apps/web/src`;
    that is why a separate config is required)
  - `@langplayer/shared`, `@langplayer/api-client`, `@langplayer/utils` →
    their `src/` directories (same as root config)
- `test.setupFiles: ['apps/mobile/tests/tokenizer-eval/setup.ts']`
- `test.timeout: 120_000` (kuromoji dictionary builds can take a while)

New `apps/mobile/tests/tokenizer-eval/` directory (outside `apps/mobile/lib/`
so the root vitest config's `apps/mobile/lib/**` include never picks it up):

```
apps/mobile/tests/tokenizer-eval/
├── setup.ts              ← global-safe mocks (offline mode, worker, api-url)
├── fixtures.ts           ← fixture paths + JSON/row loaders
├── corpus.ts             ← TS port of SPEC-056 paragraph selection/normalization
├── engines.ts            ← Node adapters for kuromoji / kuromoji-ko
├── score.ts              ← scoring port (SPEC-056 weights, offline adaptations)
└── tokenizer-eval.test.ts ← the suite: one `it()` per L2 + scorecard writer
```

#### Mock strategy

Global-safe mocks in `setup.ts` (these apply to every mobile test):

```ts
vi.mock('@/lib/api-url', () => ({ PYTHON_API_URL: 'http://localhost:5001' }));
vi.mock('@/lib/offline-mode', () => ({ isOfflineModeEnabled: () => true }));
vi.mock('@/lib/tokenizer-worker', () => ({
  tokenizeJapaneseInWorker: async () => null,
  tokenizeDictSegInWorker: async () => null,
  resetDictWorker: () => {},
  attachTokenizationWebView: () => {},
  isTokenizationWorkerReady: () => false,
}));
```

Data-source mocks live in `tokenizer-eval.test.ts` (so
`romanize.test.ts` and other unit tests are unaffected):

- `vi.mock('@/lib/tokenizer-db')` — `hasKuromojiData(l2)` /
  `getKuromojiDataPath(l2)` return the fixture path when present;
  `hasLemmaTable(l2)` returns true when `fixtures/lemmas/{l2}.json`
  exists; `lookupLemmasBatch(l2, words)` returns the fixture hits;
  `downloadLemmaTable()` is a no-op.
- `vi.mock('@/lib/dictionary-db')` — `openOfflineDictionaryDB(l2)` /
  `openDictionaryDB()` return a fake DB whose `getAllAsync(sql)` ignores
  the SQL and returns the fixture rows (`head`, `alternate`,
  `pronunciation`, `part_of_speech`). This lets the production
  `loadDictWordSet()` probes run unmodified.
- `vi.mock('@/lib/kuromoji-loader')` / `vi.mock('@/lib/kuromoji-ko-loader')`
  — `loadKuromoji(path)` / `loadKuromojiKo(path)` build the tokenizer in
  Node from the fixture pack directory (see `engines.ts`). This keeps the
  production `getKuromojiTokenizer()` → `tokenizeJapanese()` /
  `tokenizeKorean()` code paths identical; only the file loader is swapped.

### 5. Runner (`tokenizer-eval.test.ts`)

For each L2:

1. **Clear state**: `clearDictionaryCaches(l2)` + `resetTokenizer(l2)`.
2. **Select blocks**: port SPEC-056's rules — strip Markdown markup,
   pick the longest paragraphs, cap at a **200-unit budget** per language
   (words for space-separated, characters for scriptio-continua), truncate
   the last paragraph. Reuse `scripts/tokenizer-eval/corpus_config.json`
   semantics; the TS port lives in `corpus.ts` and must stay behaviorally
   identical to `run_eval.py` (comment both files pointing at each other).
3. **Run**: for each block, `await runLocalFallbackRaw(text, l2)` and
   `await runLocalFallback(text, l2)` — raw for latency stats, canonical
   for scoring. Record per-block ms.
4. **Cap stored output** at 200 content tokens per L2 (same truncation
   semantics as SPEC-056 §2.1).
5. **Spot-checks**: run each form from `spot-checks.json` through
   `runLocalFallbackRaw`, compare against the expected output mode.
6. **Write** `results/{l2}.json` with requests, responses, latency, and
   stats (same shape as SPEC-056 §2.3, minus dictionary HTTP request).

An `afterAll` aggregates `scorecard.md` + `scorecard.json` under
`tmp/tokenizer-eval-mobile/results/`.

---

## Scoring

Same weights as SPEC-056 §3.1, with offline-specific semantics:

| Criterion | Weight | Measure (offline adaptation) |
|---|---:|---|
| **Tokenization fidelity** | 25% | Reconstructed text (concat token `text`) == original block byte-for-byte. Dict-seg languages (zh/yue/th) fail if avg content-token length < 1.5 (char-by-char). Any language fails if a whole paragraph collapses to 1 token. |
| **Lemma coverage** | 25% | Content tokens with ≥ 1 non-empty lemma ÷ content tokens. |
| **Lemma spot-checks** | 20% | Expected-form map from `spot-checks.json` (SPEC-055 TC forms + SPEC-056 seed). Each entry declares `mode`: `lemma` (must match exactly), `stem` (known stemmer output — tr, ar), `surface` (vi/hi/he), `segment` (zh/yue/th token count/shape). |
| **Dictionary hit rate** | 15% | Unique content tokens with an exact `head`/`alternate` match in the offline dictionary fixture ÷ unique content tokens. Full credit ≥ 50%, partial 30–49%, 0 below 30%. |
| **Pronunciation coverage** | 10% | Content tokens with non-empty `pronunciation` ÷ content tokens, **only for languages where the main-thread offline chain emits it**: `zh`, `ja`, `ko`, `ru`, `th`, `ar`. `yue` is N/A (main-thread dict-seg lacks jyutping; e2e covers the worker path). Weights renormalize. |
| **Reliability & latency** | 5% | No thrown errors; warm p95 block time < 2 s. Kuromoji cold-init time is recorded separately (`coldInitMs`) and reported but not scored. |

### Expected behaviors per language (seed for `spot-checks.json`)

Seed from SPEC-055 TCs and SPEC-056 `expected_lemmas.json`:

| L2 | Mode | Expected forms (non-exhaustive) |
|---|---|---|
| `ja` | lemma | `思った→思う`, `食べた→食べる`, `美味しかった→美味しい` (kuromoji) |
| `ko` | lemma | `먹었습니다→먹다`, `드시→들다`, `좋아합니다` pronunciation `joahamnida` |
| `zh` | segment | `围城` stays one token; no char-by-char |
| `yue` | segment | `動物學` / `你好嗎` stay one token; no char-by-char |
| `th` | segment | `ภาษาไทย` segments into known words; no char-by-char |
| `en` | lemma | `went→go`, `better→good`, `children→child` |
| `de` | lemma | `gelesen→lesen`, `gegangen→gehen`, `besser→gut` |
| `fr` | lemma | `suis→être`, `allé→aller`, `acheté→acheter` |
| `es` | lemma | `estudiantes→estudiante`, `son→ser` |
| `it` | lemma | `sono→essere`, `andato→andare`, `comprato→comprare` |
| `pt` | lemma | `fui→ir`, `comprei→comprar` |
| `nl` | lemma | `ben→zijn`, `geweest→zijn`, `gekocht→kopen` |
| `id` | lemma | `membeli→beli` where the table covers it; otherwise surface acceptable |
| `ru` | lemma | `начал→начать`, `года→год`, `его→он`, `собой→себя`, `остановиться→остановиться` (table required; snowball stems are NOT a pass) |
| `ar` | stem | arabic-stem output expected (`المستنقعات→نقع`); documented Qalsadi/arabic-stem gaps are warnings, not failures |
| `tr` | stem | snowball stems expected (`gittim→git`, `aldım→al`); no offline lemma table |
| `vi` / `hi` / `he` | surface | surface-as-lemma expected; reconstruction exactness still required |

### Scorecard output

Same format as SPEC-056 §3.3, plus a `mode` column for expected-lemma vs
stem vs surface:

| L2 | Tokens | Lemma cov. | Spot | Dict hit | Pron. | p95 (ms) | Total | Grade | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|

Grades: A ≥ 90, B 80–89, C 70–79, D 60–69, F < 60 (identical to SPEC-056).

---

## Implementation Plan

### Phase 0 — Spike: kuromoji/kuromoji-ko in Node

Verify that `kuromoji.builder({ dicPath })` and `kuromojiKo.builder(...)`
load the fixture packs under plain Node (default loaders, no
expo-file-system). `node_modules/kuromoji/dict` and
`node_modules/kuromoji-ko/dict` already ship the `.dat.gz` files. If
kuromoji-ko requires a custom loader even in Node (tsup-bundled internals),
document the shim in `engines.ts` and adjust the mock contract.

### Phase 1 — Test infrastructure

1. Add `vitest.mobile.config.ts` + `apps/mobile/tests/tokenizer-eval/setup.ts`
   (global mocks).
2. Add the `// ── Eval/test hooks ──` exports to `tokenizer.ts`
   (`runLocalFallback`, `runLocalFallbackRaw`).
3. Copy the SPEC-056 corpus into `test-data/tokenizer-eval-mobile/corpus/`
   with its manifest.
4. Create `spot-checks.json` from SPEC-055 TCs + SPEC-056
   `expected_lemmas.json` with `mode` annotations.
5. Verify `romanize.test.ts` still passes under the new config.

### Phase 2 — Fixture preparation

New `scripts/tokenizer-eval-mobile/prepare_fixtures.mjs` (Node 22, tracked):

1. Ensure corpus snapshot exists (no network needed; it is committed).
2. For each L2 with `hasLemmaTable`: fetch `/lemmatization/export` and write
   `tmp/tokenizer-eval-mobile/fixtures/lemmas/{l2}.json`.
3. For `zh`, `yue`, `th`: fetch `/dictionary/download?l2=X&format=ndjson`
   (or the precompiled DB) and write `dicts/{l2}.json` with the four
   queried fields.
4. For `ja`, `ko`: copy from `node_modules` packs when present, else fetch
   `/lemmatization/download?l2=X`.
5. Print a per-language readiness summary; exit non-zero if any expected
   fixture is missing (so CI can't silently skip).

Script is idempotent; `--fresh` re-downloads.

### Phase 3 — Runner + scorer

1. `corpus.ts` — TS port of SPEC-056 block selection/normalization.
2. `fixtures.ts` + `engines.ts` — fixture loaders and Node kuromoji
   adapters.
3. `score.ts` — port of `compute_score()` with the offline adaptations
   above.
4. `tokenizer-eval.test.ts` — per-L2 `it()` blocks (skip with a visible
   reason when a fixture is missing) + `afterAll` scorecard writer.
5. Wire the scorecard's `notes` to the known gaps table below.

### Phase 4 — Commands & CI

Add to root `package.json`:

```json
"test:tokenizer-mobile": "vitest run --config vitest.mobile.config.ts"
```

Commands:

```bash
node scripts/tokenizer-eval-mobile/prepare_fixtures.mjs   # Flask must be running for dict/lemma exports
npm run test:tokenizer-mobile
```

CI runs prepare → test in the same job. The root `npm test` is untouched
(the mobile eval tests live outside `apps/mobile/lib/`, so the root config
never sees them).

### Phase 5 — E2E worker harness (separate spec)

The WebView worker, real-device latency, and SQLite/file-system pack
loading are covered under SPEC-023 mobile E2E. This spec does not implement
them; it only documents the split and the assumption.

---

## Definition of Done

1. `prepare_fixtures.mjs` produces fixtures for all 19 L2s (kuromoji packs
   for ja/ko, lemma tables for table languages, dict rows for zh/yue/th).
2. `tokenizer-eval.test.ts` produces 19/19 result JSONs with zero thrown
   errors (skips are visible and individually justified).
3. `scorecard.md` lists all 19 languages with total + grade + notes.
4. Every known gap is either fixed or explicitly documented in the
   scorecard notes (ar stems, tr stems, ru table requirement, yue
   pronunciation N/A, hi/he/vi surface).
5. Spot-check results cross-reference SPEC-055 TCs (e.g., a suite failure
   on `ja` correlates with TC-01 expectations).
6. The WebView worker is mocked in `setup.ts` and the spec explicitly notes
   that e2e owns that path.
7. No production behavior changes beyond the additive exports;
   `cd apps/mobile && ./node_modules/.bin/tsc --noEmit` passes;
   `romanize.test.ts` still passes under both configs.

---

## Known Limitations / Expected Gaps

| Language/path | Expected behavior to account for in scoring |
|---|---|
| `tr` | Snowball stems offline, not dictionary lemmas — `stem` mode. |
| `ar` | `arabic-stem` roots and mangled pronouns/conjunctions — `stem` mode + documented warning (SPEC-055 TC-11). |
| `ru` | Snowball stems are a **failure** when the lemma-table fixture is present; table hits required (`начал→начать`, `его→он`, `собой→себя`). |
| `hi` / `he` / `vi` | Regex split + surface-as-lemma — `surface` mode; reconstruction exactness still required. |
| `yue` | Main-thread dict-seg lacks token-level jyutping — pronunciation N/A here; e2e covers the worker path. |
| `th` | Offline ruby comes from the dictionary's pronunciation column; tokens outside the downloaded dict have no ruby — pronunciation coverage is expected to be < 100%. |
| WebView worker | Mocked to `null`; not exercised in this suite (SPEC-023 e2e owns it). |
| Latency numbers | Node warm-cache timings are indicative, not device benchmarks (same caveat as SPEC-056 §4.2). |
| Fixture staleness | Fixtures snapshot the server data at prep time; re-run `prepare_fixtures.mjs` after lemma-table/dict changes and record the version in the scorecard. |

---

## Open Questions

- Should committed trimmed fixtures (e.g., top-10k lemma rows, top-30k dict
  heads) become the CI baseline so CI doesn't require Flask, with full
  snapshots only for local scorecard runs? Or is the Flask-dependent prep
  acceptable (SPEC-056 already assumes a running server)?
- Should the runner also emit a `--diff` mode (re-run after a change,
  print only score deltas) like SPEC-056's open question?
- Should `spot-checks.json` grow beyond the seed forms (10+ per language)
  after the first green run?
- Should this suite live in `npx turbo test`/CI as a required gate, or stay
  a manual/reporting tool like SPEC-056?
