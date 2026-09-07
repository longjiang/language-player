# Video Subtitle Notes (`[n]` Markers)

## Metadata
- **Spec ID**: SPEC-093
- **Feature**: Video subtitle notes
- **Status**: complete
- **Created**: 2026-09-06
- **ROADMAP Phase**: Phase 3: Explore + Video Player

## Overview
Some videos (notably classical/literary texts, e.g. 酒德颂) carry an
annotations column (`notes`) on the video row. The `subs_l2` subtitle line text
embeds `[n]` markers that reference those annotations — e.g. `酒德颂[1]先生` where
`[1]` maps to `酒德：饮酒的德性。`. This feature parses those markers and renders
each as a solid-circle number badge inline in the tokenized subtitle text.
Tapping a badge opens a small dialog showing the note's content. It ports the
classic `PopupNote` behavior to the modern web and mobile apps.

## User Stories
- As a learner of classical literature, I want to tap a numbered note marker
  in the subtitles to see what a term means without leaving the transcript.
- As a viewer, I want the note markers to appear as clean numbered circles
  rather than raw `[n]` bracket text.

## How It Works in Classic (Nuxt)
- `plugins/subs.js` — `parseNotes(csv)` parses the CSV `id,note` column into
  `[{id: number, note}]`; `unparseNotes` reverses it.
- `components/TranscriptLine.vue` — `lineHtml()` replaces `[n]` with
  `<PopupNote :number :content>`.
- `components/PopupNote.vue` — renders a solid circle with the number, and on
  click emits `showPopupDictionary` with the note content.

## Implementation Plan (Next.js + Mobile)

### Data Flow
1. The backend `/videos` (and `/subs-search`) responses now include the raw
   `notes` CSV string (`zerotohero-python-server/utils_content.py`).
2. Clients parse it with `parseNotes()` into `VideoNote[]` and attach it to the
   `YouTubeVideo` / `SubsSearchVideo` object (`notes`).
3. `TokenizedText` receives a `notes` prop. When present it strips `[n]`
   markers from each line (`extractNoteMarkers`), tokenizes the clean text, and
   weaves a note badge at each marker's char offset.
4. Tapping a badge opens a lightweight `NotePopup` dialog showing the note.

### Components
- `packages/shared/src/types.ts` — `VideoNote`, `SubtitleNoteMarker` types;
  `notes?` on `YouTubeVideo` and `SubsSearchVideo`.
- `packages/utils/src/subs-csv.ts` — `parseNotes(csv)`, `extractNoteMarkers(text)`.
- `apps/web/src/components/tokenized-text.tsx` + `apps/mobile/components/TokenizedText.tsx`
  — accept `notes`, strip `[n]`, weave badges, open the dialog.
- `apps/web/src/components/note-popup.tsx` / `apps/mobile/components/note-popup.tsx`
  — `NoteBadge` (solid circle) + `NotePopup` (dialog).
- `apps/web/src/components/video/subtitle-display.tsx` / `apps/mobile/components/video/SubtitleDisplay.tsx`
  — `notes` prop threaded to `TokenizedText`.

### Subtitle Surfaces Covered
- Watch page subtitles-mode band + transcript (web + mobile).
- Subs-search playback modal (web + mobile).
- Subs-search result rows — markers are stripped and a note-number badge drawn;
  the full interactive line appears when the row opens the playback modal
  (mobile row badges are non-interactive previews).
- AI explanation examples (web + mobile).

### API Endpoints
- `GET /api/videos/[videoId]` (web) — now returns `video.notes` (parsed).
- `GET /videos` + `GET /subs-search` (Flask) — now include the raw `notes` CSV.

### States
- **No notes**: markers render as raw `[n]` text (unchanged, no `notes` prop).
- **Notes present**: markers become solid-circle badges; clean text shown.
- **Note content missing** for a marker id: the badge renders dimmed and opens
  an empty dialog.
- **Edge cases**: a note badge tap never replays the line (`stopPropagation` /
  reader-tap suppression); the lemmatizer never sees `[n]` (markers stripped
  before tokenization).

## Dependencies
- `@langplayer/shared`, `@langplayer/utils`
- Classic `PopupNote` → modern port (see docs/arch/001-classic-app-architecture.md)

## Open Questions
- Whether to display note badges in the web subs-search result row's compact
  `HighlightTerms` preview fully interactively (currently the row shows the
  badge; the interactive line is in the playback modal). Consider follow-up.
