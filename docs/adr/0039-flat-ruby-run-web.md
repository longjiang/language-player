# ADR-0039: Flat Ruby Run on Web

- **Status**: Accepted
- **Created**: 2026-08-16
- **Last updated**: 2026-08-16 (matches the implemented code)
- **Scope**: Web (`apps/web`)

## Context

Web renders furigana/pinyin/jyutping with real `<ruby>/<rt>` elements, but the
DOM isolates every word in its own inline box. `TokenSpan`
(`apps/web/src/components/token-span.tsx`) wraps each token in two nested
spans — the clickable wrapper (`cursor-pointer rounded hover:bg-muted/80`) and
the saved-word background span — so the actual structure per token is:

```html
<span class="cursor-pointer rounded transition-opacity hover:bg-muted/80" title="青豆">
  <span class="">
    <ruby>青豆<rt class="select-none" dir="ltr">あおまめ</rt></ruby>
  </span>
</span>
```

Those are inline boxes, so base text still flows and wraps across tokens. But
each `<ruby>` is confined to its own token-sized box: the reading can never
overhang into neighboring punctuation blanks or line edges, and no
cross-token distribution (jukugo) is possible. The engine never sees the
annotations of adjacent tokens in the same layout context.

This is exactly the limitation ADR-0038 addressed on mobile with
`RubyTextParagraph`: one flat text run per block (per-token `RubySegment[]`
flattened into a single attributed string / Canvas draw) so neighbor glyphs
participate in one layout. Mobile's flat model exists because React Native
has no ruby support. Web has no such excuse — the DOM already has the
primitives; the per-token wrappers are what stands in the way.

The CSS platform has caught up with the typography side:

- `ruby-overhang` ([Chromestatus](https://chromestatuslite.com/feature/6560118298771456),
  [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/ruby-overhang))
  lets annotations overhang adjacent content (whitespace / punctuation blanks /
  line edges) when the reading is wider than its base. Supported in
  Safari 18.2+ and Chrome/Edge/WebView 151+ (September 2026; current spec
  values are `auto | none`).
- Engines without overhang support (Chrome < 151, Firefox, as of writing)
  render each ruby segment centered over its base — identical to today's
  output, so removing the wrappers is a strict improvement: it can only
  unlock typography that was previously impossible, never make it worse.

The only reason the wrappers exist is interactivity and styling: click → token
dictionary popup, `title` tooltip, hover background, saved-word highlight,
highlight ring, karaoke dimming, quiz blanking, quick gloss, interlinear
definitions, byeonggi, and markdown format wrappers (bold/italic/code/mark/
link).

## Decision

Render block-level tokenized text as a **flat run of bare `<ruby>` elements**:
every ruby segment from `buildRuby()` becomes a direct inline sibling in the
line box, with **no wrapping span per token**. Non-word tokens (punctuation,
whitespace, newlines) stay bare text nodes / `<br>`, exactly as today. The
line-level style span (`font-size`, `line-height`) remains — a single inline
box around the whole run does not isolate rubies from each other.

### Where it applies

`TokenizedText` picks the renderer per line, mirroring ADR-0038's selection
rule `useParagraph = NATIVE_PARAGRAPH_ACTIVE && !showDefinition`:

1. **Flat ruby run** — when interlinear definitions are off
   (`showDefinition === false`).
2. **Boxed `TokenSpan` (today's renderer)** — when interlinear definitions are
   on: the definition slot needs a token column under every word, which is a
   vertical layout the flat run cannot express.

Quick gloss and byeonggi are trailing inline text after the word and do not
force the boxed path: JIS-style overhang is only allowed into punctuation
blanks and line edges, never into real text, so an intervening gloss span
changes nothing typographically.

### Interactivity without wrappers

All per-token behavior moves onto the `<ruby>` element itself:

- `onClick` (token popup) with `getBoundingClientRect()` anchoring — the ruby
  rect is the token rect when no overhang is applied, and the popup anchors
  fine when there is.
- `title` tooltip, `cursor-pointer`, hover background, `rounded`, and the
  karaoke `opacity-40` class — all directly on the ruby element.
- Saved-word / search / entry-id highlights: background and `ring`/box-shadow
  classes on the ruby element. Background and box-shadow are layout-neutral —
  they never re-create a box boundary.

**Only layout-neutral properties are allowed on ruby elements in the flat
run**: background, box-shadow, opacity, color, font-style, font-weight,
font-family, underline/decoration, border-radius (paints the background).
No padding, border, margin, or `inline-flex` — those would re-create the
token box and defeat the change.

Segments without a reading (kana inside a ruby-bearing word) and word tokens
with no ruby at all (pure kana, `phoneticsMode === 'word'`) still need a click
target: they render as minimal inline `<span>` elements carrying the exact
same classes, `title`, and `onClick` as the ruby segments. A plain text span
between rubies is typographically inert — JIS-style overhang never extends
into real text, only into punctuation blanks and line edges.

### Quiz mode and markdown formats

- Quiz blanking: the `＿` placeholder renders as a single span carrying the
  segment classes (cursor, hover, reveal-on-click) plus the muted placeholder
  styling — boxed-mode parity, no token column.
- Markdown formats (`formats` prop): folded into element classes instead of
  `<strong>/<em>/<mark>/<code>/<link>` wrappers — `font-semibold`,
  `italic`, `bg-primary/40`, `font-mono`, `text-primary underline`. The
  `code` and `mark` formats' horizontal padding is dropped in flat mode
  (padding is a box-model property); the boxed path keeps it.

### CSS

Add to the global `ruby` rule (`apps/web/src/app/globals.css`):

```css
ruby {
  ruby-align: center;
  ruby-overhang: auto; /* progressive: Safari 18.2+, Chrome 151+; no-op elsewhere */
}
```

`ruby-align: center` remains the fallback for engines without overhang.

## Alternatives considered

1. **One `<ruby>` container per line with `<rb>/<rt>` pairs** — the strongest
   typography (true group distribution across the whole jukugo run), but it
   destroys per-token hit-testing: clicks must be mapped from base-glyph
   rectangles back to token ids, i.e. web would have to rebuild mobile's
   native-tap machinery in JS. Rejected for now; revisit only if token
   interactivity ever moves off per-element events.
2. **Keep the wrappers, add `ruby-overhang`** — has no effect: overhang cannot
   cross the wrapper's box boundary. Rejected.
3. **Fabric/Canvas or native module on web** — recreating mobile's ADR-0038
   machinery in a browser that already has the primitives. Rejected.

## Known limitations

- **Per-ruby highlights** paint the whole ruby box (base + reading slot),
  the same limitation as mobile's per-token native view (ADR-0038).
- **Overhang scope**: only into whitespace, punctuation blanks, and line
  edges, per JIS rules — never into adjacent real text, and never where it
  would collide with another `<rt>`. Where the engine lacks `ruby-overhang`
  (Chrome < 151, Firefox), output is byte-identical to today.
- **Group distribution** across *separate* `<ruby>` elements is not
  guaranteed by engines; full jukugo distribution needs Alternative 1.
- **Interlinear definition mode** keeps the boxed renderer (see above).

## Consequences

- Ruby in the reader, subtitles, and AI explanations flows as one continuous
  text run; readings overhang where the engine supports it, and nothing
  artificial clips them at token boundaries anymore.
- Token clickability, popups, tooltips, highlights, quiz, karaoke, and
  byeonggi are all preserved with zero layout cost — events and styles ride
  on the ruby elements themselves.
- DOM shrinks (two spans per token removed) — a mild win for long reader
  paragraphs.
- `buildRuby()` / `RubySegment[]` from `@langplayer/utils` stays the shared
  input; the JS bridge change is confined to `apps/web`
  (`tokenized-text.tsx`, `token-span.tsx`, `globals.css`). Mobile is
  unaffected.
- Both platforms now converge on the same model: one flat text run per line —
  mobile via native attributed runs (ADR-0038), web via bare `<ruby>`
  siblings.
