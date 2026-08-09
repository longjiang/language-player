# SPEC-055 — Local Tokenizer Testing Checklist (Spot-Check)

## Metadata

- **Spec ID**: SPEC-055
- **Feature**: Manual spot-check testing instructions for the mobile local tokenizers (offline tokenization + pronunciation/romanization parity)
- **Status**: draft — checklist for manual QA in the iOS simulator; automated parity tests exist for romanization (see [Automated Tests](#automated-tests))
- **Created**: 2026-08-08
- **Scope**: `apps/mobile` offline tokenization paths (`tokenizer.ts`, `tokenizer-worker.ts`, `romanize.ts`) + server Korean romanization (`koroman`)
- **Related specs**: [SPEC-018 — Mobile Local Tokenization](018-local-tokenization-mobile.md) · [SPEC-053 — Mobile Offline Mode](053-mobile-offline-mode.md) · [SPEC-022 — Tokenizer Auto-Download UI](022-tokenizer-auto-download-ui.md)
- **Related architecture**: [ARCH-018 — Local Tokenization Strategy](../arch/018-local-tokenization-strategy.md) · [ARCH-016 — Server Tokenization Pipeline](../arch/016-server-tokenization.md)

---

## Overview

This spec is a manual QA checklist for the local tokenizers. It is intentionally a **spot-check**, not an exhaustive per-language pass: one representative language per tokenizer family, plus cross-cutting checks that every path must satisfy (space recovery, phonetics rendering, batch reader fallback, online/offline parity).

The local tokenizer families covered:

1. **kuromoji (ja)** — WebView worker first, main-thread fallback
2. **kuromoji-ko (ko)** — main-thread, with `koroman` romanization
3. **Dict-based segmentation (zh/yue/SEA)** — WebView dict worker first, main-thread max-match fallback
4. **Lemma table / snowball / surface (ru, bg, uk, el, hy, ka, …)** — with char-map romanization
5. **arabic-stem (ar)** — segmentation + stemming only (pronunciation is a known gap)
6. **Regex split (~160 fallback languages)** — always available

## Setup

1. Start Metro: `cd apps/mobile && nvm use 22 && npx expo start --ios`; reload with `r` (never `--clear` unless proven necessary).
2. Settings → Network → toggle **Offline Mode**:
   - **On** — forces every tokenization through the local fallback chain.
   - **Off** — server-first path; used for online/offline parity comparisons.
3. Ensure the language data packs are downloaded (Settings/bookshelf auto-download per SPEC-022): Japanese IPADIC (~3 MB), Korean mecab-ko-dic (~2 MB), Chinese dictionary (cedict).
4. In Metro, filter for `[LP Mobile]` and watch `[lemmatize]`, `[TokenizedText]`, `[Reader]`, and `[tokenizer-worker]` lines.

## Log Vocabulary

| Log line | Meaning |
|---|---|
| `🚀 DISPATCH l2=…` | `lemmatizeText()` called for a block |
| `🚫 OFFLINE-MODE … → local fallback` | Offline gate skipped the server; local path taken |
| `🤖 WEBVIEW-WORKER / WEBVIEW-DICT-WORKER` | WebView worker attempted first (ja / dict-seg) |
| `✅ WEBVIEW-WORKER OK / ✅ WEBVIEW-DICT-WORKER OK tokens=N` | Worker path succeeded |
| `⚠️ … UNAVAIL … → main-thread …` | Worker unavailable; fallback engine used |
| `🤖 KUPOMOJI / KO-TOKENIZE` | kuromoji / kuromoji-ko on the RN thread |
| `📖 DICT-SEG l2=… words=N` | Dictionary max-match segmentation ran |
| `🏷️ LOCAL-DONE l2=…` | Lemma-table/snowball/surface chain finished |
| `📥 PRELOADED l2=…` | TokenizedText consumed preloaded tokens |
| `📦 BATCH REQ / BATCH FAIL` | Reader batch endpoint request / fallback |

## Spot-Check Test Cases

### TC-01 — Japanese (kuromoji) ✅ PASS (2026-08-08)

- **Sample**: `銃撃戦、と天吾は思った。そんな話を耳にした覚えがある。`
- **Steps**: Offline Mode on; open a Japanese book containing the sample.
- **Verify**:
  - Worker path first: `🤖 WEBVIEW-WORKER` → `✅ WEBVIEW-WORKER OK`.
  - Tap 思った → dictionary popup lemma 思う.
  - 耳 shows katakana ruby (ミミ).
  - 銃撃戦 stays one token.
- **Pass**: No spaces inserted between Japanese tokens — including in ruby mode, where tokens must render flush with no phantom gaps (regression: per-token `mx-px` margins removed 2026-08-08); punctuation (、。…) not clickable; ruby is katakana, not romaji, and sits close to the base text with no large vertical gap (regression: furigana gap trim 2026-08-08); tapping anywhere on a kanji+kana word (including its furigana) opens the popup for the whole token, with a dimming press feedback (regression: one `Pressable` per token added 2026-08-08, pressed-state opacity 0.45).
- **Verified 2026-08-08**: flush ruby rendering (no phantom gaps), close furigana, whole-token press with dim feedback, katakana readings, and non-clickable punctuation all confirmed in simulator.

### TC-02 — Korean (kuromoji-ko + koroman) ✅ PASS (2026-08-08)

- **Sample**: `좋아합니다. 저는 어제 김밥을 먹었습니다.`
- **Steps**: Offline Mode on; open a Korean book or paste into the reader.
- **Verify**:
  - `🤖 KO-TOKENIZE` → `✅ KUPOMOJI OK`.
  - Ruby shows romanization: **joahamnida** (NOT `jotahapnida`).
  - 먹었습니다 → lemma 먹다; honorific suppletive 드시 → 들다 when present.
  - Spaces preserved.
- **Pass**: Romanization matches server koroman output; no crash; text reconstructs exactly.
- **Verified 2026-08-08**: romanization shows as Latin koroman ruby (e.g. `joahamnida`, `na`, `geureon`) with `pronEqWord=0` / `rubyShown>0` in debug logs; dictionary-form lemmas via `ExpressionToken.lemma` (`읽→읽다`, `아프→아프다`, suppletive `드시→들다`); spaces preserved.

### TC-03 — Chinese (dict worker) ✅ PASS (2026-08-08)

- **Sample**: `围在城里的人想逃出来，城外的人想冲进去。`
- **Steps**: Offline Mode on; open 围城 or any zh book.
- **Verify**:
  - `🤖 WEBVIEW-DICT-WORKER` → `✅ … OK`.
  - Ruby shows tone-marked pinyin.
  - 围城 segments as one word; punctuation non-clickable.
- **Pass**: Pinyin above words (nǐ hǎo style), no spaces between Han chars, tokens reconstruct text exactly.
- **Verified 2026-08-08**: worker path `✅ WEBVIEW-DICT-WORKER OK`; pinyin ruby; no phantom spaces; **bidirectional script conversion** — a traditional-script EPUB (笑傲江湖) renders simplified with `display.traditional=false`, and simplified source renders traditional when the preference is on (ADR-0019).

### TC-04 — Chinese main-thread fallback

- **Sample**: same as TC-03.
- **Steps**: whenever the worker logs `⚠️ WEBVIEW-DICT-WORKER UNAVAIL`.
- **Verify**: `📖 DICT-SEG` + `🏷️ LOCAL-DONE`; segmentation still correct (not char-by-char).
- **Pass**: No crash; pinyin may be absent on this path — expected.

### TC-05 — Yue (dict-seg only) ✅ PASS (2026-08-08)

- **Sample**: `你好嗎？我很好。`
- **Steps**: Offline Mode on; any yue content.
- **Verify**: `📖 DICT-SEG` or worker attempt; words clickable.
- **Pass**: No crash; words clickable; punctuation not clickable; tokens reconstruct text exactly.
- **Verified 2026-08-08**: dictionary max-match segmentation (WebView dict worker or main-thread); **server tokens carry jyutping** via full cccanto match or sub-segment polyfill (e.g. `動物學 → dung6 mat6 hok6`); dictionary entries from cc-canto and the popup now show **jyutping** (`呢個 → [ni1 go3]`) after the shared `formatPronunciation` fix — Mandarin pinyin is no longer shown for Cantonese. Remaining gap (tracked, Phase D parity): offline main-thread dict-seg tokens still lack token-level jyutping.

### TC-06 — Russian (lemma table + romanization) ⚠️ WARNING

> **Warning (2026-08-08)**: offline Russian lemma parity depends on the
> pymorphy2-generated lemma table — no JS library matched pymorphy2 quality
> (see [SPEC-018 Phase 2a](018-local-tokenization-mobile.md#russian--generated-pymorphy2-table-research-2026-08-08)).
> Without the table downloaded, inflected forms fall back to snowball stems
> (`начал→нача`, `его→ег`, `собой→соб`, `остановиться→останов`) — expected
> only when the pack is missing, not a pass. Pre-reform orthography (`Въ`,
> `отпускъ`) is a known limitation and returns surface-as-lemma both online
> and offline.

- **Sample**: `Привет, как дела? Я читаю книгу.` (plus the spot forms below)
- **Steps**: Offline Mode on; then repeat with Offline Mode off.
- **Verify**:
  - `🏷️ LOCAL-DONE` with `table=…` hits.
  - Ruby shows `Privet, kak dela? Ya chitayu knigu.`-style romanization.
  - Inflected form resolves to lemma (читаю → читать).
  - Table hits match server pymorphy2: начал → начать, года → год,
    вернулся → вернуться, его → он, собой → себя,
    остановиться → остановиться (self-row — must NOT become `останов`).
- **Pass**: Romanization identical online vs offline for the same text;
  lemma table hits match pymorphy2 server output for the spot forms;
  self-lemma dictionary forms do not fall through to snowball.

### TC-07 — Greek (char map)

- **Sample**: `Καλημέρα, πώς είσαι;`
- **Verify**: Ruby = `Kalimera, pos eisai;`.
- **Pass**: Accent-stripped ISO-843-style output, byte-identical to online.

### TC-08 — Armenian (char map)

- **Sample**: `Բարև ձեզ։ Հայերեն լեզու`
- **Verify**: Ruby = `Barev jez։ Hayeren lezow`.
- **Pass**: Matches online exactly, including `ow` and the untouched `։`.

### TC-09 — Georgian (char map)

- **Sample**: `გამარჯობა, როგორ ხარ?`
- **Verify**: Ruby = `gamarjoba, rogor khar?`.
- **Pass**: Matches online exactly, including apostrophes (`k'artuli`-style) if present.

### TC-10 — Bulgarian / Ukrainian (char maps)

- **Sample**: bg `Щъркелът лети` · uk `Привіт, як справи?`
- **Verify**: Ruby = `Shtarkelat leti` / `Privit, yak spravi?`.
- **Pass**: Bulgarian щ → `sht`, ъ → `a`; Ukrainian і/ї/ґ handled; matches online.

### TC-11 — Arabic (arabic-stem)

- **Sample**: `العربية لغة غنية وجميلة.`
- **Steps**: Offline Mode on.
- **Verify**: Tokens clickable; lemmas stemmed.
- **Pass**: No crash. **Known gap**: pronunciation shows an Arabic-script normalized string, not SAMPA — do not treat as a regression (SPEC-018 Phase 4d).

### TC-12 — Thai (dict-seg)

- **Sample**: `ฉันรักภาษาไทย`
- **Verify**: Segmentation into clickable words; no ruby.
- **Pass**: No crash, no hang; pronunciation absent is expected.

### TC-13 — Generic fallback (e.g. Spanish)

- **Sample**: `Los estudiantes estudian todos los días.`
- **Verify**: `📝 REGEX-SPLIT` + snowball/lemma table; no pronunciation shown (Latin script).
- **Pass**: Every word clickable; spaces/punctuation intact; lemma-table hits where downloaded.

## Cross-Cutting Checks

| ID | Check | How | Pass criteria |
|---|---|---|---|
| CC-01 | **Space recovery** | Open a multi-line paragraph; copy rendered text (test both plain and ruby render paths) | Tokens reconstruct the original exactly: no doubled/missing spaces, newlines preserved, trailing whitespace kept; ruby mode adds no visual gaps between adjacent tokens |
| CC-02 | **Phonetics modes** | Settings → Display → Phonetics: Above / Replace / Off | Above = ruby row; Replace = only romanization; Off = nothing; toggles apply without reload |
| CC-03 | **Hard-words-only** | Set a proficiency level; mixed paragraph | Only over-level words get ruby; easy words stay bare |
| CC-04 | **Batch reader fallback** | Open an EPUB; scroll several chapters with Offline Mode on | `👁 lazy tokenization window` grows; `📦 BATCH REQ` → `🚫 OFFLINE-MODE … per-block`; no freeze on long chapters |
| CC-05 | **Online/offline parity** | Same sentence, Offline Mode off then on (ja, ko, zh, ru) | Lemmas identical; ko/ru/el/hy/ka pronunciations identical; ja reading identical |
| CC-06 | **Cache warm-up** | Reload app; open a previously read book | `💾 CACHE HIT` lines; first paint fast; no full-page re-tokenization |

## Quick Pass Bar

A clean spot-check round requires **TC-01, TC-02, TC-03, TC-06, TC-09** (one per engine family) plus **CC-01** and **CC-05**. That covers every pipeline stage — worker, kuromoji, dict-seg, lemma table, romanization — without testing all 60+ languages.

## Automated Tests

These run in CI / `npm test` and should pass before manual QA:

- `apps/mobile/lib/romanize.test.ts` — mobile romanization parity corpus (vitest).
- `zerotohero-python-server/test_romanize.py` — server romanization parity corpus (pytest; requires `koroman==1.0.16`).
- Mobile typecheck: `cd apps/mobile && ./node_modules/.bin/tsc --noEmit`.

## Known Gaps

- **Arabic / Persian** — server engines (Mishkal + Araby SAMPA, PersianG2p) are Python-only; no portable JS G2P. Offline Arabic pronunciation is the `arabic-stem` normalized string.
- **Thai** — no RN-portable romanizer (Node binary / WASM only); server has none either.
- **Yue** — pinyin/jyutping dictionary columns exist (`cccanto`) but the WebView dict worker is zh-only for now.
- **Russian** — offline lemmas come from a generated wordfreq+pymorphy2 table (~500k surfaces; SPEC-018 Phase 2a). No JS library matched pymorphy2 quality, so the table is required: without it, snowball stems appear (`начал→нача`, `остановиться→останов`). Pre-reform orthography (`Въ`, `отпускъ`, `ѣ`/`і`) is not covered by any modern lemmatizer — surface-as-lemma is expected and matches the server.
