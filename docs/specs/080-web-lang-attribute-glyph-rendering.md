# SPEC-080 — Web: `lang` Attribute Rules for Correct CJK Glyph Rendering

## Metadata

- **Spec ID**: SPEC-080
- **Feature**: Correct CJK glyph rendering via `lang` attributes
- **Status**: draft
- **Created**: (today)
- **ROADMAP Phase**: Web polish

## Overview

Many scripts reuse a shared set of codepoints but must be **typeset with
different regional glyph variants**. The canonical case is Han (CJK)
ideographs: a single codepoint like 骨, 直, or 免 renders differently in
**Japanese** (`ja`), **Simplified Chinese** (`zh-Hans`), and **Traditional
Chinese** (`zh-Hant`). The browser decides which variant to draw from the
`lang` attribute on the element, so an element whose content is Japanese but
whose nearest tagged ancestor is Simplified Chinese renders Chinese glyphs in
a Japanese word — a subtle, hard-to-notice defect for a language learning
product whose whole job is showing authentic text.

In `apps/web` the `<html lang>` is set to the **L1** (UI locale), but L2
(content) text — subtitles, transcripts, dictionary entries, reader/epub
pages, examples, collocations, inflections, saved words — lives in the same
DOM as L1 UI strings. There is no single page-wide content lang we can set,
so each L2 container must be tagged explicitly. `lang=` is already applied to
some L2 containers (reader, parts of the dictionary) but inconsistently, and
some uses pass ambiguous Han codes (`zh`, `yue`, `lzh`, `nan`) that do not
select a glyph variant.

This spec defines the rules for tagging DOM elements so CJK (and any future
shared-script) text renders with the correct glyphs.

## User Stories

- As a **Japanese learner**, I want Japanese text to render with Japanese kanji
  glyphs (not simplified-Chinese shapes) even when the app UI is in English or
  Chinese, so the words I'm studying look right.
- As a **Chinese learner** using the simplified/traditional setting, I want
  dictionary headwords to render in the glyph style matching my choice.

## Rules

### Rule 1 — Tag the container, not every leaf

The `lang` attribute **inherits** to descendants. Set it once on the
outermost element whose text is entirely one language, and let children
inherit. Do **not** add `lang` to every token `<span>` or word node — it is
redundant and noisy. Only add a `lang` to a child when that child's text is in
a language different from its nearest tagged ancestor (see Rule 4).

### Rule 2 — Two domains, two codes

There are exactly two language domains on any page:

- **UI / interface strings → L1.** Already handled by `<html lang={l1.code}>`
  (set in `language-provider.tsx` and `locale-provider.tsx`) and by the
  next-intl `locale`. No per-element work is needed for UI text.
- **L2 content → `lang={l2.code}`.** Any container that renders L2 text must
  set `lang` to the content language. This is the gap this spec closes.

Every element whose text is in a language different from its nearest tagged
ancestor must override that ancestor's `lang` with its own.

### Rule 3 — Resolve a glyph-safe BCP47 tag from the language **and** the user's script preference

The `lang` value must be specific enough for the browser to pick a glyph
variant. Use the exact `l2.code` when it is unambiguous (`ja`, `zh-Hans`,
`zh-Hant`, `ko`). For Han codes **without** a script subtag (`zh`, `yue`,
`lzh`, `zh-*`), the tag is **not** fixed — it must respect the user's
simplified-vs-traditional setting (a per-language toggle in
`settings-provider`, read via `useScriptPreference(l2Code).useTraditional`).
So the resolution is settings-driven, not a pure function:

| Source code | Emitted `lang` | Why |
|---|---|---|
| `zh-Hans` | `zh-Hans` | already specific |
| `zh-Hant` | `zh-Hant` | already specific |
| `ja` | `ja` | already specific (never re-mapped by the Han toggle) |
| `ko` | `ko` | Hangul/한자 not ambiguous with CJK glyphs |
| `zh`, `yue`, `lzh`, `zh-*` | `zh-Hant` if `useTraditional`, else `zh-Hans` | **depends on the user's script preference** |

> Note: a few Han dialects (`nan`, `hak`, `wuu`, `hsn`, `cjy`, `lzh`, …) are
> conventionally written in traditional characters, but the app's own script
> toggle for Chinese (`zh`, `yue`, `lzh`, `zh-*`) is what governs display, so
> follow the preference for those, too. `ja` is exempt — it is its own glyph
> domain and must never be turned into `zh-Hant`/`zh-Hans`.

**This is why the helper cannot be a plain pure function** — it needs the
user's preference. Concretely, a helper like `glyphLangTag(code,
useTraditional)` in `lib/language-data.ts` (pure, preference passed in) is
fed from the existing `useScriptPreference(l2Code)` hook at the call site.
Never inline the mapping, and never hardcode a `zh`→script guess that ignores
the setting.

There is a second, related nuance to keep in mind when applying Rule 3:
dictionary **headwords and their alternate forms** are script-swapped by
`useScriptPreference().apply()` so the *preferred* form is the primary head.
Tag the head with the preference-resolved tag. **Authored content** (subtitle
lines, reader text, examples) is already written in a specific script, so tag
it to match the script it is actually in — the preference toggle does not
rewrite that text, it only affects which script the app *displays* for
dictionary forms.

### Rule 4 — Keep L1/L2 attribution separate on paired elements

Where L2 text and its L1 translation render together (subtitle line + its
translation, dictionary example + gloss), each element carries its **own**
`lang` (`l2.code` / `glyphLangTag(l2.code)` for the content, `l1.code` for the
translation). Do not let one container's `lang` leak to the other, and do not
rely on a single wrapper's `lang` when the two pieces differ.

### Rule 5 — Inherently-scripted elements stay hardcoded

**Why `lang="ja"` stays in pitch-accent:** `PitchAccent` (`components/pitch-accent.tsx`)
renders a kana string split into moras with ↑/↓ pitch arrows. The string is
always Japanese orthography — kana + accent marks — regardless of which L2 is
being learned. Its script domain is fixed and unambiguous, so the literal tag
is correct and should not be re-derived from `l2.code` (doing so would be
wrong if the L2 is, say, simplified Chinese). A hardcoded `lang` is only
acceptable when the content is intrinsically that script and not subject to
the user's preference.

**Why bare `lang="zh"` becomes `zh-Hans`:** several `lang="zh"` spans in the
dictionary render **simplified Chinese** content that is fixed at authoring
time (e.g. character-decomposition `cl.simplified`). Tagging them `zh` is
underspecified for glyph selection, and the content is not preference-swapped
here, so they should be `zh-Hans`. The general rule: a hardcoded bare Han code
is almost always a bug — either make it script-tagged (Rule 3) or explain why
the script is fixed.

### Rule 6 — Fonts must actually carry the variants

**Why this rule is required:** `lang` does not change glyphs by itself. It
tells the browser *which variant to draw from a font family*. If the family
ships a single unified CJK face (e.g. one "Noto Sans CJK" file), it has one
set of glyphs — almost always simplified-Chinese-styled — so `lang="ja"` on
Japanese text has no effect and the text renders with Chinese glyph shapes.
That silently defeats the entire point of this work.

There are two correct arrangements:

1. **Per-script faces** — the font stack includes distinct CJK families with
   JP / SC / TC variants (Noto Sans **JP** / **SC** / **TC**). The browser
   maps `lang` → variant automatically. This is the cleanest option.
2. **One unified CJK face + explicit override** — when a single face must be
   used, set `font-lang` (WebKit/Blink) / `fontLanguageOverride` (Firefox) on
   the `lang`-tagged container to force that face's variant for the tagged
   language. Without the override, one face = one variant = no glyph
   differentiation.

The concrete work: audit `tailwind.config.ts` font families, confirm which CJK
faces are present and which script their glyphs default to, then either add
the per-script faces or apply `font-language-override` on lang-tagged
containers. Verify visually with codepoints that differ across ja / zh-Hans /
zh-Hant (骨, 直, 免, 画, 与, 关) in each L2 context.

### Rule 7 — Keep it lean: one pure helper, reuse what exists

Because `lang` inherits, we tag only a handful of *containers*, not leaves —
so there are few call sites and no need for a bespoke `<ContentLang>` wrapper
or a new `useContentLang` hook. The minimal surface is:

- `glyphLangTag(code, useTraditional)` — a **pure** mapper in
  `lib/language-data.ts` (Rule 3 table; takes the preference as a param so it
  stays testable).
- Feed it from the existing `useScriptPreference(l2Code).useTraditional`
  hook at the call site — no new state, no new context.

Don't add a `<ContentLang>` wrapper or dedicated hook until a repeated
pattern actually shows up. Prefer tagging each container inline with
`lang={glyphLangTag(l2.code, useTraditional)}` and its matching `dir` (Rule
8).

### Rule 8 — `lang` and `dir` are coupled: set both from the same resolved language

`dir` is **not** orthogonal to `lang`. `lang` and `dir` are two attributes of
the *same resolved language*, and BCP47 `lang` implies a script and therefore
a direction. If an L2 container sits inside an L1 page whose direction differs
(e.g. an RTL L2 like `ar` inside an LTR `en` UI), setting `lang` without `dir`
leaves the text direction wrong.

So the rule: whenever a container sets `lang` to a resolved language, it must
also set `dir` derived from that same language's script — using the single
`isRTL(code)` source (`lib/language-data.ts`) — never from a separate ad-hoc
check. The reader already does this (`dir={l2.direction === 'rtl' ? 'rtl' :
'ltr'}`); apply the same pairing everywhere `lang` is set on an L2 container.
Do not drive `dir` off the L1 when the container's content is L2.

## Implementation Plan (Next.js)

### Helper

- `glyphLangTag(code, useTraditional)` in `lib/language-data.ts` — pure mapper
  implementing the Rule 3 table. Unit tests for each row (esp. `zh`/`yue`/`lzh`
  flipping with the preference, and `ja`/`ko` staying fixed).

### Font stack (Rule 6)

- Audit `tailwind.config.ts` CJK font families; add per-script JP/SC/TC faces
  or apply `font-language-override` on lang-tagged containers.

### Components (Rules 1–8)

Apply to every place that renders L2 text — tag the L2 container with the
preference-resolved `lang` **and** its matching `dir` (Rule 8), leaving L1 UI
text to `<html lang>`:

- `components/video/subtitle-display.tsx` — transcript lines + their L1
  translations (Rule 4).
- `components/tokenized-text.tsx` / `token-span.tsx` — tokenized L2 text
  (Rule 4 for any L1 gloss shown inline).
- `components/dictionary-entry-card.tsx` and `components/dictionary/*`
  (examples, collocations, related, mistakes, word-list-sidebar,
  saved-word-entry-card, inline-definition) — L2 heads, examples, related
  forms (preference-resolved per Rule 3).
- `components/inflection-table.tsx` — L2 inflected forms.
- `components/reader/*` and epub reader — already set `lang` + `dir`; route
  the `lang` through the preference-resolved tag for Han codes.
- `components/save-button.tsx`, `voice-picker.tsx`, and any other surface
  rendering L2 text.

When applying, follow the "tag the container" rule — a handful of container
tags, not per-leaf changes.

## Dependencies

- `useScriptPreference()` hook (`hooks/use-script-preference.ts`) — existing.
- `settings-provider` `display.traditional` toggle — existing.

## Open Questions

- Should the font audit (Rule 6) ship as part of this spec or as a separate
  follow-up? Fonts without JP/SC/TC faces nullify the benefit of tagging, so
  it is listed as required here.

## Verification

- `npx turbo typecheck` and `npm run build:check -w apps/web`.
- Unit tests for `glyphLangTag(code, useTraditional)` covering the Rule 3
  table (esp. `zh`/`yue`/`lzh` flipping with the preference, and `ja`/`ko`
  staying fixed).
- A manual rendering check of ja / zh-Hans / zh-Hant pages with `traditional`
  toggled both ways, using the codepoints in Rule 6 (骨, 直, 免, 画, 与, 关),
  confirming the expected glyph per language.
- Grep that no bare `lang="zh"` remains in `apps/web/src` (should all be
  script-tagged per Rule 3/Rule 5).
