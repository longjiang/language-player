# ADR-0038: Native Ruby Text Rendering on Mobile

- **Status**: Accepted
- **Created**: 2026-08-15
- **Scope**: Mobile (`apps/mobile`)

## Context

Web renders furigana/pinyin/jyutping with real `<ruby>/<rt>` layout via the
browser's text engine. React Native has no ruby support, so mobile rendered
each ruby-annotated word as a column of `View`s: the reading stacked above the
base text. That approximation cannot do real ruby typography — group/jukugo
distribution, overhang, ruby-aware line breaking — and it cannot flow ruby
inside inline-formatted text (bold/italic markdown segments), because boxes
are not a text engine.

Both platforms ship native ruby support:

- iOS/macOS: `kCTRubyAnnotationAttributeName` + `CTRubyAnnotation` on an
  attributed string, drawn by TextKit/`UILabel`.
- Android: `android.text.style.RubySpan` (Android 12+); older devices need a
  custom `ReplacementSpan`.

## Decision

Add a local Expo module, `apps/mobile/modules/ruby-text`, that exposes a
`RubyText` native view backed by those platform text engines:

- **iOS** (`RubyTextView.swift`): a `UILabel` with an attributed string that
  applies `CTRubyAnnotation` per kanji↔reading pair. Alignment/overhang/size
  factor follow the platform engine (`CTRubyAlignment.auto`, 0.5 overhang,
  `readingSize / fontSize`).
- **Android** (`RubyTextView.kt`): a `TextView` whose `SpannableString` uses
  the framework `RubySpan` on API 31+ and a `ReplacementSpan` fallback below
  that.
- **JS bridge** (`apps/mobile/components/RubyText.tsx`): the component used by
  `TokenizedText`'s token spans. It reuses the existing `RubySegment[]` output
  of `buildRuby()` from `@langplayer/utils`.

### Sizing contract

Fabric/Yoga does not measure custom host views, so the native view cannot be a
flex child with intrinsic width. Instead, `RubyText` renders the existing
View-column fallback once, reads its box via `onLayout`, and hands that exact
width/height to the native view. The swap is layout-neutral: line wrapping,
baseline alignment, and the reserved reading slot (for tokens without ruby)
are all unchanged. The measurement resets whenever glyph metrics or content
change (font, zoom, leading, segments).

### Availability and fallback

The module only exists in builds compiled from this repo (development builds,
TestFlight, App Store, Play). Expo Go does not contain it, so `RubyText`
checks `requireOptionalNativeModule('RubyText')` at runtime and falls back to
the previous View-column renderer there. A `NATIVE_RUBY_ENABLED` kill switch
in `RubyText.tsx` can disable the native path without further code changes.

### Known limitations

- Both platform engines render the reading in the base text's color; a
  separate muted reading color is not currently possible (web can do it with
  CSS). The `readingColor` prop is intentionally absent.
- Saved-word and search highlights are applied to the whole native token box
  rather than just the base glyph run.
- Android < 12 uses the simpler custom span: centered reading, no
  distribution/overhang.

## Consequences

- Ruby in the reader now uses real platform text layout when available, with
  the old renderer preserved as a byte-for-byte fallback.
- The native module is autolinked by `expo prebuild`; `ios/` and `android/`
  stay generated/gitignored, while `modules/ruby-text/` is committed. The
  user-level gitignore's bare `ios`/`android` patterns are negated for this
  module in `apps/mobile/.gitignore`.
- Dev workflow changes from Expo Go to a development build
  (`npx expo run:ios` / `run:android`) for native rendering; Metro Fast
  Refresh still works for JS-only edits. Native edits require a rebuild.
- Future inline markdown + ruby (AI explanations, settings preview) can build
  on the same native view at paragraph level, where the JS supplies the
  paragraph width instead of a measured token box.
