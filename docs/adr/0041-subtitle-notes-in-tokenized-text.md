# ADR-0041 — Render subtitle `[n]` notes inside TokenizedText

**Status:** Accepted (2026-09-06)

## Context

Classical/literary videos carry an annotations column on the video row
(`notes`, a CSV of `id,note`) and embed `[n]` markers in the `subs_l2` line
text (e.g. `酒德颂[1]先生`). The classic Nuxt app renders these as a
`PopupNote` solid-circle badge that opens the note content on tap
(`zerotohero-nuxt/components/PopupNote.vue`). The modern web and mobile apps
had no equivalent: `[n]` markers just appeared as raw bracket text inside the
tokenized subtitles (and the lemmatizer was fed the brackets too).

## Decision

Integrate note rendering directly into `TokenizedText` (web + mobile) via a
`notes?: VideoNote[]` prop, rather than wrapping `TokenizedText` with a
segment-splitting component.

1. **Strip at the render boundary.** When `notes` is present, `TokenizedText`
   runs `extractNoteMarkers(text)` to remove `[n]` markers before tokenization
   and records each marker's char offset in the clean text. The lemmatizer only
   ever sees clean, marker-free text.
2. **Weave badges by offset.** `renderItems` interleaves the display tokens
   with note badges at the recorded token boundaries, so a badge sits exactly
   where its `[n]` marker was (mirroring the existing inline-image mechanism).
3. **Same-dialog surface.** Tapping a badge opens a lightweight `NotePopup`
   dialog built on the same `Dialog` primitive as the dictionary popup
   (shadcn/Radix on web, `@rn-primitives/dialog` on mobile), and it uses the
   existing reader-tap suppression so a dismissed popup never replays the line.
4. **Notes ride on the video object.** The backend exposes the raw `notes` CSV
   on `/videos` and `/subs-search`; clients parse it (`parseNotes`) into
   `VideoNote[]` and pass it down wherever subtitles render.

## Consequences

- The clean text flows everywhere downstream (offsets, sentence context,
  karaoke, selection), so note markers never poison tokenization or word
  alignment.
- Mobile note-bearing lines bypass the native single attributed-string
  paragraph (`RubyTextParagraph`) — it cannot draw interactive inline badges —
  and use the JS flex path instead, so ruby/gloss rendering is preserved while
  badges render as flex items.
- Callers that do not pass `notes` are unaffected (no markers stripped, no
  badges). The feature is opt-in per video.
- The compact subs-search result row draws note-number badges but keeps them
  non-interactive on mobile (a nested `Pressable` cannot live inside the RN
  `<Text>` renderer, and the row already opens the playback modal); the full
  interactive note line renders once the playback modal / watch page opens.

## Alternatives Considered

- **Wrapper around `TokenizedText`** that splits each line into
  `[clean-segment] + [badge]` and tokenizes each segment independently. Rejected:
  it breaks sentence context and karaoke continuity across segment boundaries
  and complicates every caller.
- **Reusing the full dictionary popup shell** for note content. Rejected: it
  couples note display to dictionary internals and is heavier than needed.
