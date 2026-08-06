# Sketch Engine Architecture — Corpus Features (Collocations, Examples, Thesaurus, Mistakes)

## Metadata
- **Arch ID**: ARCH-020
- **Feature**: Sketch Engine corpus integration — word sketch, concordance, thesaurus, Chinese learner mistakes
- **Type**: as-built
- **Status**: accepted
- **Created**: 2026-08-05
- **Last Updated**: 2026-08-05
- **ROADMAP Phase**: Phase 4 (Video Player / Dictionary)
- **Scope**: Classic (legacy source), Python Flask backend (active), Next.js Web + Mobile (target consumers)
- **Supersedes**: none
- **See also**:
  - [Classic App Architecture](001-classic-app-architecture.md)
  - [Python Backend Architecture](003-python-backend-architecture.md)
  - Source: `zerotohero-nuxt/lib/sketch-engine.js`, `zerotohero-php-server/sketch-engine-proxy.php`, `zerotohero-python-server/routes/sketch_engine.py`

---

## 1. Overview

Language Player shows four corpus-powered features in the dictionary/watch experience: **collocations** (word sketch), **example sentences** (concordance), **related words** (thesaurus), and **common mistakes** (a Chinese learner corpus). All of this data comes from [Sketch Engine](https://www.sketchengine.eu/).

The key architectural insight: **Sketch Engine credentials never reach the browser.** Classic calls Sketch Engine through a PHP proxy (`sketch-engine-proxy.php`) that injects the bearer token and caches responses. That proxy has now been **ported to the Flask backend** (`routes/sketch_engine.py`), and — more importantly — the **data parsing that Classic did in the client has moved server-side**, so the Next.js web app and React Native mobile app can consume ready-to-render JSON instead of raw Sketch Engine output.

```
┌──────────────┐   GET /sketch-engine/collocations?word=学习&l2=zh   ┌─────────────────────────┐
│  Web / Mobile │ ───────────────────────────────────────────────────▶ │ routes/sketch_engine.py │
│ (apps/web,    │        cleaned JSON (ready to render)              │   (Flask blueprint)      │
│  apps/mobile) │ ◀────────────────────────────────────────────────── │                         │
└──────────────┘                                                     └────────────┬────────────┘
                                                                                   │ _try_request_with_keys
                                                      Bearer key rotation          │ disk cache under cache/
                                                      ┌────────────────────────────▼─────────────────────────────┐
                                                      │ Sketch Engine APIs                                        │
                                                      │  • api.sketchengine.eu/bonito/run.cgi  (wsketch)          │
                                                      │  • app.sketchengine.eu/bonito/run.cgi  (thes, concordance) │
                                                      │  • app.sketchengine.eu/ca/api         (corpora)            │
                                                      └────────────────────────────────────────────────────────────┘
```

---

## 2. Context

### 2.1 How Classic consumed Sketch Engine (legacy reference)

Classic (`zerotohero-nuxt`) never talks to Sketch Engine directly. Every request goes through a PHP relay:

1. `lib/sketch-engine.js` builds the full Sketch Engine URL and appends it to the proxy as the query string:
   ```
   https://server.chinesezerotohero.com/sketch-engine-proxy.php?https://api.sketchengine.eu/bonito/run.cgi/wsketch?corpname=...&lemma=...
   ```
2. `zerotohero-php-server/sketch-engine-proxy.php` reads the query string, adds `Authorization: Bearer <key>` (rotating through multiple keys until one returns data), and forwards the request.
3. `lib/helper.php` (`Cache::get_contents`) caches the raw JSON response on disk keyed by `sha1(url + context)`.
4. **Parsing happened in the browser** — each Vue component (`Collocations.vue`, `Concordance.vue`, `EntryRelated.vue`, `Mistakes.vue`) reshaped the raw Sketch Engine JSON into display data.

### 2.2 Why the port

- Classic is being retired; web and mobile need the same features.
- Re-implementing the client-side parsers in both Next.js and React Native would duplicate logic and drift.
- Moving parsing to the server means **one parser, many clients**, and clients get smaller, cleaner payloads.

---

## 3. Endpoints

All routes live on the Flask blueprint `sketch_engine` (`zerotohero-python-server/routes/sketch_engine.py`), registered in `routes/__init__.py`.

| Method | Route | Classic source | Purpose |
|---|---|---|---|
| GET/POST | `/sketch-engine/proxy` | `sketch-engine-proxy.php` | Raw relay — forwards to any Sketch Engine Bonito URL in the query string |
| GET | `/sketch-engine/corpora` | `getCorpora()` (static file) | Corpus list from the CA API, cached ~monthly; `?refresh=1` forces re-download |
| GET | `/sketch-engine/collocations?word=&l2=` | `wsketch()` + `Collocations.vue` | Word sketch — collocates grouped by grammatical relation |
| GET | `/sketch-engine/examples?word=&l2=&l1=en` | `concordance()` + `Concordance.vue` | Example sentences with optional parallel translation (`&searchAsPhrase=1` supported) |
| GET | `/sketch-engine/thesaurus?word=&l2=` | `thesaurus()` + `EntryRelated.vue` | Related words, sorted by score |
| GET | `/sketch-engine/mistakes?word=` | `mistakes()` + `Mistakes.vue` | Common Chinese learner mistakes (fixed `guangwai` corpus) |

Every feature endpoint accepts an optional `corpname` override; otherwise the corpus is auto-resolved from `l2` (see §6).

---

## 4. Auth & Keys

- Keys are a `{username: apiKey}` map stored in `apikeys.json` (gitignored; `apikeys.example.json` is the template). The Flask port reads them from, in order:
  1. env var `SKETCH_ENGINE_KEYS` (JSON)
  2. `<python-root>/apikeys.json`
  3. `../zerotohero-php-server/apikeys.json` (dev fallback next to the PHP repo)
- Every upstream request sends `Authorization: Bearer <key>`.
- **Key rotation** (`_try_request_with_keys`): the server tries each key in order and returns the first non-empty body — mirroring the PHP proxy's rotation. This lets multiple Sketch Engine accounts share quota, and lets a broken/expired key fail over automatically.
- The response echoes which `username` served the request when it was fetched live (for usage attribution).
- **The Corpus Access (CA) API accepts the same Bearer key** — no browser `sessionid` cookie is needed server-side (the browser curl used a `sessionid` cookie, but that is not required for API-key auth).

---

## 5. Caching

Caching mirrors the PHP `Cache::get_contents` behavior:

| Aspect | Behavior |
|---|---|
| Key | `sha1(json({"url", "method", "data"}))` — the auth header is excluded, so different keys share one cache |
| Location | `cache/<sha1>` under the Python server root (gitignored) |
| Write rule | **only valid JSON is cached** — error/HTML bodies never poison the cache |
| TTL | default `-1` (cache forever), same as the PHP proxy; `cache_life` in seconds overridable |
| Corpora | `_CORPORA_CACHE_LIFE` = 30 days (env `SKETCH_ENGINE_CORPORA_CACHE_LIFE` to override), because the corpus list changes ~monthly |

The `from` field in responses is `"cache"` or `"live"` so callers can observe the cache behavior.

---

## 6. Corpus Selection

`_resolve_corpname(l2, corpname)` ports Classic's `corpname(l2)`:

1. Explicit `corpname` param wins.
2. Otherwise load the corpus list (cached 30 days) and match `language_id` by **exact code or `<code>-<region>` prefix** (e.g. `zh` matches `zh-Hans`, `zh-Hant`). Classic matches on the language's `locales` array + code; the server uses the prefix heuristic since it has no locale table.
3. Pick the **featured** corpus; fall back to the one with the most words (`sizes.wordcount`).
4. Preserve Classic's hardcoded overrides: `en → preloaded/ententen15_tt21`, `bg → preloaded/bgtenten12_tt2`.

> **Gotcha**: the corpus list's `language_id` values are locale strings (`zh-Hans`, `zh-Hant`), **not** bare codes (`zh`). Chinese clients decide simplified vs traditional from the chosen corpus name (`corpname` containing `trad`), exactly as Classic did.

---

## 7. Feature Parsing (server-side)

Each endpoint reshapes raw Sketch Engine JSON into clean, ready-to-render data. This is the portion that moved from the Vue components into Flask.

### 7.1 Collocations — `/sketch-engine/collocations`

Calls `wsketch` (`api.sketchengine.eu/bonito/run.cgi/wsketch?corpname=…&lemma=…`).

Cleaning (from Classic `wsketch()`):
- Drop words with an empty `cm` (collocation measure).
- Strip `-X ` POS-tag patterns from `cm` (Classic regex `/-\\w( ?)/gi`).

Response:
```json
{
  "word": "学习", "corpname": "preloaded/zhtenten21_simp_stf4", "from": "cache",
  "gramrels": [
    { "name": "Object", "description": "Object", "count": 3841774, "score": 49.96,
      "words": [ { "word": "知识", "cm": "学习 知识", "score": 9.75, "count": 155310 } ] }
  ]
}
```
`description` is `name` with `%w` → `{word}` (Classic's display label). Gramrel groups with no words are omitted.

### 7.2 Examples — `/sketch-engine/examples`

Calls `concordance` (`app.sketchengine.eu/bonito/run.cgi/concordance`). Ports Classic's exact request builders (`buildConcordanceQuery` / `buildConcordanceRequestJSON`):
- **Parallel mode** (corpus is aligned): `viewmode=align`, `pagesize=1000`, refs `=doc.subcorpus`, and the L1-aligned query selector (`opus2_<l1>`).
- **KWiC mode** (default): `viewmode=kwic`, `pagesize=50`.
- `searchAsPhrase=1` switches to the `phraserow` query.

Parsing (from Classic `processConcordanceResponseData`):
- Each line → `{ l2, l1?, ref }` where `l2` = left context + highlighted keyword + right context (space-joined tokens, punctuation spacing normalized), `l1` = parallel translation when aligned, `ref` = first reference.
- Lines shorter than `len(term) + 4` are dropped; results are sorted by `l2` length and **deduped by sentence**.

### 7.3 Thesaurus — `/sketch-engine/thesaurus`

Calls `thes` (`app.sketchengine.eu/bonito/run.cgi/thes`) with the same form fields as Classic (`lemma`, `lpos`, `clusteritems=0`, `maxthesitems=100`, `minthesscore=0`, `minsim=0.3`). Returns `related: [{word, score, freq}]` sorted by score descending.

### 7.4 Mistakes — `/sketch-engine/mistakes`

Calls `concordance` against the **hardcoded Chinese learner corpus `preloaded/guangwai`**, with structural-attribute filters on error type/level (`sca_err.level` ∈ col/form/mean/orth/punct; `sca_err.type` ∈ anom/incl/omit/wo) and 19 ordered refs (Classic `mistakeRefKeys`).

Per-line parsing (from Classic `mistakes()`):
- Split the sentence from surrounding context using `<s>` / `</s>` markers → `left`/`right` (the sentence) and `leftContext`/`rightContext`.
- `text` = `left + word + right`.
- Country code is extracted from the **5th `_`-segment of `=text.id`** (e.g. `S_I_F_ANA_RU_2` → `RU`) and resolved to `{code, name}` via `pycountry`.
- `proficiency` map: 初级/中级/高级 → beginner/intermediate/advanced.
- `errorType` / `errorLevel` via the errors map: `orth→orthography`, `punct→punctuation`, `mean→word choice`, `form→form`, `col→collocation`, `wo→word order`, `incl→inclusion of extra word(s)`, `anom→anomaly`, `omit→omission of word(s)`.
- `l1` = learner's native language from the refs.

---

## 8. Key Files

| File | Role |
|---|---|
| `zerotohero-nuxt/lib/sketch-engine.js` | Classic client module — the behavior being ported (reference only) |
| `zerotohero-nuxt/components/{Collocations,Concordance,EntryRelated,Mistakes,CorpusSelect}.vue` | Classic consumers (reference only) |
| `zerotohero-php-server/sketch-engine-proxy.php` | Original PHP relay (reference only) |
| `zerotohero-php-server/lib/helper.php` | Original PHP cache helper (reference only) |
| `zerotohero-python-server/routes/sketch_engine.py` | **Active** — Flask proxy + corpora + four feature endpoints |
| `zerotohero-python-server/routes/__init__.py` | Blueprint registration |

---

## 9. Notes & Gotchas

- **`punct` typo fixed**: Classic's errors map says `"puncutation"`; the port uses `"punctuation"`.
- **Null token strings**: Sketch Engine occasionally returns `null` for a token's `str`; Python's `" ".join()` rejects `None`, so tokens coerce to `""` (JS `Array.join` treats `null`/`undefined` as empty).
- **`wordcount` is nested**: the CA corpus list stores word counts under `sizes.wordcount`, not top-level — Classic's `sort((a,b) => b['wordcount'] - a['wordcount'])` was effectively comparing `undefined`. The port reads `sizes.wordcount`.
- **Fresh list size**: the live CA API returns 1016 corpora; Classic's static file (`sketch-engine-corpora.json.txt`) has 546 and is a stale snapshot from an account with different access — no simple filter reproduces it, so the endpoint returns the authoritative fresh list.
- **Cache-forever for feature data**: feature endpoints use the default `cache_life=-1` (like the PHP proxy) — collocations/examples/thesaurus/mistakes change slowly and are safe to cache indefinitely.
