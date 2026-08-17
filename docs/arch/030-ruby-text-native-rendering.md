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
  `minimumLineHeight = maximumLineHeight = lineHeight` (line height already
  includes the reading slot), `byWordWrapping`.
- Ruby annotations are attached per run with `CTRubyAnnotationCreateWithAttributes`.
- **Lazy-layout safeguard**: UITextView lays out lazily; setting
  `attributedText` while the container is still zero-sized can leave the text
  blank. `layoutSubviews()` therefore re-applies the attributed string once
  real bounds exist (`hasLaidOutText`).
- Taps are mapped from `UITextView` input geometry back to run/token ids.

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

---

## Reference

- Module source: `apps/mobile/modules/ruby-text/` (`ios/RubyTextView.swift`,
  `ios/RubyTextParagraphView.swift`, `ios/RubyTextModule.swift`,
  `android/…`, `src/index.ts`)
- Component plumbing: `apps/mobile/components/RubyText.tsx`,
  `apps/mobile/components/TokenizedText.tsx`
- Readings source: `buildRuby()` in `packages/utils/src/furigana.ts`
  (per-character pinyin for zh/yue since `2eb07fcc`; word-level for ja)
- Incident record: `docs/versioning/build-ledger.md` → "Incident log"
- Preserved known-good Debug binary (iPad 10):
  `.dev-builds/ipad10-backup/LanguagePlayer3-ipad10-working-debug-3.1.0-b3.app.zip`
