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

This spec is a manual QA checklist for the local tokenizers. It is intentionally a **spot-check**, not an exhaustive per-language pass: one representative language per tokenizer family, plus cross-cutting checks that every path must satisfy (space recovery, phonetics rendering, batch reader fallback, online/offline parity). Every language on the data-driven popular L2 list (ADR-0030) now has at least one spot-check — see the [coverage map](#popular-l2-coverage) below.

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

### Popular L2 coverage

| `POPULAR_L2S` | Test case |
|---|---|
| `zh` | TC-03 / TC-04 |
| `en` | TC-14 |
| `ja` | TC-01 |
| `ko` | TC-02 |
| `fr` | TC-16 |
| `de` | TC-15 |
| `es` | TC-13 |
| `vi` | TC-22 |
| `ru` | TC-06 |
| `ar` | TC-11 |
| `tr` | TC-20 |
| `it` | TC-17 |
| `hi` | TC-23 |
| `yue` | TC-05 |
| `th` | TC-12 |
| `id` | TC-21 |
| `nl` | TC-19 |
| `he` | TC-24 |
| `pt` | TC-18 |

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

### TC-07 — Greek (char map + Simplemma lemma table) ✅ PASS (2026-08-08)

- **Sample**: `Καλημέρα, πώς είσαι;`
- **Verify**: Ruby = `Kalimera, pos eisai;`.
- **Pass**: Accent-stripped ISO-843-style output, byte-identical to online.
- **Offline lemmas**: Greek uses the Simplemma-generated lemma table
  (`/lemmatization/export?l2=el`, SPEC-018) — spot-check
  `γεννήθηκε→γεννάω`, `σπουδές→σπουδή`, `υπήρξαν→υπάρχω`,
  `το/της/η/Η→ο`, `άνεμο→άνεμος` with Offline Mode on; without the table
  downloaded, surface-as-lemma is expected.
- **Verified 2026-08-08**: romanization byte-identical online vs offline;
  offline lemmas match Simplemma (`γεννήθηκε→γεννάω`, `σπουδές→σπουδή`,
  `υπήρξαν→υπάρχω`, `το/της/η/Η→ο`); spaces render correctly between words in
  ruby mode (whitespace gap tokens get explicit width — regression fixed
  2026-08-08); punctuation splits from words (`αιώνα,` → `αιώνα` + `,`,
  Unicode-aware tokenizer); popup no longer returns substring garbage
  (`σι` inside `Γκράτσια` — substring fallback gated to dict-segmentation
  languages).

### TC-08 — Armenian (char map) ⚠️ WARNING

- **Sample**: `Բարև ձեզ։ Հայերեն լեզու`
- **Verify**: Ruby = `Barev jez։ Hayeren lezow`.
- **Pass**: Matches online exactly, including `ow` and the untouched `։`.

> **Warning (2026-08-08)**: romanization is pass, but offline **lemmatization
> is not parity**. Offline Armenian uses the snowball stemmer, producing stems
> that never match the server's Simplemma lemmas (`որքան→որ`,
> `ամյակին→ամ`, `ուզում→ուզ` vs web `որքան→որքան`, `100-ամյակին→100-ամյակ`,
> `ուզում→ուզել`) and can open wrong dictionary cards (tapping `ամյակին`
> shows the `ամ` entry). A Simplemma-generated table (the Greek pattern) is
> not viable here: wordfreq has no Armenian frequencies (it silently falls
> back to Russian), and Simplemma's hy dictionary is sparse for common forms.
> Snowball stems offline are expected — do not treat as a pass.

### TC-09 — Georgian (char map + Simplemma table) ✅ PASS (2026-08-08)

- **Sample**: `გამარჯობა, როგორ ხარ?`
- **Verify**: Ruby = `gamarjoba, rogor khar?`.
- **Pass**: Matches online exactly, including apostrophes (`k'artuli`-style) if present.
- **Verified 2026-08-08**: offline lemmas match web — both surface-as-lemma
  for the sample (`ვეფხისტყაოსანი`, `დასაწყისი`, `შექმნა`, `რომელმან`,
  `ძალითა`, `არსნი`, `ჩვენ`); romanization byte-identical; the offline table
  is now served from Simplemma (ADR-0029) and maps `არის→არე` like the
  server. Dictionary cards return the same ids/heads as web for entries that
  exist offline. LLM-generated entries (`ka-…`) are online-only, and the
  server-fuzzy `ტყვნა` hit is not shown offline (exact-only) — both expected.

### TC-10 — Bulgarian / Ukrainian (char maps) ✅ PASS (2026-08-08)

- **Sample**: bg `Щъркелът лети` · uk `Привіт, як справи?`
- **Verify**: Ruby = `Shtarkelat leti` / `Privit, yak spravi?`.
- **Pass**: Bulgarian щ → `sht`, ъ → `a`; Ukrainian і/ї/ґ handled; matches online.
- **Verified 2026-08-08**: Bulgarian offline lemmatization parity — the
  offline table now comes from the server's Simplemma engine (ADR-0029) and
  matches web for the spot forms (`роден→роден`, `Родното→роден`, `му→то`,
  `знае→знам`, `е→съм`, `казва→казвам`, `години→година`). Residual gaps:
  `Той` (case — Simplemma dict lacks `той`) and `запитат` (affix-rule
  lemmatization a static table can't express). Mobile popups still merge
  surface-form entries (`е` shows съм + е cards) — cosmetic; web is
  lemma-only. Ukrainian char map unchanged.

### TC-11 — Arabic (arabic-stem) ⚠️ WARNING

- **Sample**: `العربية لغة غنية وجميلة.`
- **Steps**: Offline Mode on.
- **Verify**: Tokens clickable; lemmas stemmed.
- **Pass**: No crash; lemmas stemmed.

> **Warning (2026-08-08)**: offline Arabic lemmatization is **not at parity
> with web**. Web/server Qalsadi is mostly correct but has known bugs
> (`كتبتها→تب`, `أعني→أعنة`, `تقرأ→أقرأ`); offline `arabic-stem` mangles
> pronouns and conjunctions (`أنا→اني`, `هنا→هني`, `وكيف→وكف`) and resolves
> most inflected words to roots instead of dictionary forms (`صديقي→صدق`,
> `مرحبًا→رحب`). Pronunciation: web = Mishkal-vocalized SAMPA; offline =
> SAMPA char-map transliteration (readable Latin, no added vowels). Do not
> treat offline lemma parity as pass (tracked in ROADMAP Known Issues).

- **Pronunciation (2026-08-08)**: offline ruby now shows a **Latin SAMPA-style
  transliteration** (port of the server's `pyarabic` Arabic→SAMPA char map:
  `مرحبًا → mrxbana:`, `الإنسان → a:l?nsa:n`, `أنا → ?na:`) instead of the
  arabic-stem Arabic-script string. Still not byte-identical to the server
  for words lacking diacritics (server vocalizes with Mishkal first) —
  expected. RTL ruby rendering fixed on both platforms: mobile ruby rows use
  `direction: rtl`, and web `<rt>` annotations are forced LTR so Latin/SAMPA
  readings don't get bidi-scrambled.

### TC-12 — Thai (dict-seg) ✅ PASS

- **Sample**: `ฉันรักภาษาไทย`
- **Verify**: Segmentation into clickable words; ruby shows tone-marked
  Paiboon+ romanization (`ภาษาไทย → paa-sǎa-tai`) on web and offline mobile.
- **Pass**: No crash, no hang.
- **Pass (2026-08-08)**: server now segments with PyThaiNLP `newmm` and
  pronounces with `thaiphon` Paiboon+ (`thai_g2p.py`). Offline mobile gets the
  same reading from the re-downloaded dictionary's `pronunciation` column
  (server-generated), and Wiktionary labels like `bound form,` /
  `wiki.local` are stripped. Thai spacing marks stay attached to their
  consonant so ruby mode doesn't disjoin glyphs. The first Thai sample book
  is OCR-broken (a space between every glyph — identical in iBooks) and is
  not a tokenizer regression. Existing installs must re-download the Thai
  offline dictionary to pick up the Paiboon+ column; the update button now
  also clears in-memory/WebView tokenizer caches so the new readings apply
  without an app restart.

### TC-13 — Generic fallback (e.g. Spanish)

- **Sample**: `Los estudiantes estudian todos los días.`
- **Verify**: `📝 REGEX-SPLIT` + snowball/lemma table; no pronunciation shown (Latin script).
- **Pass**: Every word clickable; spaces/punctuation intact; lemma-table hits where downloaded.

### TC-14 — English (lemma table + snowball)

- **Sample**: `The quick brown fox jumps over the lazy dog.` (plus spot forms below)
- **Steps**: Offline Mode on; open an English book or paste into the reader.
- **Verify**: `🏷️ LOCAL-DONE` with `table=…` hits; irregular forms resolve to dictionary forms: `went → go`, `better → good`, `children → child`.
- **Pass**: No ruby row (Latin script); words clickable; spaces/punctuation intact; table hits match online.

### TC-15 — German (lemma table + snowball)

- **Sample**: `Ich habe gestern ein Buch gelesen und bin nach Hause gegangen.`
- **Verify**: `🏷️ LOCAL-DONE` table hits: `gelesen → lesen`, `gegangen → gehen`, `besser → gut`.
- **Pass**: No ruby row; words clickable; text reconstructs exactly; table hits match online.

### TC-16 — French (lemma table + snowball)

- **Sample**: `Je suis allé au marché et j'ai acheté du pain.`
- **Verify**: `🏷️ LOCAL-DONE` table hits: `suis → être`, `allé → aller`, `acheté → acheter`.
- **Pass**: No ruby row; words clickable; apostrophes and punctuation intact; table hits match online.

### TC-17 — Italian (lemma table + snowball)

- **Sample**: `Ieri sono andato al mercato e ho comprato il pane.`
- **Verify**: `🏷️ LOCAL-DONE` table hits: `sono → essere`, `andato → andare`, `comprato → comprare`.
- **Pass**: No ruby row; words clickable; text reconstructs exactly; table hits match online.

### TC-18 — Portuguese (lemma table + snowball)

- **Sample**: `Ontem fui ao mercado e comprei pão.`
- **Verify**: `🏷️ LOCAL-DONE` table hits: `fui → ir`, `comprei → comprar`.
- **Pass**: No ruby row; words clickable; accents/punctuation intact; table hits match online.

### TC-19 — Dutch (lemma table + snowball)

- **Sample**: `Ik ben gisteren naar de markt geweest en heb brood gekocht.`
- **Verify**: `🏷️ LOCAL-DONE` table hits: `ben → zijn`, `geweest → zijn`, `gekocht → kopen`.
- **Pass**: No ruby row; words clickable; text reconstructs exactly; table hits match online.

### TC-20 — Turkish (snowball only)

- **Sample**: `Dün okula gittim ve ekmek aldım.`
- **Verify**: `🏷️ LOCAL-DONE` snowball hits (e.g. `gittim → git`, `aldım → al`).
- **Pass**: No crash; words clickable; no ruby row. Snowball stems are stems, not dictionary lemmas — Turkish ships **no** offline lemma table (the server uses Zeyrek, which has no static export), so stem-vs-lemma mismatch is expected.

### TC-21 — Indonesian (lemma table only)

- **Sample**: `Kemarin saya pergi ke pasar dan membeli roti.`
- **Verify**: `🏷️ LOCAL-DONE` table hits where downloaded (e.g. `membeli → beli`); no ruby row.
- **Pass**: No crash; words clickable; text reconstructs exactly. Indonesian is analytic — surface-as-lemma is acceptable when a table hit is missing.

### TC-22 — Vietnamese (regex split + surface)

- **Sample**: `Tôi đang học tiếng Việt mỗi ngày.`
- **Verify**: `📝 REGEX-SPLIT`; words clickable; no ruby row (Latin script with tone marks).
- **Pass**: No crash; spaces/punctuation intact. Compounds may split at syllable boundaries — acceptable per ARCH-018 (surface = lemma; pyvi-style joining is a nice-to-have).

### TC-23 — Hindi (regex split + surface)

- **Sample**: `मैं हिंदी सीख रहा हूँ।`
- **Verify**: `📝 REGEX-SPLIT`; words clickable; offline surface-as-lemma.
- **Pass**: No crash; text reconstructs exactly; no ruby row offline (no Devanagari char map). Online/offline lemma parity is expected to differ — server fallback is better, and this is a known gap, not a pass failure.

### TC-24 — Hebrew (regex split + surface)

- **Sample**: `אני לומד עברית כל יום.`
- **Verify**: `📝 REGEX-SPLIT`; RTL rendering; words clickable; offline surface-as-lemma.
- **Pass**: No crash; RTL text renders without bidi scrambling; no ruby row offline; tokens reconstruct text exactly.

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

Full popular-L2 coverage (every language in `POPULAR_L2S`, ADR-0030) requires **TC-01 … TC-24**.

## Automated Tests

These run in CI / `npm test` and should pass before manual QA:

- `apps/mobile/lib/romanize.test.ts` — mobile romanization parity corpus (vitest).
- `zerotohero-python-server/test_romanize.py` — server romanization parity corpus (pytest; requires `koroman==1.0.16`).
- Mobile typecheck: `cd apps/mobile && ./node_modules/.bin/tsc --noEmit`.

## Known Gaps

- **Arabic / Persian** — server engines (Mishkal + Araby SAMPA, PersianG2p) are Python-only; no portable JS G2P. Offline Arabic pronunciation is the `arabic-stem` normalized string.
- **Yue** — pinyin/jyutping dictionary columns exist (`cccanto`) but the WebView dict worker is zh-only for now.
- **Russian** — offline lemmas come from a generated wordfreq+pymorphy2 table (~500k surfaces; SPEC-018 Phase 2a). No JS library matched pymorphy2 quality, so the table is required: without it, snowball stems appear (`начал→нача`, `остановиться→останов`). Pre-reform orthography (`Въ`, `отпускъ`, `ѣ`/`і`) is not covered by any modern lemmatizer — surface-as-lemma is expected and matches the server.
- **Armenian** — offline lemmatization uses the snowball stemmer and does not match server Simplemma (`որքան→որ`, `ամյակին→ամ`, `ուզում→ուզ` vs web `որքան→որքան`, `100-ամյակին→100-ամյակ`, `ուզում→ուզել`), which can surface wrong dictionary cards. A generated Simplemma table is not viable (no wordfreq `hy` frequencies — falls back to Russian — and sparse hy dictionary), so snowball stems offline are expected (TC-08 warning).
- **Arabic** — web/server Qalsadi has known lemma bugs (`كتبتها→تب`, `أعني→أعنة`, `تقرأ→أقرأ`); offline `arabic-stem` is not at parity (pronouns mangled `أنا→اني`, `هنا→هني`; conjunction `وكيف→وكف`; roots instead of headwords `صديقي→صدق`). Pronunciation: web = vocalized SAMPA; offline = SAMPA char-map transliteration without Mishkal vowels (TC-11 warning).
- **Thai** — resolved 2026-08-08: server uses PyThaiNLP `newmm` +
  `thaiphon` Paiboon+; offline ruby comes from the server-generated
  pronunciation column in the downloaded dictionary. Tokens outside the
  downloaded dictionary have no ruby offline (no RN G2P engine port).
  Dictionary rows that pre-date the fix still show IPA until re-downloaded.
