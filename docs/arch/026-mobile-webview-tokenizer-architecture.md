# Mobile WebView Tokenizer Architecture

## Metadata
- **Arch ID**: ARCH-026
- **Feature**: Hidden WebView tokenizer — kuromoji (ja) and dict-based segmentation (Chinese/SEA) off the RN JS thread
- **Type**: as-built
- **Status**: accepted
- **Created**: 2026-08-11
- **Last Updated**: 2026-08-11
- **Scope**: Mobile app (`apps/mobile`)
- **See also**:
  - [ARCH-018 — Local Tokenization Strategy](018-local-tokenization-strategy.md)
  - [SPEC-018 — Mobile Local Tokenization & Lemmatization](../specs/018-local-tokenization-mobile.md)
  - `apps/mobile/components/TokenizationWorkerHost.tsx` — host component
  - `apps/mobile/lib/tokenizer-worker.ts` — RN↔WebView bridge + page harness
  - `apps/mobile/lib/tokenizer.ts` — `lemmatizeText()` integration
  - `apps/mobile/lib/tokenizer-db.ts` — on-device kuromoji data packs
  - `apps/mobile/lib/japanese-lemma.ts` — lemma cleanup shared with the server
  - `apps/mobile/assets/kuromoji/kuromoji.html` — vendored kuromoji browser build
  - `apps/mobile/app/_layout.tsx` — host mount point

---

## Overview

The mobile app keeps a persistent, invisible WebView mounted from app launch to run the two heaviest local tokenizers outside the React Native JS thread:

1. **kuromoji (Japanese)** — the official browser UMD build loads in a `<script>` tag, the on-device IPADIC data pack is streamed into the page in base64 chunks, and `kuromoji.builder({ dicPath }).build()` creates the tokenizer inside the WebView.
2. **Dict-based segmentation (Chinese + SEA languages)** — the offline dictionary headword set (plus pinyin and optional POS) is serialized and streamed into the same page; forward-maximum matching runs there.

`lemmatizeText()` prefers these WebView paths whenever they are ready, and falls back to the main-thread tokenizers (kuromoji loader / `maxMatchSegment`) when they are not.

**Naming note.** The codebase calls this the "tokenizer worker", but it is **not** a `Worker` object. Kuromoji and the segmentation algorithm execute on the WebView **page's main thread**. WKWebView / Android WebView run their JS in a separate process from the RN Hermes thread, which is what keeps tokenization from freezing scrolling; the "worker" naming refers to that separation, not to the Web Workers API.

---

## Context

### Why a WebView at all

The main-thread Japanese path (`lib/kuromoji-loader.ts`) deep-imports `kuromoji/src/dict/DynamicDictionaries` and `kuromoji/src/Tokenizer`, reads 12 `.dat.gz` files from the device, decompresses them with `pako`, and builds the double-array trie — all on the RN JS thread. The first reader page therefore paid a multi-second, UI-blocking initialization cost. The kuromoji npm package is also unmaintained and its deep imports are fragile under Metro.

The same package ships a self-contained browser UMD build that only needs a `<script>` tag, `XMLHttpRequest`, and a `dicPath` — which made a hidden WebView an attractive host. The on-device data pack is already downloaded by `lib/tokenizer-db.ts`, so the WebView can run **fully offline**: no network requests, no server round-trips.

### Iteration history

| Step | What changed |
|---|---|
| Round-trip probe | Invisible WebView + Web Worker reversing a message (the original spike). |
| Script-tag kuromoji | Page loads `build/kuromoji.js` in a `<script>` tag and builds the tokenizer in-page from streamed chunks. |
| Off-screen fix | WebView's built-in outer container has `flex: 1`; sizing the inner view alone left a black half-screen. The host now uses a 0×0 absolute wrapper + `containerStyle`. |
| Inline HTML module | A `.html` asset (`assets/kuromoji/kuromoji.html`) is read as raw text and inlined into `source={{ html }}` — `file://` assets do not execute scripts in Expo Go. |
| Boot ping + paced injection | The page posts a `kuromoji` existence message immediately; large injections are serialized with a bridge drain between them (WKWebView drops concurrent `evaluateJavaScript` calls). |
| Dict-seg extension | Same WebView hosts Chinese/SEA headword sets with ack-based chunk streaming (`__lpAppendDict` → `dict_chunk` acks → resend missing). |
| POS parity | Page token replies carry `pos`; the bridge maps it to `part_of_speech`; dict datasets optionally carry per-head POS. |

---

## Component Map

| File | Responsibility |
|---|---|
| `apps/mobile/app/_layout.tsx` | Mounts `<TokenizationWorkerHost />` once, at app launch, inside the provider tree. |
| `apps/mobile/components/TokenizationWorkerHost.tsx` | Reads the kuromoji asset, builds the page HTML, renders the hidden WebView, and forwards load/message/error events to the bridge. |
| `apps/mobile/lib/tokenizer-worker.ts` | Singleton bridge: warm logic, injection queue, message routing, pending-request map, timeout handling, token mapping, and the page HTML builder. |
| `apps/mobile/lib/tokenizer.ts` | Calls `tokenizeJapaneseInWorker()` / `tokenizeDictSegInWorker()` first in the local fallback chain. |
| `apps/mobile/lib/tokenizer-db.ts` | Owns the 12-file kuromoji data pack (`tokenizers/{l2}/`) and `hasKuromojiData()` / `getKuromojiDataPath()`. |
| `apps/mobile/assets/kuromoji/kuromoji.html` | Vendored kuromoji browser build (~300 KB), bundled as a raw text asset. |

---

## Architecture / Data Flow

```
┌────────────────────────────── RN JS thread ──────────────────────────────┐
│  tokenizer.ts (lemmatizeText → runLocalFallbackRaw)                      │
│       │  tokenizeJapaneseInWorker(text) / tokenizeDictSegInWorker(text) │
│       ▼                                                                  │
│  tokenizer-worker.ts (singleton bridge)                                  │
│   • status machine: idle → loading → ready | failed                      │
│   • serialized injectJavaScript queue                                    │
│   • pending request map {id → resolve, timer}                            │
└───────┬──────────────────────────────────────────────────────────────────┘
        │ injectJavaScript (ASCII-escaped)          │ postMessage (JSON)
        ▼                                            ▲
┌──────────────────── WebView (separate process/thread) ───────────────────┐
│  TokenizationWorkerHost → 0×0 off-screen WebView                          │
│  Page: kuromoji <script> + in-memory FakeXHR shim                         │
│  • kuromoji.builder().build()  →  {type:'ready'}                          │
│  • __lpTokenize(id, text)      →  {type:'result', kind:'ja', tokens}      │
│  • __lpTokenizeDict(id, l2, t) →  {type:'result', kind:'dict', tokens}    │
└────────────────────────────────────────────────────────────────────────────┘
```

### Flow Steps

1. **App launch — mount.** `_layout.tsx` renders `TokenizationWorkerHost`. The host reads `assets/kuromoji/kuromoji.html` via `expo-asset` + `expo-file-system`, builds the page with `buildWorkerPageHtml(kuromojiSource)`, then renders the WebView with `source={{ html, baseUrl: 'https://langplayer-worker.local/' }}`.
2. **Page load.** The page's first script tag defines `kuromoji`; the harness script posts `{type:'kuromoji', exists, keys}` (boot ping) and installs the `__lp*` functions. `onLoadEnd` calls `warmTokenizationWorker()`.
3. **Warm (ja).** The bridge checks `hasKuromojiData('ja')`; if the data pack is missing it marks the worker `failed` and leaves the main-thread fallback in charge. Otherwise it reads each of the 12 `.dat.gz` files, base64-encodes them, and injects `window.__lpAppend(name, i, chunk, total)` through `injectQueued()` (128 KB chunks, `setTimeout(0)` between calls). Finally it injects `window.__lpInit(...)`.
4. **Build (ja).** The page assembles chunks, swaps in an in-memory `FakeXHR` (kuromoji's browser build fetches dictionary files with XHR), and calls `kuromoji.builder({ dicPath: 'lp://dict/' }).build(...)`. Success posts `{type:'ready'}`; the bridge sets status `ready` and resolves the warm promise.
5. **Tokenize (ja).** `tokenizeJapaneseInWorker(text)` sends `window.__lpTokenize(id, "…")`, waits up to 3 s for `{type:'result', id, kind:'ja', tokens}`, and maps each token through `toLemmatized()`: `cleanJapaneseLemma()` for the lemma, `reading` → `pronunciation`, `pos` → `part_of_speech`, `source: 'ja-kuromoji'`.
6. **Warm (dict-seg).** For the active L2 (`TOKENIZER_CONFIG[l2].needsDictSegmentation`, or its `baseCode`, e.g. `zh-Hans` → `zh`), the host calls `warmTokenizationWorkerDict(l2)`. The bridge queries the offline dictionary (`head`/`alternate`, `pronunciation`, optional `part_of_speech`), serializes `{w, p, pos}`, UTF-8 encodes it, and streams base64 chunks through `__lpAppendDict`.
7. **Ack-based streaming.** The page acks every chunk with `{type:'dict_chunk', l2, index, got, total}`. The bridge re-sends missing chunks for up to 3 rounds (3 s deadline each), then injects `__lpInitDict(l2, total)`. The page decodes the JSON, builds a `Set` + pinyin map + POS map, converts numeric tone pinyin to tone marks (`ni3 hao3` → `nǐ hǎo`), and posts `{type:'ready_dict', l2, words, maxLen}`.
8. **Tokenize (dict-seg).** `tokenizeDictSegInWorker(text, l2)` injects `__lpTokenizeDict(id, l2, text)`. The page runs forward maximum matching, groups ASCII runs (`ISBN`, `978`), attaches Unicode combining marks to the previous token (Thai/SEA ruby rendering), and attaches pinyin/POS. Results come back as `{type:'result', kind:'dict', tokens}`.
9. **Failure & fallback.** Any timeout, missing data pack, or WebView error resolves in-flight requests with `null` and/or marks status `failed`; `runLocalFallbackRaw` then falls through to the main-thread tokenizers. Dictionary deletion/re-download calls `resetDictWorker(l2)`, which injects `__lpResetDict(l2)` so the page drops stale datasets.

---

## Message Protocol

### RN → page (`injectJavaScript`)

| Function | Payload | Purpose |
|---|---|---|
| `__lpAppend(name, index, chunk, total)` | kuromoji data-pack chunk | Stores one base64 chunk of a `.dat.gz` file. |
| `__lpInit(namesJson)` | file list | Builds the kuromoji tokenizer from stored chunks. |
| `__lpTokenize(id, textJson)` | tokenize request | Tokenizes one line with kuromoji. |
| `__lpAppendDict(l2, index, chunk, total)` | dict dataset chunk | Stores one base64 chunk of `{w, p, pos}`. |
| `__lpInitDict(l2Json, total)` | dataset metadata | Decodes and builds the dict-seg dataset. |
| `__lpTokenizeDict(id, l2Json, textJson)` | tokenize request | Tokenizes one line with forward max matching. |
| `__lpResetDict(l2Json)` | reset | Clears a dict dataset (dictionary re-download/delete). |

### Page → RN (`window.ReactNativeWebView.postMessage`)

| Message | Meaning |
|---|---|
| `{type:'kuromoji', exists, keys}` | Boot ping — kuromoji global loaded. |
| `{type:'ready'}` | kuromoji tokenizer built. |
| `{type:'ready_dict', l2, words, maxLen}` | Dict dataset built. |
| `{type:'dict_chunk', l2, index, got, total}` | Chunk ack for ack-based streaming. |
| `{type:'result', id, kind:'ja'\|'dict', tokens}` | Tokenize reply. |
| `{type:'error', id?, kind?, l2?, error, got?, total?}` | Page-side failure; with `id` it fails one request, without it fails the warm. |
| `{type:'dict_reset', l2}` | Reset ack (informational). |

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Hidden 0×0 WebView instead of a native module | Reuses the official kuromoji browser build and the already-downloaded data pack; no new native code. |
| `source={{ html, baseUrl: 'https://langplayer-worker.local/' }}` | Stable origin for the page; required for scripts to behave as in a normal browser context. |
| Inline HTML module instead of `file://` asset | `file://` assets do not execute scripts in Expo Go; reading the `.html` as text and inlining it works everywhere. |
| `injectJavaScript` inbound + `postMessage` outbound | Large payloads (128 KB base64 chunks) are proven reliable through `injectJavaScript`; results come back through the native message channel. |
| `toJsLiteral()` ASCII escaping | WKWebView drops or corrupts non-ASCII text in `injectJavaScript`; every injected string is emitted as `\uXXXX` escapes. |
| Serialized injection queue (`injectQueued`) | WKWebView can drop `evaluateJavaScript` calls when multiple async loops inject concurrently (observed during ja + dict warm storms). |
| In-memory `FakeXHR` | The kuromoji browser build loads dictionary files with `XMLHttpRequest`; the shim serves the streamed chunks from page memory (no network). |
| Ack-based dict chunk streaming | WKWebView unpredictably drops injected calls; the page acks each chunk and the bridge re-sends missing ones (up to 3 rounds). |
| Status machine + warm promise + 1.5 s wait | First reader page prefers the worker when warm is already in flight, but falls back fast instead of blocking tokenization. |
| Main-thread fallbacks everywhere | Every worker API returns `null` on failure; `tokenizer.ts` never depends on the WebView being available. |
| `resetDictWorker()` on dictionary changes | The page keeps its own copy of headword sets; stale in-page data would otherwise survive a dictionary re-download/delete. |

---

## Integration & Fallback Chain

`lemmatizeText()` (in `lib/tokenizer.ts`) keeps its existing pipeline: cache → server (unless offline mode) → local fallback. Inside the local fallback (`runLocalFallbackRaw`), the WebView paths are tried first:

1. `ja` → `tokenizeJapaneseInWorker()` → main-thread `tokenizeJapanese()` → generic segment/lemmatize.
2. `needsDictSegmentation` languages → `tokenizeDictSegInWorker(text, l2)` → main-thread `segmentText()` + `lemmatizeLocal()` → regex.
3. `ko` remains main-thread only (`kuromoji-ko`); only `ja` uses the kuromoji WebView path.

The bridge waits at most **1.5 s** for an in-flight warm, so the first visible line prefers the WebView without stalling the UI. Individual tokenize requests time out after **3 s**; init/warm times out after **30 s**.

---

## Lifecycle & Reset

- **Mount** — host mounts once at app launch; warm starts on `onLoadEnd`.
- **Unmount / fast refresh** — `attachTokenizationWebView(null)` resets the ja worker state (`idle`), so a fresh host re-warms its own WebView.
- **Dictionary delete / re-download** — `clearDictionaryCaches(l2)` calls `resetDictWorker(l2)`, which clears the in-page dict dataset.
- **kuromoji data-pack re-download** — `resetTokenizer('ja')` currently resets only the main-thread singleton. The WebView ja tokenizer is warmed once per host mount, so if the data pack is missing at launch the WebView path stays `failed` for that session and the main-thread fallback handles ja. Re-warming the ja WebView after a late data-pack download is a known gap (see below).

---

## Known Limitations

- **Not a Web Worker.** Despite the "worker" naming, tokenization runs on the WebView page thread (outside the RN JS thread, but not a `Worker` object). A literal Web Worker conversion was prototyped but is not the current implementation.
- **Late ja data-pack download.** If `hasKuromojiData('ja')` is false at launch, the WebView ja path marks itself `failed` for the session; a later download does not re-warm it without an app reload. Main-thread kuromoji still covers it.
- **Memory.** One persistent WebView plus per-language dict datasets live in page memory for the app session.
- **Dev-only sharp edges.** Fast refresh remounts the host; Expo Go requires the inline-HTML approach (see history); physical-device testing requires a development build (SPEC-048 § 1.4).
- **No network use.** The design intentionally reads only local files; `dicPath` is virtual (`lp://dict/`) and served by `FakeXHR`.

---

## Related Specs / References

- [SPEC-018 — Mobile Local Tokenization & Lemmatization](../specs/018-local-tokenization-mobile.md)
- [ARCH-018 — Local Tokenization Strategy](018-local-tokenization-strategy.md)
- [ARCH-016 — Server-Side Tokenization Pipeline](016-server-tokenization.md)
