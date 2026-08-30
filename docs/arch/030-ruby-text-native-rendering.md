# Native Ruby Text Rendering & The logLineFragments Incident

## Metadata
- **Arch ID**: ARCH-030
- **Feature**: Native ruby (furigana/pinyin/jyutping) rendering on mobile — architecture, pitfalls, and the 2026-08-16 Debug-only paint failure
- **Type**: as-built + reference
- **Status**: accepted
- **Created**: 2026-08-16
- **Last Updated**: 2026-08-16
- **ROADMAP Phase**: Cross-cutting (mobile rendering)
- **Scope**: Mobile (`apps/mobile/modules/ruby-text`, `apps/mobile/components/RubyText.tsx`, `apps/mobile/components/TokenizedText.tsx`)
- **See also**:
  - [ADR-0038 — Native Ruby Text Rendering](../adr/0038-native-ruby-text-rendering.md)
  - [ADR-0039 — Flat Ruby Run (Web)](../adr/0039-flat-ruby-run-web.md)
  - [ARCH-028 — Local Development Runbook](028-local-development-runbook.md)
  - [Build Ledger — Incident log](../versioning/build-ledger.md)
  - [ARCH-027 — Per-aspect logging](027-per-aspect-logging.md)

---

## Overview

Japanese (and Chinese/Cantonese, Korean) text renders readings above the base
characters with the **platform text engine**, not with JS views. A local Expo
module, `apps/mobile/modules/ruby-text`, exposes two iOS views (plus Android
equivalents):

- **`RubyTextView`** (per-token): one `UILabel` per ruby segment, applying a
  `CTRubyAnnotation` to each kanji↔reading pair in the segment's attributed
  string.
- **`RubyTextParagraphView`** (paragraph): one `UITextView` holding an entire
  text block as a single attributed string, so Core Text can compute JIS-style
  **ruby overhang** across adjacent tokens (a per-token box cannot).

Both views rely on the same Core Text mechanism:
`kCTRubyAnnotationAttributeName` + `CTRubyAnnotationCreateWithAttributes`
(alignment `.center`, overhang `.auto`, position `.before`). The reading font
and color ride in the annotation's attribute dictionary
(`kCTFontAttributeName`, `kCTForegroundColorAttributeName`).

This document explains how those views are built, how they are measured
(Fabric/Yoga cannot measure custom host views), and — most importantly — a
Debug-only paint failure caused by a diagnostics helper touching the text
engine's layout manager, plus the rules that prevent it from recurring.

---

## How the renderers work

### Measurement pattern (both views)

Fabric/Yoga does not measure custom host views, so JS renders an invisible
RN `<Text>` with the same font and line box, reads its laid-out box via
`onLayout`, and hands that exact box to the native view through `style`.
The swap is layout-neutral: the fallback (JS View columns) is rendered once,
measured, and replaced by the native view of the same size.

### Per-token view (`RubyTextView.swift`)

- `UILabel`, `numberOfLines = 1`, `lineBreakMode = .byClipping`.
- The label is offset below the reserved reading slot
  (`y = readingSize - rubyPull`), so the base text baseline sits in the lower
  part of the measured box.
- `makeAttributedString()` appends each segment with base attributes, then
  adds `CTRubyAnnotation` over each segment that has a reading.
- Tap handling is a single gesture recognizer reporting the token index.

### Paragraph view (`RubyTextParagraphView.swift`)

- `UITextView`, non-editable/selectable, zero insets, `clipsToBounds = false`.
- `runs` (a flat list of text runs, each with optional `reading`) is converted
  into one `NSMutableAttributedString` with a uniform paragraph style:
  `minimumLineHeight = maximumLineHeight = lineHeight` (the UNIFORM line
  pitch — see "Line box model" below), `byWordWrapping`.
- Ruby annotations are attached per run with `CTRubyAnnotationCreateWithAttributes`.
- **Lazy-layout safeguard**: UITextView lays out lazily; setting
  `attributedText` while the container is still zero-sized can leave the text
  blank. `layoutSubviews()` therefore re-applies the attributed string once
  real bounds exist (`hasLaidOutText`).
- Taps are mapped from `UITextView` input geometry back to run/token ids.
- **Line grid (translation baseline alignment)**: the paragraph measures its
  own base-text line grid on an **in-memory TextKit 2 replica** of the exact
  live layout (same attributed string, same pinned paragraph style, same
  container width) — the live view is TextKit 2 (`textLayoutManager` present,
  confirmed 2026-08-23), so the replica's fragment boxes and base baselines
  ARE the rendered geometry. Per line it reports `y`/`height` (fragment rect)
  and `ascender` (base baseline offset from the line top =
  `textLineFragments.first!.glyphOrigin.y`, the base run's origin). The grid
  goes to JS through `onLineGrid` and drives the reader's baseline-aligned
  translation column. The Android paragraph (`RubyTextParagraphView.kt`)
  reports the same shape straight from its live `TextView` layout
  (`onLayoutChanged`). Never touches the live view's layout manager
  ([incident](#the-2026-08-16-incident-readings-silently-stop-painting-in-debug)).

### JS side (`RubyText.tsx`, `TokenizedText.tsx`)

- `RubyText.tsx` probes the native module at load time
  (`requireOptionalNativeModule('RubyText')`, plus
  `isParagraphRendererAvailable()` for the paragraph view). Expo Go lacks the
  module, so availability is a runtime check, not an assumption.
- `TokenizedText.tsx` chooses the path: paragraph native → per-token native →
  JS View-column fallback, gated by `NATIVE_RUBY_ACTIVE` /
  `NATIVE_PARAGRAPH_ACTIVE` and `showDefinition` (definitions force the
  per-token path).
- `NATIVE_RUBY_ENABLED` (module-level constant in `RubyText.tsx`) is the kill
  switch: setting it to `false` forces the JS View-column fallback everywhere,
  which renders readings as plain RN `<Text>` columns (no native typography,
  no overhang).

---

## The 2026-08-16 incident: readings silently stop painting in Debug

### Symptom

- TestFlight 3.1.2 (Release): furigana renders correctly.
- Debug builds (Metro-connected, physical iPad Air M4): the base kanji render,
  the readings **never paint**. No error, no crash — the readings are simply
  absent.

### Evidence chain (how the root cause was pinned down)

1. **Source identical to 3.1.2** — `git diff v3.1.2 HEAD -- apps/mobile`
   showed only `AboutDialog.tsx`; the user's revert was already complete.
2. **Served JS bundle current** — fetched the Metro bundle; no stale
   saved-gloss code, current `RubyText` code present.
3. **JS data healthy** — `PHONETICS` debug logs: `show=ruby`,
   `conditions=always`, all tokens carry readings (`富士→フジ`),
   `rubyShown` counts correct.
4. **Native module present & active** — `native ruby renderer available` +
   `paragraph ruby renderer available`; paragraph path taken
   (`render-path native=true paragraphView=true paragraphUsed=true`).
5. **Native view state correct** — `getParagraphDiagnosticsForTag`:
   mounted, sized (565×129 etc.), `tvTextLen > 0`, `textKit="1"`.
6. **Attributed string correct** — device console capture
   (`devicectl device process launch --console`) proved every reading was
   attached (`attach-ruby run=0 … reading="ふじ"`) and present in the string
   (`ruby-attr`).
7. **Not the JS fallback** — forcing the kill switch painted readings,
   proving the *native* paint step was the failure (and that the fallback is
   a working escape hatch).
8. **Not build flags / binary layout** — Debug↔Release setting diffs were
   standard (`-Onone`, `DEBUG=1`); forcing a monolithic debug binary
   (`ENABLE_DEBUG_DYLIB = NO`) still failed; linked frameworks identical.
9. **Not fonts / settings** — the reader never passes `fontFamily` to
   `TokenizedText` (typeFace only affects the measuring text), and the
   native side logged `fontFamily=nil`, `readingSize=11`.
10. **Device/OS split** — an identical-pipeline Debug build on an iPad 10
    (iPadOS 26.5.2) rendered correctly; the iPad Air M4 (iPadOS 26.6) failed.
    Release (TestFlight) worked on the same 26.6 device.

### Root cause

Commit `088a9439` ("debug(mobile): focus ruby diagnostics and quiet
boot/reader logs") added a `#if DEBUG` helper, `logLineFragments()`, scheduled
from `layoutSubviews()` on the main queue:

```swift
DispatchQueue.main.async { [weak self] in self?.logLineFragments() }
```

`logLineFragments()` reads `textView.layoutManager` and calls
`glyphRange(for: textContainer)` — **forcing a TextKit 1 glyph-layout pass on
the live text view after every layout**. On iPadOS 26.6 this forced legacy
layout pass breaks the view's ruby rendering: `CTRubyAnnotation`s are present
in the attributed string (proven), but the readings are never drawn. iPadOS
26.5.2 tolerated the forced pass; Release builds were never affected because
the code was `#if DEBUG`-compiled out.

The correlation was perfect across every observed build:

| Build | Runs `logLineFragments` (forces `layoutManager`)? | Readings paint? |
|---|---|---|
| iPad 10 debug (pre-`088a9439`) | No | ✅ |
| TestFlight 3.1.2 (Release; `#if DEBUG` out) | No | ✅ |
| Current Debug (with `088a9439`) | Yes | ❌ |
| Current Debug (after fix) | No | ✅ |

### Fix

Removed the entire `logLineFragments` machinery from
`RubyTextParagraphView.swift` (the `didLogLineFragments` flag, the
`layoutSubviews` scheduling, the function itself, and the redundant
`ruby-attr` enumeration in `rebuild()`). A warning comment now sits in
`layoutSubviews` explaining why `textView.layoutManager` must never be
touched there. The JS `paragraph props` log, the native diagnostics dict, and
the `attach-ruby`/`rebuild`/`layout` prints remain — none of them force
layout.

---

## Hard rules

1. **Never force layout on a live text view from diagnostics.**
   Reading `textView.layoutManager` (e.g. `glyphRange(for:)`,
   `lineFragmentRect(forGlyphAt:)`, `characterRange(forGlyphRange:)`) forces a
   TextKit 1 layout pass that can silently break `CTRubyAnnotation` painting
   on some OS versions (iPadOS 26.6, Debug builds). Inspect the **attributed
   string** (`enumerateAttribute(kCTRubyAnnotationAttributeName)`) instead —
   that is read-only and safe.
2. **Keep debug-only text-engine diagnostics out of `#if DEBUG` paint paths.**
   Release builds compile them out — the two configurations then behave
   differently, and the difference is exactly what makes a Debug-only bug
   invisible in Release QA.
3. **Diagnose ruby painting from the outside in:**
   - JS state: `PHONETICS` summary (now also logs for `ja`) and the
     `render-path` log in `TokenizedText.tsx`; `paragraph props` log in
     `RubyText.tsx`.
   - Native state without touching layout:
     `getParagraphDiagnosticsForTag` (runs, chars, bounds, tvFrame, tvTextLen,
     tvText, runTexts, textKit, readingSize, fontFamily) via the Metro log.
   - Native prints: `attach-ruby` / `rebuild` / `layout` in
     `RubyTextParagraphView.swift`, captured with
     `xcrun devicectl device process launch --console --terminate-existing
     --device <udid> ca.zerotohero.go` (these do NOT appear in Metro — they
     are native stdout).
4. **The JS View-column fallback is the escape hatch.** `NATIVE_RUBY_ENABLED
   = false` restores furigana everywhere with zero rebuild — but it sacrifices
   native typography and overhang. Use it to bisect "native paint" vs
   "everything else", never as a permanent fix.
5. **Per-install settings are not shared between builds.** App settings live
   in per-install storage; a Debug install and a TestFlight install can carry
   different state. Verify settings from logs (`show=ruby`) before blaming
   the renderer.

---

## Known limitations

- iOS draws the reading in the base run's color under some configurations —
  the reading color attribute is not reliably honored (see `RubyTextView.swift`).
- TextKit 1 is confirmed in use (`textKit="1"`); do not assume TextKit 2
  anywhere in this module.
- The debug-dylib split (`ENABLE_DEBUG_DYLIB`, Xcode 26 default for Debug) is
  **not** a ruby problem (proven by the monolith experiment) — leave it alone.
- The per-token reading color/positioning (`.center` alignment, `.before`
  position) matches web's per-kanji `<ruby>` closely but not identically;
  visual drift is expected.

### Line box model (2026-08-23 audit — supersedes all earlier line-box notes)

**CSS parity: the ruby line box GROWS to include the annotation.** A ruby
line is the base line box (`fontSize × leading`) PLUS the reading band
(reading glyph body + gap) above it; browsers never keep a ruby line at
`fontSize × leading` and let the reading overlap the previous line. The
earlier tuning history chased a "floats in the leading" model that browsers
do not implement:

| Commit | Box pinned to | Result |
|---|---|---|
| `278a7806` | `baseLeading` (band removed) | reading band missing → readings crowd the line above |
| `59309fb7` / `5d587125` | reading line-box cap | Core Text slab grew (39 → 41px); reverted |
| `a7d1bbca` | `baseLeading − round(readingSize × 0.7)` | **the overlap bug**: box is ~0.5 × readingSize shorter than the reading's glyph body (≈1.2 × readingSize), so readings poke into the line above in every ruby language |
| `519a1e0e` | grid/pin divergence | translation column drifted off the render |

Today (single source of truth, `apps/mobile/lib/ruby-layout.ts` →
`computeRubyLayout()`):

- `readingBand = round(readingSize × 1.2) + RUBY_READING_GAP` — the reading's
  full glyph height (ascender + descender ≈ 1.2 em) + the target gap.
- `linePitch = baseLeading + readingBand` in ruby mode (`baseLeading`
  otherwise). One formula for every language → consistent ruby spacing
  everywhere.
- The native paragraph pins `min = max = linePitch`; the JS measuring text,
  the plain/loading fallback, and the line grid all use the same `linePitch`
  (no pin/grid divergence — `gridLineHeight` == the pin).
- The line grid is measured on the **TextKit 2 replica** — the live engine
  (confirmed `textKit="2"` 2026-08-23). Earlier tuning used a TextKit 2
  in-memory measurement while the code was being switched to a TextKit 1
  replica; both must match the live view, which is TextKit 2. Japanese
  word-level annotations grew lines (ja ~37 vs zh ~29 at the same settings);
  per-kanji Japanese furigana (`buildRuby`, 2026-08-23) equalizes the
  annotation size across scripts so the engine sizes every line the same.
- The Android paragraph gets the same `lineHeight` and draws the reading
  inside its span box; the pitch math (≥ base glyph body + reading glyph body)
  makes it fit.

### Base font / CJK glyphs (2026-08-24)

The base text uses the **system font**, and each base + reading run is tagged
with the L2 BCP-47 language (`kCTLanguageAttributeName`), so Core Text's CJK
fallback picks the correct script font and glyph variants (spec: SPEC-088).
`glyphFontFamily` is no longer forced on the base — forcing Hiragino for ja
grew the line pitch (45 vs the 39 pin) and broke consistent spacing across
scripts; the system font's tight, uniform metrics keep every script on the
pin, and the language tag renders the correct simplified/traditional/Japanese/
Korean forms.

**Verification logs** (keep these; they are the audit trail):

- JS: `RUBY-PITCH` (one-shot per layout; global logger) — every input plus
  the pinned `paragraphLineHeight`/`gridLineHeight`.
- iOS native: `line-grid-tk2` (per-line y/height/ascender of the replica),
  `ruby-fit` (line 0: fragment top/height vs base baseline vs reading
  top/bottom, overlap, and the with-ruby vs ruby-free H/B deltas — this is
  the evidence if readings ever overlap or a line grows out of the pin).
- Diagnostics dict: `line0` (same numbers via
  `getParagraphDiagnosticsForTag`).
- Android native: `line-grid-android` (its own live layout).
- **Furigana↔base gap (tuned 2026-08-23):** the readings rendered ~2px too high
  (gap too wide) on zh/yue/ru/ar. `rubyBaseTextOffset` is now `+2`, which
  raises the base toward the Core Text ruby annotation and closes the gap
  (previously `0` — tuned 2026-08-22 to the natural gap). Applies to
  `RubyTextParagraphView.swift` and `RubyTextView.swift`. The `diagnostics`
  dict reports base/reading ascender/descender/capHeight, `lineHeight`, and
  `rubyBaseTextOffset` so the gap can be verified from the Metro log.

### Anti-blank measure gate (2026-08-27)

Fabric/Yoga cannot size a custom host view, so JS measures the native
paragraph with an invisible RN `<Text>` and passes the box via `style`. That
measuring `<Text>` is `position: absolute`, so it contributes **no** height to
the wrapper. Until `onLayout` lands, the paragraph renderer used to gate the
native view behind `measured && measured.sizeKey === sizeKey` and have no other
in-flow child — so on a page-content remount (page turn, or a boundary refine
that changed the visible slice) the wrapper collapsed to height 0 and painted
nothing for a frame, and again on any content/size change that bumped
`sizeKey`. That is the reader's "flashes a blank between pages" symptom.

Rules added in `RubyText.tsx` (`RubyTextParagraph`):

1. **Never blank on the mount measure.** A visible in-flow fallback `<Text>`
   (identical `fontSize` / `gridLineHeight` (/line pitch) / `fontWeight` /
   `fontFamily` / the first run's L2 foreground color) is rendered for the
   frame before the first `onLayout`, so the wrapper always reserves its real
   height and the paragraph never collapses to a zero-height blank. The
   fallback is removed the moment a box exists.
2. **Keep the native view mounted across `sizeKey` changes.** The previous
   `measured.sizeKey === sizeKey` gate unmounted the native view (→ blank)
   until the measuring Text re-fired `onLayout`. Now it keeps painting with the
   last-known box and corrects on re-measure, so a plain→tokenized transition
   (identical `plainText`, metrics, and `sizeKey` — so the native view is not
   re-measured at all) and a width/zoom change never blank the paragraph.

`gridLineHeight` remains the real L2 pitch (linePitch), so the fallback and the
native view agree on the box. `onLineGrid` is still reported from the invisible
measuring text's `onTextLayout` and then the native view's grid, so translation
baseline alignment is unchanged. Dev log: `paragraph re-measure keep-mounted`
(in `RubyText.tsx`) plus `page content (re)mount` (in `PaginatedReader.tsx`)
correlate any remaining flash with a content remount.

---

## Reference

- Module source: `apps/mobile/modules/ruby-text/` (`ios/RubyTextView.swift`,
  `ios/RubyTextParagraphView.swift`, `ios/RubyTextModule.swift`,
  `android/…`, `src/index.ts`)
- Component plumbing: `apps/mobile/components/RubyText.tsx`,
  `apps/mobile/components/TokenizedText.tsx`
- Line metrics: `apps/mobile/lib/ruby-layout.ts` (`computeRubyLayout` —
  `readingBand` / `linePitch`), `packages/utils/src/furigana.ts`
  (`buildRuby()` — per-character pinyin for zh/yue since `2eb07fcc`;
  word-level for ja)
- Audit logs: `RUBY-PITCH` (JS), `line-grid-tk1` + `ruby-fit` (iOS native),
  `line-grid-android` (Android native), `paragraph ruby-height correction` (JS)
- Incident record: `docs/versioning/build-ledger.md` → "Incident log"
- Preserved known-good Debug binary (iPad 10):
  `.dev-builds/ipad10-backup/LanguagePlayer3-ipad10-working-debug-3.1.0-b3.app.zip`
