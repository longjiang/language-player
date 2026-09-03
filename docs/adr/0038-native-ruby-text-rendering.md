# ADR-0038: Native Ruby Text Rendering on Mobile

- **Status**: Accepted
- **Created**: 2026-08-15
- **Last updated**: 2026-09-03 (Android paragraph described as implemented:
  AppCompatTextView + spans, span-free plain runs; line grid in dp;
  LineHeightSpan baseline pin)
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
  attributed string, drawn by TextKit.
- Android: `android.text.style.RubySpan` (Android 12+) exists, but the local
  module does **not** use it — see the Android notes below.

## Decision

Add a local Expo module, `apps/mobile/modules/ruby-text`, exposing two native
views backed by the platform text engines: a **per-token** `RubyText` view and
a **paragraph-level** `RubyTextParagraph` view.

### Per-token view (`RubyText`)

One native view per ruby segment (kanji↔reading pair from `buildRuby()`):

- **iOS** (`RubyTextView.swift`): a `UILabel` with an attributed string that
  applies `CTRubyAnnotation` per kanji↔reading pair via
  `CTRubyAnnotationCreateWithAttributes` (alignment `.center`, overhang
  `.auto`, position `.before`). The reading is drawn in the reserved reading
  slot above the base text; the base `UILabel` is offset below that slot.
  The reading can carry its own muted color (see Known limitations).
- **Android** (`RubyTextView.kt`): a custom `ExpoView` that draws base text +
  reading directly in its own `draw(canvas)` with `Paint`. The framework
  `RubySpan`/`ReplacementSpan` is deliberately **not** used: under
  Fabric/Yoga a child `TextView` added in `init` is never laid out or drawn
  (stays 0x0, spans never render), so the view paints itself. Works on all
  API levels.

### Paragraph-level view (`RubyTextParagraph`)

One native view per block of tokens (the whole reader paragraph / subtitle
line as a single layout):

- **iOS** (`RubyTextParagraphView.swift`): a `UITextView` with ONE attributed
  string for the whole block, so Core Text lays out every neighbor glyph
  together and `CTRubyAlignment`/`CTRubyOverhang` compute against adjacent
  tokens (JIS-style overhang into punctuation blanks and at line edges,
  group distribution across a jukugo) instead of one token-sized box at a
  time.
- **Android** (`RubyTextParagraphView.kt`): an `AppCompatTextView` with ONE
  `SpannableStringBuilder` for the whole block (SPEC-084 Task 2 rewrite of the
  original Canvas-painted ExpoView, which could not host native text
  selection). `RubyReplacementSpan`s paint the reading above their base text.
  The spans are attached ONLY to ruby-bearing word runs: a `ReplacementSpan`
  is atomic to Android's line breaker, so span-free runs (punctuation,
  whitespace, the pre-tokenization whole-block run) wrap character by
  character. When every run was spanned, each token rendered as one
  unbreakable "word" and the pre-tokenization plain render didn't wrap at all
  (2026-09-03 fix). The view's `textLocale` (from the `language` prop) drives
  locale-sensitive glyph fallback for the span-free runs.
  The line box is pinned with a `LineHeightSpan` (2026-09-03 baseline fix,
  supersedes the original `setLineSpacing` pin): the extra leading is
  absorbed into the TOP of each line so span-free runs and ruby spans share
  ONE baseline — previously `setLineSpacing` put the extra BELOW the descent,
  and punctuation painted high in the line box while ruby words anchored at
  the box bottom (see ARCH-030 "Android baseline pin").

### JS bridge (`apps/mobile/components/RubyText.tsx`)

- `RubyText` (per-token): reuses the `RubySegment[]` output of `buildRuby()`
  from `@langplayer/utils`; falls back to the View-column renderer when the
  native module is absent.
- `RubyTextParagraph` (paragraph-level): converts per-token `RubySegment[]`
  runs into a flat `runs[]` list (text + reading + per-run
  color/readingColor/bold/underline/background/opacity) and maps native taps
  back to token ids.
- Availability probes: `isNativeRubyActive()` and
  `isNativeRubyParagraphActive()`; a `NATIVE_RUBY_ENABLED` kill switch
  disables the native path without further code changes.

### Render-path selection (`TokenizedText`)

`TokenizedText` picks a renderer per block, in this order:

1. **Paragraph renderer** — when `NATIVE_PARAGRAPH_ACTIVE` and inline
   definitions are off (`useParagraph = NATIVE_PARAGRAPH_ACTIVE &&
   !showDefinition`).
2. **Per-token native** (`RubyTokenFlat`) — when `NATIVE_RUBY_ACTIVE` and
   inline definitions are off.
3. **View-column fallback** (`RubyTokenSpan`, one `Pressable` column per
   token) — when the native module is missing (Expo Go), or when inline
   definitions are on (the definition slot needs a token column under every
   word).

### Sizing contract

Fabric/Yoga does not measure custom host views, so the native views cannot be
flex children with intrinsic width. Instead:

- **Per-token `RubyText`**: renders the existing View-column fallback once,
  reads its box via `onLayout`, and hands that exact width/height to the
  native view. The swap is layout-neutral: line wrapping, baseline alignment,
  and the reserved reading slot (for tokens without ruby) are all unchanged.
- **Paragraph `RubyTextParagraph`**: renders an invisible RN `Text` with the
  same font/line-height as the native layout, measures it via `onLayout`, and
  hands the box to the native view. The measuring text stays mounted, so
  width changes (rotation, zoom) re-measure automatically.

Measurement resets whenever glyph metrics or content change (font, zoom,
leading, segments/runs).

### Availability and fallback

The module only exists in builds compiled from this repo (development builds,
TestFlight, App Store, Play). Expo Go does not contain it, so `RubyText`
checks `requireOptionalNativeModule('RubyText')` at runtime and falls back to
the View-column renderer there; `RubyTextParagraph` renders nothing and
`TokenizedText` uses the per-token/View-column path instead.

### Known limitations

- **iOS reading color**: the reading can carry a separate muted color via
  `kCTForegroundColorAttributeName` in the `CTRubyAnnotation` attributes.
  Android draws the reading with its own `readingPaint` color. Both platforms
  support a muted reading color (web's per-ruby CSS equivalent).
- **Android paragraph renderer** applies ruby spans per run: readings are
  centered over each run and never overhang, and the spanned (ruby-bearing)
  runs stay atomic to the line breaker. iOS gets real overhang/distribution
  via Core Text, and its ruby-annotated runs can still break across lines.
- **Per-token highlights**: saved-word and search highlights are applied to
  the whole native token box rather than just the base glyph run. The
  paragraph renderer applies highlights per run instead.
- **Inline markdown**: ruby inside bold/italic markdown segments flows only
  through the paragraph renderer, which handles a full block; per-token
  rendering of inline-formatted segments is not supported.

## Consequences

- Ruby in the reader uses real platform text layout when available, with the
  View-column renderer preserved as a fallback.
- The native module is autolinked by `expo prebuild`; `ios/` and `android/`
  stay generated/gitignored, while `modules/ruby-text/` is committed. The
  user-level gitignore's bare `ios`/`android` patterns are negated for this
  module in `apps/mobile/.gitignore`.
- Dev workflow changes from Expo Go to a development build
  (`npx expo run:ios` / `run:android`) for native rendering; Metro Fast
  Refresh still works for JS-only edits. Native edits require a rebuild.
- The paragraph-level view is the path for future inline markdown + ruby (AI
  explanations, settings preview), where the JS supplies the paragraph width
  instead of a measured token box.

## Known pitfalls

- **2026-08-16**: Debug-only furigana paint failure caused by a `#if DEBUG`
  diagnostics helper forcing `textView.layoutManager` layout on the paragraph
  view (see [ARCH-030](../arch/030-ruby-text-native-rendering.md) — "The
  logLineFragments incident" for the full evidence chain and rules). Never
  force layout on a live text view from diagnostics.
