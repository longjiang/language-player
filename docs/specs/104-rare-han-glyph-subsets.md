# SPEC-104: Rare Han Glyph Display via On-Demand Font Subsets + Chip Fallback

## Metadata
- **Spec ID**: SPEC-104
- **Feature**: Render rare Han codepoints (e.g. U+26030 𦀰) on web and mobile with minimal client download
- **Status**: in-progress — backend/web/mobile implemented; device verification pending
- **Created**: 2026-10-18
- **ROADMAP Phase**: Cross-cutting (rendering, dictionary, reader, video)
- **Depends on**: [SPEC-080 — Web lang/glyph rendering](./080-web-lang-attribute-glyph-rendering.md), [SPEC-088 — CJK glyph rendering](./088-cjk-glyph-rendering.md), [ADR-0046 — China-blocked hosts](../adr/0046-china-blocked-third-party-hosts.md)
- **See also**: [ADR-0038 — Native ruby text rendering](../adr/0038-native-ruby-text-rendering.md), [ARCH-030 — Ruby text native rendering](../arch/030-ruby-text-native-rendering.md)

---

## Overview

Some `lzh` (and other Han-script) source text contains codepoints outside the
coverage of normal system CJK fonts. A token is not lost — the tokenizer
preserves it as a word token — but the device cannot draw a glyph, so the token
renders as a blank gap. The motivating example is `遠將𦀰像`, where `𦀰` (U+26030, CJK
Extension B) is invisible on devices whose fonts lack it.

This spec defines a **server-side, on-demand font-subset service** plus a
**client-side chip fallback**. The client downloads only the glyphs it needs
(typically a few hundred bytes to a few kilobytes), never a full rare-Han font.
If the subset cannot be loaded, or the source font does not cover a codepoint,
the character renders as an accessible `U+26030` chip instead of a blank.

The original Unicode text is always preserved for copy, search, dictionary
lookup, saved words, and tokenization. The subset/chip is **presentation only**.

---

## The problem

- `𦀰` is U+26030, CJK Unified Ideograph Extension B.
- Common system fonts do **not** cover it: PingFang/Songti/Hiragino, Noto Sans
  CJK, Noto Serif CJK, BabelStone Han 16.0.3, and GNU Unifont 18.0.01 were all
  checked and lack U+26030.
- Full rare-Han fonts that do cover it are large:
  - **Plangothic P1** V2.9.5795 — 19 MB TTF, covers Ext B–J, SIL OFL 1.1.
  - **HanaMinB** 8.030 — 31 MB OTF, covers Ext B–F, Hanazono/OFL.
- A single-codepoint subset is tiny and renders correctly. The numbers below
  are the service's output including copyright/license name records:
  - Plangothic P1 `.ttf`: **2.8 KB**
  - Plangothic P1 `.woff2`: **1.2 KB**
  - HanaMinB `.otf`: **2.3 KB**
  - HanaMinB `.woff2`: **1.3 KB**

Source-font verification (2026-10-18, `fontTools` cmap + outline bounds):

| Font | U+26030 | Evidence |
|---|---|---|
| Plangothic P1 V2.9.5795 | ✅ | cmap hit; glyph `u26030-han`; bounds `(37,-62,948,842)` |
| HanaMinB 8.030 | ✅ | cmap hit; glyph `cid24839`; bounds `(56,-65,935,815)` |
| PingFang HK/MO/TC | ❌ | no cmap entry |
| Songti SC / Hiragino Sans GB | ❌ | no cmap entry |
| Noto Sans/Serif CJK SC | ❌ | no cmap entry |
| BabelStone Han 16.0.3 | ❌ | no cmap entry (only 39.5% of Ext B covered) |
| GNU Unifont 18.0.01 | ❌ | no cmap entry |

Therefore the correct architecture is **subset on demand**, not bundle a full
font. The existing [ADR-0046](../adr/0046-china-blocked-third-party-hosts.md)
rule applies: the font and subset service must be self-hosted or served from
our own origin, never from Google Fonts or another blocked third party.

---

## Goals

1. Render covered rare Han glyphs on web and mobile using on-demand subsets.
2. Keep client downloads minimal: one small subset per document/screen, not a
   full font; cache aggressively.
3. Never render a blank for an uncovered codepoint: show an accessible chip.
4. Preserve the original text for copy, selection, search, dictionary lookup,
   and saved words.
5. Work for both the default sans typeface and the serif setting, without
   bundling either full font.
6. Fail closed and gracefully: offline, server error, missing source font, or
   uncovered codepoint all degrade to the chip.
7. Comply with font licenses and with the China-host policy.

## Non-goals

- Replacing the existing CJK font stacks for URO / Extension A characters.
- Automatically substituting rare characters with common variants (e.g.
  displaying `經` for `𦀰`). That is a separate content decision and must not be
  silent.
- Server-side image rendering of every L2 string. A glyph SVG endpoint is only
  a possible future last-resort fallback.
- Changing tokenization to drop or replace unsupported characters.

---

## User stories

- As an `lzh` learner, I want `𦀰` to display correctly on my phone and in the
  browser, so I can read the source text.
- As a learner on a slow or offline connection, I want a visible `U+26030` chip
  rather than a blank gap, so I know a character exists and can still copy or
  look it up.
- As a learner, I want to copy the actual character, not the chip label.
- As a product owner, I want one shared subsetting service used by both apps,
  with no 19–31 MB font in the app bundle.

---

## Design principles

1. **Text is canonical; glyphs are presentation.**
   The token's `text`/`lemma` remains the original codepoint. Only display runs
   change.
2. **Only rare codepoints are eligible.**
   URO and Extension A are left to the existing system font stacks. The subset
   path starts at Extension B.
3. **One manifest request per document/screen, not per token.**
   Batch all rare codepoints in a render batch into one manifest request, then
   one font request for that batch.
4. **Subset, don't bundle.**
   Full source fonts live on the server only. Clients fetch generated subsets.
5. **Chip, don't blank.**
   Any failure or uncovered codepoint produces a visible, accessible chip.
6. **Self-host fonts.**
   No runtime dependency on Google Fonts, GitHub raw files, or other blocked
   hosts.

---

## Architecture

```
Web / Mobile
  │
  │ 1. collect rare codepoints from rendered L2 text
  ▼
GET /glyph-font/manifest?cps=26030,2a6d6&style=sans
  │
  │ 2. { covered, missing, hash, font URLs }
  ▼
GET /glyph-font/<hash>.woff2   (web)
GET /glyph-font/<hash>.ttf     (mobile)
  │
  │ 3. immutable cached subset
  ▼
Client registers font
  ├─ web: FontFace + document.fonts
  └─ mobile: expo-font Font.loadAsync
  │
  ├─ covered + loaded → render rare run with subset family
  └─ missing / failed  → render RareGlyphChip("U+26030")
```

Server-side subsetting uses `fontTools.subset` over fixed, checksummed source
fonts. The service never accepts a font name or path from the client.

### Implementation map

| Area | File |
|---|---|
| Shared ranges/runs/labels | `packages/shared/src/rare-glyphs.ts` (new) |
| Server endpoint + subsetter | `zerotohero-python-server/routes/glyph_font.py` (new) |
| Server source-font coverage checks | `zerotohero-python-server/test_glyph_font.py` (new) |
| Web same-origin proxy | `apps/web/src/app/api/glyph-font/.../route.ts` (new) |
| Web batching/provider | `apps/web/src/hooks/use-rare-glyph-font.ts`, provider in the `[l1]/[l2]` layout |
| Web rendering/chip | `apps/web/src/components/tokenized-text.tsx`, `token-span.tsx`, `components/rare-glyph-chip.tsx` (new) |
| Mobile batching/provider | `apps/mobile/contexts/RareGlyphContext.tsx` (new) |
| Mobile rendering/chip | `apps/mobile/components/TokenizedText.tsx`, `components/RareGlyphChip.tsx` (new) |
| Native ruby font per run | `apps/mobile/modules/ruby-text/ios/RubyTextParagraphView.swift`, `android/.../RubyTextParagraphView.kt` |
| Tokenization regression | `zerotohero-python-server/test_dictionary.py` or a dedicated `test_lemmatize` case |


---

## Rare codepoint definition

A codepoint is **rare Han** when it is in one of these ranges:

| Block | Range |
|---|---|
| CJK Unified Ideographs Extension B | `U+20000–U+2A6DF` |
| CJK Unified Ideographs Extension C | `U+2A700–U+2B73F` |
| CJK Unified Ideographs Extension D | `U+2B740–U+2B81F` |
| CJK Unified Ideographs Extension E | `U+2B820–U+2CEAF` |
| CJK Unified Ideographs Extension F | `U+2CEB0–U+2EBEF` |
| CJK Unified Ideographs Extension I | `U+2EBF0–U+2EE5F` |
| CJK Unified Ideographs Extension G | `U+30000–U+3134F` |
| CJK Unified Ideographs Extension H | `U+31350–U+323AF` |
| CJK Unified Ideographs Extension J (Unicode 17) | `U+323B0–U+3347F` |
| CJK Compatibility Ideographs Supplement | `U+2F800–U+2FA1F` |

URO (`U+4E00–U+9FFF`) and Extension A (`U+3400–U+4DBF`) are deliberately
excluded: system CJK stacks cover them on both platforms.

Rules:

- Split text by **code point** (`Array.from(text)` / `for…of`), never by UTF-16
  code units. U+26030 is a surrogate pair in JavaScript.
- Deduplicate codepoints before requesting.
- Cache by a stable hash of the sorted codepoint set.

---

## Server API

### 1. Manifest

```
GET /glyph-font/manifest?cps=26030,2a6d6&style=sans
```

- `cps`: comma-separated lowercase hex codepoints, no `U+` prefix, max 256.
- `style`: `sans` (Plangothic P1) or `serif` (HanaMinB). Default `sans`.
- Invalid codepoint, out-of-range codepoint, or too many codepoints → `400`.
- Rate-limit per IP; cache identical manifests.

Response `200`:

```json
{
  "version": "plangothic-2.9.5795+subset-v1",
  "style": "sans",
  "hash": "f3c1a9e2b7d4",
  "covered": ["26030"],
  "missing": ["2a6d6"],
  "fonts": {
    "woff2": { "url": "/glyph-font/f3c1a9e2b7d4.woff2", "bytes": 744 },
    "ttf":   { "url": "/glyph-font/f3c1a9e2b7d4.ttf",   "bytes": 1320 }
  }
}
```

- `covered`: codepoints present in the source font and included in the subset.
- `missing`: codepoints the source font cannot render; the client shows chips.
- `fonts`: per-format entries; omitted when `covered` is empty. A serif
  HanaMinB subset exposes `woff2` and `otf` instead of `ttf`. Mobile clients
  prefer `ttf`, then `otf`; web clients use `woff2`.
- `Cache-Control: public, max-age=3600` (the hash makes the entry immutable;
  the manifest can be stored longer once the version is pinned).

### 2. Binary subset

```
GET /glyph-font/<hash>.woff2
GET /glyph-font/<hash>.ttf
GET /glyph-font/<hash>.otf
```

- Content types: `font/woff2`, `font/ttf`, `font/otf`.
- `Cache-Control: public, max-age=31536000, immutable`.
- Serve only files from the subset cache whose hash matches the request; never
  trust a path from the client.
- The font family/PostScript name inside the subset is
  `LPRareHan-<hash>`, not the source font's reserved name. All relevant name
  records (IDs 1, 4, 6, 16, 17) must be set so both
  `UIFont(name: postScriptName)` and Android family lookup resolve.

### 3. Web same-origin proxy

The web app calls a Next.js route (`/api/glyph-font/...`) that proxies the
Flask endpoint and passes through the immutable cache headers. This:

- avoids CORS and font-loading edge cases,
- keeps the browser on our own origin ([ADR-0046](../adr/0046-china-blocked-third-party-hosts.md)),
- lets the browser/CDN cache the bytes.

Mobile calls the Flask endpoint directly (its API base URL already handles
native networking).

### 4. Server subset generation

- Source fonts are fixed and checksummed:
  - `data/fonts/PlangothicP1-Regular.ttf` (sans, 19 MB, OFL)
  - `data/fonts/HanaMinB.otf` (serif, 31 MB, Hanazono/OFL)
- Load them lazily once; cache the cmap in memory.
- For each request:
  1. Validate and sort unique codepoints.
  2. Split into `covered` / `missing` using the source font's cmap.
  3. If `covered` is empty, return the manifest without generating a font.
  4. Subset with `fontTools.subset`:
     - no layout features (`GSUB`/`GPOS` dropped),
     - no hinting,
     - minimal name table,
     - `desubroutinize` for CFF,
     - rename family/PostScript to `LPRareHan-<hash>`,
     - keep copyright/license name records.
  5. Save as WOFF2 for web and TTF/OTF for mobile.
  6. Cache both formats on disk/remote cache keyed by
     `version + style + sorted(cps)`.
- `GLYPH_FONT_VERSION` must be bumped when the source font or subsetter
  options change. It participates in the hash and cache path.
- If a source font is absent or fails checksum validation, return
  `503 glyph_font_unavailable`; clients use chips.

### 5. Security

- Allowlist codepoint ranges, styles, and formats.
- Reject over-long requests (max 256 codepoints) and malformed hex.
- Never accept filenames, font paths, or arbitrary family names.
- Generate subsets with the Python API, not shell interpolation.
- Rate-limit and cache; log/reject abusive requests.
- Source fonts are read-only and checksum-verified at startup/test time.

---

## Client design

### Shared helpers

Add to a platform-agnostic shared package (no React/RN/Next imports):

```ts
export interface RareGlyphRun {
  kind: 'text' | 'rare';
  text: string;
  codePoint?: number;
  label?: string; // "U+26030"
}

export function isRareHanCodePoint(cp: number): boolean;
export function collectRareCodePoints(text: string): number[];
export function splitRareGlyphRuns(text: string): RareGlyphRun[];
export function glyphLabel(cp: number): string; // "U+26030"
export function rareFontFamily(hash: string): string; // "LPRareHan-<hash>"
```

Unit tests must cover every range boundary and U+26030.

### Batching / provider

Both apps use a `RareGlyphProvider` at the L2 layout level:

- Components register the L2 text they render.
- The provider collects unique rare codepoints, debounces (e.g. 100 ms), and
  makes **one** manifest request for the batch.
- It loads the returned font once and publishes:
  - `familyFor(cp)` when covered and loaded,
  - otherwise `missing(cp)`.
- In-flight promises are deduplicated by hash. Loaded families are kept in an
  LRU (e.g. max 32 families) to bound memory.
- If a batch exceeds 256 codepoints, split it into chunks.

This prevents one request per token and avoids loading a font for characters
that are not on screen.

### Web

- Fetch the manifest, then fetch the font bytes.
- Create a `FontFace` from the `ArrayBuffer`:

  ```ts
  const face = new FontFace(family, bytes, {
    display: 'swap',
    unicodeRange: cps.map((cp) => `U+${cp.toString(16).toUpperCase()}`).join(', '),
  });
  await face.load();
  document.fonts.add(face);
  ```

- Cache the `FontFace`/promise by hash. Use `display: 'swap'` so the chip is
  visible immediately, then the glyph swaps in.
- Apply `fontFamily` only to the rare run; the surrounding text keeps the
  existing regional font stack.
- If `load()` rejects, mark the codepoint missing and render the chip.

### Mobile

- Fetch the manifest, download the TTF (preferred) or OTF to the app cache:
  `cache/glyph-fonts/<hash>.<ttf|otf>`.
- Register with `expo-font`:

  ```ts
  await Font.loadAsync({ [family]: { uri: localUri } });
  ```

- Expo's native implementations register the font process-wide
  (`CTFontManagerRegisterFontsForURL` on iOS, `Typeface.createFromFile` on
  Android), so a downloaded subset can be used without bundling.
- Cache the local file, the family, and the load promise by hash. Reuse on
  subsequent launches; do not re-download.
- If download or registration fails, mark missing and render the chip.

### Native ruby renderer

`GlyphText`/RN `<Text>` resolves expo-font aliases automatically. The custom
ruby paragraph views do not; they must be extended:

- Add an optional per-run `fontFamily`/`rareFontFamily` to the run model.
- iOS: resolve the registered subset by its **PostScript name** with
  `UIFont(name: postScriptName, size:)`.
- Android: resolve the runtime-loaded family with
  `ReactFontManager.getInstance().getTypeface(family, style, assets)` (or pass
  the downloaded file path and use `Typeface.createFromFile`), not bare
  `Typeface.create(family, style)`.
- Only rare runs use this font; base runs keep the existing system/regional
  font.
- Readings (ruby) do not need the rare font unless the reading itself contains
  a rare codepoint.

This is a required part of the work: the screenshot path is the native ruby
view, not the RN `<Text>` path.

### Plain-text surfaces

Dictionary headwords, definitions, examples, subtitles, search results, saved
words, and review context all render L2 text. Use the same
`splitRareGlyphRuns`/provider logic (or a shared `<RareGlyphText>` wrapper) so a
rare glyph never blanks in one surface while working in another.

---

## Chip fallback

The chip is the guaranteed fallback and the initial rendering state.

### Appearance

- Inline, roughly `1em` wide, same line height as surrounding text.
- Visible mark: a compact `?` inside a dashed border. The full codepoint
  (`U+26030`) is carried in `aria-label`, `title`, `data-rare-glyph`, and the
  detail sheet — putting the seven-character label inline overflowed a 1em
  chip.
- Never shown as an error color; it is an informational “glyph unavailable”
  state.

### Behavior

- Tap/click: open the dictionary popup for the **token** (using the original
  token text), exactly as a normal word tap.
- Long press / secondary action: copy the **original character**, not the chip
  label.
- Optional detail sheet:
  - codepoint (`U+26030`),
  - radical/strokes from Unihan if available,
  - external links (ZDIC, GlyphWiki),
  - “Copy character”.
- If the dictionary has no entry for the rare character, show the existing
  “no results” state plus the copy/external actions; do not fabricate a
  meaning through the LLM fallback unless it is clearly labeled as generated.

### Copy and selection

- The canonical text remains the original codepoint in the DOM/text storage.
- Web: render the original character transparent under/next to the chip (or
  use a visually-hidden original span) so selection and copy produce the
  original character, while the visible chip is presentational. The chip
  carries `aria-label`.
- Mobile: keep the original string in the native text storage; the chip is a
  visual decoration. If the current native selection model cannot express
  that, provide an explicit “Copy character” action and document the
  limitation as a known issue. Do not silently copy `U+26030`.

### Accessibility

- Web: `aria-label="Rare character U+26030"`; `role="img"` on the chip.
- Mobile: `accessibilityLabel="Rare character U+26030"`; focusable/tappable.
- The visible `?` is decorative; the codepoint is not lost and is available in
  the detail/copy path.
- Screen readers should not read the chip label as the word itself; the
  dictionary action announces the token.
- Contrast and size follow the design tokens; do not use hardcoded colors.

---

## Tokenization and text model

- **Do not drop or replace the codepoint.** The backend
  `lemmatize_unified` already keeps `𦀰` as a token with a lemma because it is
  a letter (`Lo`), not punctuation.
- Add a regression test:
  `lemmatize("遠將𦀰像", "lzh")` returns four tokens and the third token's
  lemma is `𦀰`.
- Suppress a token `pronunciation` when it equals the surface text. Pypinyin
  returns the character itself when it has no reading; rendering that as ruby
  would create a second invisible line.
- Keep code-point-safe iteration for display and selection. Do not slice
  strings by UTF-16 `.length` when splitting glyph runs.
- Search and saved-word IDs continue to use the original text; the chip label
  is never stored.

---

## Caching and offline

### Client

- Web:
  - HTTP cache for the immutable font URL,
  - in-memory `FontFace`/promise cache,
  - optional Cache Storage entry keyed by hash for offline reloads.
- Mobile:
  - file in `cache/glyph-fonts/<hash>.<ttf|otf>`,
  - in-memory family/load cache,
  - reuse across launches; purge LRU above a size/count cap.
- Cache by `(version, style, hash)`, not by raw text.

### Server

- Content-addressed subset cache:
  `cache/glyph_fonts/<version>/<style>/<format>/<hash>.<ext>`.
- Manifest cache keyed by hash.
- Immutable responses; cleanup by age/size; no cache invalidation needed when
  `GLYPH_FONT_VERSION` changes.

### Offline behavior

If the manifest or font cannot be fetched and no cached subset exists, render
the chip. Never block text rendering on the font request, and never show a
blank.

---

## Performance budget

| Metric | Target |
|---|---|
| Sample U+26030 WOFF2 | ≤ 2 KB (measured 1.2 KB) |
| Sample U+26030 TTF | ≤ 3 KB (measured 2.8 KB) |
| Typical document (1–20 rare cps) | ≤ 10 KB |
| Max codepoints per request | 256 |
| Manifest request | one per render batch |
| Cold subset generation | < 500 ms |
| Warm cached response | < 50 ms |
| Text render | never blocked by font loading |

---

## Licensing

- **Plangothic P1** — SIL OFL 1.1. Commercial use permitted. A subset is a
  modified version: rename away from the reserved names “Plangothic”/“遍黑”
  and include the OFL text/copyright.
- **HanaMinB** — Hanazono Font License / SIL OFL 1.1 (per upstream and Debian
  packaging). Verify the license file in the release used. Subsetting requires
  renaming away from reserved names such as “HanaMinB”/“花園明朝B”.
- Do **not** use BabelStone Han, Noto Sans/Serif CJK, or GNU Unifont as the
  rare source: they were verified to lack U+26030.
- Serve a license/attribution endpoint or include license metadata in the
  font and the app’s legal/credits surface.
- Store source fonts with checksums and license files in the deployment image,
  not in the client bundle.

---

## Observability

Use the app-wide logging switches and bracketed prefixes:
`[LP Web]`, `[LP Mobile]`; info-level by default.

Log:
- batch size (codepoint count),
- manifest hash, covered/missing counts,
- subset bytes and format,
- load success/failure and duration,
- fallback chip reason (`missing`, `load_failed`, `offline`, `server_error`).

Do not log entire source texts or user content.

---

## Testing

### Unit / server

- `isRareHanCodePoint` boundaries for every range, including U+26030.
- `collectRareCodePoints` deduplicates and handles surrogate pairs.
- Manifest validation: invalid hex, non-rare codepoint, >256 cps, invalid
  style/format.
- Subsetter: U+26030 yields a non-empty cmap/outline; font family renamed;
  license name records retained.
- Cache headers and hash stability.
- Source font coverage test: U+26030 is covered by Plangothic P1 and HanaMinB;
  assert the known missing fonts are not used.
- Offline/server-missing path returns a manifest with all `missing`, not a 500.

### Integration

- Web: load the sample `遠將𦀰像`; U+26030 renders from the subset; network
  payload ≤ 2 KB; chip appears before load and on failure.
- Mobile: same text in the native ruby paragraph; font registers via
  expo-font; iOS PostScript resolution and Android ReactFontManager resolution
  work.
- Copy: selecting/copying the sample yields the original `𦀰`, not `U+26030`.
- Dictionary: tapping the chip/token opens the same lookup as a normal token.
- Offline: with no network and no cache, chip appears, no blank; with cache,
  glyph renders offline.
- Serif setting: rare glyph uses the serif subset; sans uses the sans subset.
- Regression: URO/Extension A text is unchanged and does not trigger a subset
  request.

### Visual

- Golden screenshot of `遠將𦀰像` on web and mobile, sans and serif.
- Compare the subset glyph against the verified source rendering (U+26030 is
  `jīng`, a variant of 經/经; see the Unihan record).

---

## Implementation status

Implemented in this change:

- Backend subsetter + manifest/binary endpoints, source fonts, cache, 15 tests.
- Web same-origin proxy, batching provider, `FontFace` loader, `RareGlyphText`
  chip, token spans, plain text, dictionary entries, jsdom swap test.
- Mobile provider/file cache/expo-font loader, chip, per-segment ruby font,
  dictionary entries, and Android `ReactFontManager` resolution for
  runtime-loaded families.
- Blocks containing rare codepoints use the JS flex path on mobile so the
  native attributed-string paragraph cannot blank them; the per-segment native
  `RubyText` view still receives the subset family.

Pending verification: a physical iOS/Android build (native module change) and a
visual pass on the exact screenshot phrase. No production build was run here.

## Rollout

1. **Server**: subsetter, manifest/binary endpoints, cache, tests, source font
   provisioning, license files.
2. **Web**: shared helpers, provider/batching, `FontFace` loader, chip, plain
   text surfaces, same-origin proxy.
3. **Mobile RN**: provider, file cache, `expo-font` loader, chip, plain text.
4. **Native ruby**: per-run font support for iOS/Android; verify the screenshot
   path.
5. **Serif**: enable HanaMinB source after the sans path is stable.

Feature flag: `rareGlyphSubsets` (default on after verification). If the
server is not provisioned, the client still renders chips.

---

## Acceptance criteria

- `遠將𦀰像` displays a real glyph for U+26030 on web and mobile, sans and
  serif, without downloading a full font.
- U+26030 download is ≤ 3 KB (TTF) / ≤ 2 KB (WOFF2) for the sample; a typical
  page stays ≤ 10 KB.
- No blank rendering in any L2 surface: tokenized text, dictionary, examples,
  subtitles, search results, saved words, review context.
- Offline, server error, missing source font, or uncovered codepoint → visible,
  accessible `U+26030` chip; no crash, no infinite loading.
- Copy/selection/save/search/dictionary lookup use the original character.
- No token is dropped or replaced by tokenization; the `lzh` regression test
  passes.
- The font is served from our own origin; no blocked third-party font host.
- Licenses and attribution are included; subset names are renamed.
- No regression for URO/Extension A or existing CJK glyph variants.

---

## Open questions

1. **Chip label.** `U+26030` is unambiguous but wide; alternatives are `?` with
   a tooltip or a small `□` plus codepoint in the detail sheet. Decide with a
   visual pass.
2. **Native selection/copy.** Can the ruby paragraph view keep the original
   string selectable while drawing the chip, or is an explicit “Copy character”
   action required? Resolve during native implementation.
3. **Serif source.** HanaMinB is a good style match but 31 MB server-side; if
   deployment size matters, start with Plangothic for both and add HanaMinB
   later.
4. **Variant substitution.** Should `𦀰` display as `經` with a “variant of”
   badge when no font is available? This is content-specific (the dictionary
   says “疑同 经”) and must not be silent; likely a separate follow-up.
5. **Rate limits and abuse.** Choose limits/cost controls for a public subset
   endpoint before launch.
6. **Other Han L2s.** The same path should work for `zh`, `yue`, `nan`, etc.;
   decide whether to enable globally or only for `lzh` initially.
