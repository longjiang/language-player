# Video Watch Page Layout and UI

> **Status:** Proposed
> **Date:** 2026-07-23 (revised)
> **See also:**
> - `apps/web/src/app/[l1]/[l2]/watch/[videoId]/page.tsx` — current watch page
> - `apps/web/src/app/[l1]/[l2]/settings/page.tsx` — `playback.transcriptMode` setting
> - `apps/web/src/components/video/video-control-bar.tsx` — LP control bar (to be reduced)
> - `apps/web/src/components/video/subtitle-display.tsx` — subtitle rendering
> - `apps/web/src/components/video/transcript-queue-panel.tsx` — transcript + queue tabs
> - `apps/web/src/components/video/youtube-player.tsx` — YouTube IFrame player (native controls already visible)

---

## Context

The watch page currently has two layouts (narrow / wide) but only one _viewing mode_: the transcript is displayed in a tabbed panel alongside the video, with a custom LP control bar below the player. This control bar duplicates functionality that YouTube's native player already provides (play/pause, seek, progress, volume, speed, fullscreen) and adds only a few LP-specific controls (prev/next subtitle line, prev/next queue video, rewind).

A `playback.transcriptMode` setting already exists in the settings page (`'transcript'` | `'subtitles'`) but is not yet consumed by the watch page. This ADR defines how the watch page behaves in both modes and removes the custom control bar entirely.

### Design Goals

1. **Focused viewing** — In subtitles mode, only the video and the current subtitle line are visible. All other UI is hidden.
2. **Quick line navigation** — Users can jump to the previous or next subtitle line without leaving immersive mode.
3. **Easy exit** — One tap/click returns to the full transcript mode with all study tools.
4. **Reduce custom control bar** — YouTube's native controls (play, seek, volume, speed, fullscreen) handle standard playback. LP's control bar is reduced to only LP-specific controls (prev/next line, prev/next video, sidebar toggle) with no feature overlap.
5. **Seamless toggle** — Switching between modes is instant, preserving video position and state.

---

## Options Considered

### Option A: Overlays + Modals + Drawers

Subtitles mode renders a single-line subtitle band between the player and a thin control bar (no progress bar). Video meta and channel card go into a modal triggered by an `ⓘ` button. Queue goes into a drawer triggered by a `☰` button.

- **Pros**: Control bar remains accessible; queue and info accessible without leaving mode.
- **Cons**: Multiple interaction surfaces (modal, drawer, control bar); band position unstable on narrow screens due to variable line lengths; control bar adds visual clutter.

### Option B: Extended Tabbed Panel

Add "info" and "subtitles" tabs to the existing `TranscriptQueuePanel`. Narrow screens get a dedicated "subtitles" tab showing the current line; info becomes a tab instead of inline below the player.

- **Pros**: Simpler code — just more tabs in an existing component.
- **Cons**: Tabs compete for attention; subtitles tab on narrow requires scrolling past other tabs; doesn't feel immersive — the tab bar and surrounding chrome remain visible.

### Option C (Chosen): Split-Personality Watch Page

The watch page renders one of two completely different layouts based on `playback.transcriptMode`. There is no hybrid — the page is either in **transcript mode** or **subtitles mode**.

| | Transcript Mode | Subtitles Mode |
|---|---|---|
| **Concept** | Study mode — all tools visible | Immersive mode — video + current line only |
| **Controls** | Reduced bar (no overlap with YT iframe) | Reduced bar in overlay band |
| **Prev / next line** | `←` `→` in control bar | `←` `→` in overlay band |
| **Prev / next video** | `⏮` `⏭` in control bar | `⏮` `⏭` in overlay band |
| **Rewind to line start** | `R` key or tap empty space around line | `R` key or tap empty space around line |
| **Subtitle display** | `SubtitleDisplay` multiline in tab panel | Overlay band, current line only |
| **Karaoke** | Spoken words brighten within the active line | Spoken words brighten within the band; unspoken words remain clearly readable |
| **Video meta** | Below player | ❌ Hidden |
| **Channel card** | Below meta | ❌ Hidden |
| **Transcript** | Tab in right sidebar (w:h > 1) / collapsible panel (w:h ≤ 1) | ❌ (switch mode to see) |
| **Queue** | Tab in right sidebar (w:h > 1) / collapsible panel (w:h ≤ 1) | ❌ (switch mode to see) |
| **Side panel** | Open by default; `◧` toggles collapse | N/A — `◧` switches to transcript mode |

- **Pros**: Each mode is purpose-built; no compromised UX in either mode; clean separation of concerns; immersive mode feels like Netflix.
- **Cons**: Two distinct render paths in `page.tsx`; need a new `SubtitlesModeBand` component.

---

## Decision

**Option C — Split-personality watch page. The LP `VideoControlBar` is reduced to only LP-specific controls.**

The watch page reads `playback.transcriptMode` from `useSettingsContext()` and renders one of two layouts. The custom LP control bar is reduced to avoid feature overlap with YouTube's native controls (play, pause, seek, volume, speed, fullscreen). The only LP-specific controls are five buttons, present in both modes:

- **`←` `→`** — prev/next subtitle line. `←` always seeks to the line before the **currently active** line (identified by the last start time ≤ the playhead) — it never replays the current line from the start. `→` always seeks to the next line. When already on the first line there is no previous line, so `←` falls back to a small rewind instead. The same behavior applies to the keyboard shortcuts (`←`/`→`), the subs-search playback modal, and local-media playback.
- **`⏮` `⏭`** — prev/next video in queue
- **`◧`** — toggles between transcript mode (full sidebar) and subtitles mode (immersive overlay band).

**Rewind** (to start of current line): no visual button. Tap any empty space around the subtitle text, or press `R`.

The mode can be toggled via:
- Settings page (persistent preference)
- ◧ button in either mode

### Layout: Wide Screen (aspect ratio w:h > 1)

> **Video contain-fit (SPEC-010 addition):** The player is no longer locked
> to a 16:9 box in widescreen. Because YouTube letterboxes content inside the
> embed iframe, a 4:3 clip forced into a 16:9 container renders small with
> black bars. The backend now supplies a native `aspect_ratio` field on the
> video object (from YouTube's `player.embedWidth`/`embedHeight`). When it's
> present, the player additionally receives the **visible height of the left
> column**, and sizes itself to the largest rectangle of that aspect ratio
> that fits inside `column width × visible height` — its width equal to the
> column width OR its height equal to the visible part of the column,
> whichever yields the bigger fit. So a 4:3 video renders larger (e.g. 4:3,
> not letterboxed 16:9); a genuine 16:9 video is unchanged. When no
> `aspect_ratio` is available, the player falls back to a 16:9 box. The
> contain-fit runs in both transcript mode and subtitles mode, and only on
> widescreen (narrow keeps 16:9).
>
> Rewind detail: the player is centered horizontally in the column; the
> subtitle band still overlays it as before.

#### Transcript Mode (reduced control bar, side panel open)

```
┌─────────────────────────────────────┬──────────────┐
│                                     │ 📄  📋       │
│          YOUTUBE PLAYER             │              │
│     (native controls on hover)      │ transcript   │
│                                     │ (panel open) │
│                                     │              │
│  Video Title          [⏮←→⏭◧]      │              │
│  👁 1.2M  👍 45K  💬 3.2K  📅 Jan │              │
│  [A2] [zh-CN]                       │              │
│  ┌ Channel Card ───────────┐        │              │
│  └─────────────────────────┘        │              │
└─────────────────────────────────────┴──────────────┘
```

- **Mini control bar**: `[⏮ ← → ⏭ ◧]` — huddled group, right-aligned in the title flex row. No progress bar, play/pause, time display, or speed toggle.
- **Side panel**: open by default. `◧` toggles collapse/expand. Tab header: just `📄` `📋`.
- **Rewind**: tap empty space around any subtitle line, or press `R`.
- Video info below player, unchanged.

#### Subtitles Mode

```
┌──────────────────────────────────────────────────────────┐
│                     HEADER (3.5rem)                      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                                                          │
│                   YOUTUBE PLAYER                         │
│            fills h-[calc(100vh-3.5rem)]                  │
│        native YouTube controls appear on hover           │
│                                                          │
│                                                          │
│   ┌────────────────────────────────────────────────┐     │
│   │     今天天气很好，我们出去走走吧...            │     │  ← subtitle row
│   │     The weather is nice, let's go out          │     │
│   │────────────────────────────────────────────────│     │
│   │  [⏮← →⏭ ♥ 🔖 ◧]                              │     │  ← huddled control row
│   └────────────────────────────────────────────────┘     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Player container: `h-[calc(100vh-3.5rem)]` — full viewport minus header.
- **Overlay band**: positioned above YouTube's native controls, centered horizontally, and sized to its controls/text content. Two rows:
  - **Subtitle row**: L2 `TokenizedText` + L1 translation, centered. The text block (tokenized text + the ⋮ action-menu trigger) is at least as wide as the control row and may grow wider when the line is long.
  - **Control row**: `[⏮ ← → ⏭ ♥ 🔖 ◧]` as a huddled button group, left-aligned. Thin and compact.
  - **Karaoke mode**: passes the active line's weighted progress to `TokenizedText`; both spoken and unspoken words use light, readable band colors.
  - **Positioning**: tap/click and hold an empty area of the band, then drag vertically to place it anywhere within the video frame.
  - No TTS button.
- `bg-black/70 backdrop-blur-sm rounded-t-xl`, `min-h-[6rem]`
- No `VideoControlBar`, `VideoMeta`, `YouTubeChannelCard`, or `TranscriptQueuePanel`.

### Layout: Narrow Screen (aspect ratio w:h ≤ 1)

#### Transcript Mode (controls sticky below video)

```
┌──────────────────────────────────────┐
│          YOUTUBE PLAYER              │  ← sticky top-[3.5rem]
│     (native controls on tap)         │
├──────────────────────────────────────┤
│         [⏮← →⏭◧]                    │  ← sticky, right-aligned
├──────────────────────────────────────┤  (sticky zone ends)
│  👁 1.2M  👍 45K  [A2]             │
│  ┌ Channel Card ──────────┐          │
│  └────────────────────────┘          │
├──────────────────────────────────────┤
│  📄  📋                              │  ← tab bar
│                                      │
│  transcript or queue content         │  ← scrollable
│  fills remaining screen space        │
│                                      │
└──────────────────────────────────────┘
```

- **Player + controls sticky zone**: Both the YouTube player and the `[⏮ ← → ⏭ ◧]` control bar are grouped in a single sticky container at `top-[3.5rem]`. When the user scrolls down through the transcript, the video and controls stay visible at the top.
- **Mini control bar**: `[⏮ ← → ⏭ ◧]` — huddled group, right-aligned below the player. `◧` toggles to subtitles mode (immersive overlay).
- **Side panel**: below the sticky zone, fills remaining space. Tab icons (`📄` `📋`) switch between transcript and queue.
- **Rewind**: tap empty space around any subtitle line, or press `R`.

#### Subtitles Mode

```
┌──────────────────────────────────────┐
│          YOUTUBE PLAYER              │
│          (aspect-video, 16:9)        │
├──────────────────────────────────────┤
│  ┌──────────────────────────────┐    │
│  │   "今天天气..."              │    │  ← subtitle row
│  │   The weather is nice        │    │     min-h-[5rem], centered
│  │──────────────────────────────│    │
│  │  [⏮← →⏭ ♥ 🔖 ◧]              │    │  ← huddled control row
│  └──────────────────────────────┘    │
│                                      │
│  (remaining space — empty)           │
│                                      │
└──────────────────────────────────────┘
```

- **Not overlaid** when w:h ≤ 1 — fixed-height block below the player. Two rows:
  - **Subtitle row**: L2 text + L1 translation, centered. The text block is at least as wide as the control row and may grow wider.
  - **Control row**: `[⏮ ← → ⏭ ♥ 🔖 ◧]` as a huddled button group, left-aligned.
  - No TTS button.
- No video info. Player uses YouTube's native mobile controls.

---

### Subtitle Overlay Band Component (`SubtitlesModeBand`)

> **Note (merged):** The band was merged into `SubtitleDisplay`
> (`apps/web/src/components/video/subtitle-display.tsx`) as `band` mode —
> render `<SubtitleDisplay band ...>` with `initialLines` (SyncedLine[], API-
> embedded L1), `overlay`, video-nav, and like/save props. The watch page
> passes `initialLines={displaySubtitleLines}`. Singleline mode also gained
> click-to-seek (`onSeekToLine`). `subtitles-mode-band.tsx` was deleted.

> **Note (sidebar merged):** The watch page's transcript/queue/info sidebar
> (`TranscriptQueuePanel`) and the subs-search results list were unified into
> one shared `VideoSidebarPanel` (`apps/web/src/components/video/
> video-sidebar-panel.tsx`) with configurable `subs | queue | info` tabs, plus
> a shared `VideoQueuePanel` (`video-queue-panel.tsx`) for the queue content
> (watch page: queue videos; subs search: the search results with filter +
> sort). `transcript-queue-panel.tsx` was deleted. Subs search is always
> stacked (player → controls → sidebar) — never two-column, since it renders
> inside the dictionary panel even on large screens.
>
> **Note (video "Ask AI" tab):** The watch-page sidebar also exposes an
> **Ask AI** (`ai`) tab (mobile `TranscriptQueuePanel` parity) that opens the
> shared `AiExplanation` chat (SPEC-035) preloaded with the full subtitle
> transcript — each line prefixed by its `[MM:SS]` timestamp — as context, the
> Summarize / Difficult expressions / Grammar points presets, and tappable
> `[MM:SS]` timestamps in every reply. Tapping a timestamp calls `onSeek` (the
> caller seeks the video) and switches the sidebar back to the transcript tab.
> The transcript persists per video (`lp-ask-ai:video:<id>`, web localStorage /
> mobile AsyncStorage). Prompt responses are instructed
> (`VIDEO_AI_TIMESTAMP_INSTRUCTION`) to cite the subtitle `[MM:SS]` tokens.
>
> **Note (queue items):** The watch-page queue (`VideoQueueList`) renders the
> tv-show header as a two-row block — the show title on its own row and
> "(N episodes)" on a second row — with no Tv icon. TV-show queue rows show no
> episode number and hide the `⋮` actions menu (`showActionsMenu={false}`),
> leaving just a clean row of thumbnail + level badge + title + metadata. The
> level badge is shown only when the level resolves from `video.difficulty` +
> the L2 difficulty profile; it is **not** shown when the level can't be
> determined (no misleading fallback level).

Two-row layout: subtitle text (with translation) on top, controls below.

```
┌──────────────────────────────────────────────────────────┐
│        今天天气很好，我们出去走走吧...                    │  ← subtitle row
│        The weather is nice, let's go out                 │
│──────────────────────────────────────────────────────────│
│  [⏮← →⏭ ♥ 🔖 ◧]                                  │  ← huddled control row
└──────────────────────────────────────────────────────────┘
```

**Subtitle row** — `flex flex-col items-center px-4 py-2`:

| Element | Notes |
|---|---|
| L2 text | `TokenizedText` — tap word for dictionary popup. The text block (tokenized text + the ⋮ action-menu trigger) spans at least the control row's width and may grow wider for long lines. |
| L1 translation | Shown below L2 (when `display.translation` is enabled) |

**Control row** — `flex items-center px-3 py-1` with buttons grouped together
(same order as the reduced `VideoControlBar` used everywhere):

| Element | Action | Icon |
|---|---|---|
| `⏮` | Previous video in queue | `SkipBack` |
| `←` | Previous subtitle line | `ChevronLeft` |
| `→` | Next subtitle line | `ChevronRight` |
| `⏭` | Next video in queue | `SkipForward` |
| `♥` | Like / unlike video | `Heart` |
| `🔖` | Add to playlist | `Bookmark` |
| `◧` | Subtitles mode → transcript mode | `PanelRightOpen` |

**Rewind**: tapping any empty space in the band seeks to the start of the current line. `R` key has the same effect. No visual button.

> **Popup-dismissal guard:** the subtitle row's tap-to-rewind is suppressed
> while a dictionary popup dialog is open and for a short window after it
> closes (`isReaderTapSuppressed`, shared with the EPUB reader). Without this,
> the click that dismisses the popup is re-targeted onto the row beneath as
> the dialog overlay unmounts, seeking back to the line start and "replaying"
> the line. Closing the popup dictionary must never affect video playback.
> The same guard covers the singleline and multiline click-to-seek surfaces.

**Positioning:**
- **Wide (w:h > 1)**: `absolute bottom-14 left-4 right-4 z-10` — overlays the video.
- **Narrow (w:h ≤ 1)**: Fixed-height block below the player (not absolute).

**Styling:**
- Wide (w:h > 1): `bg-black/70 backdrop-blur-sm rounded-t-xl`, `min-h-[6rem]`
- Narrow (w:h ≤ 1): `bg-card border-t border-border`, `min-h-[6rem]`

---

### YouTube iFrame Native Controls

In subtitles mode, the YouTube player is created with `controls: 1` (default) so the native YouTube control bar is visible. Our custom controls are not rendered. This gives users:

- Play / pause (click video or spacebar)
- Seek (YouTube progress bar)
- Volume control
- Playback speed (YouTube settings gear)
- Fullscreen (YouTube fullscreen button)
- Captions (YouTube's own CC — can be disabled if confusing)

For **local media** (`HTML5Player` on `/local-media`), we'll need to render overlay controls in a future iteration since `<video>` elements without `controls` have no native UI by default.

---

### Implementation Plan

1. **Create `SubtitlesModeBand` component** (`apps/web/src/components/video/subtitles-mode-band.tsx`)
   - Props: `subtitleLines: SyncedLine[]`, `currentTime`, `onSeekToLine`, `onSwitchToTranscriptMode`, `hasPrevVideo`, `hasNextVideo`, `onPrevVideo`, `onNextVideo`
   - Derives the active line from `currentTime` + `subtitleLines` start times
   - Renders `TokenizedText` for the active L2 line, L1 translation, and navigation arrows

2. **Update watch page** (`page.tsx`)
   - Read `playback.transcriptMode` from `useSettingsContext()`
   - **Reduce `VideoControlBar`** — remove progress bar, play/pause, time display, speed toggle, rewind. Keep only: `⏮` `←` `→` `⏭` `◧` as a huddled button group.
   - When `'subtitles'`:
     - Don't render `VideoMeta`, `YouTubeChannelCard`, `TranscriptQueuePanel`
- Render `SubtitlesModeBand` as overlay (w:h > 1) or below-player block (w:h ≤ 1)
    - Container: `h-[calc(100vh-3.5rem)]` when w:h > 1
  - When `'transcript'`:
    - Side panel open by default (regardless of aspect ratio). `◧` toggles collapse.
    - When w:h > 1: Mini control bar in title flex row. Tab header: `📄` `📋` only.
    - When w:h ≤ 1: Panel fills remaining space below player + info. Tabs switch transcript/queue.

3. **Ensure YouTube native controls are visible**
   - `YouTubePlayer` already has `playerVars` without `controls: 0` — native controls show by default
   - Verify on both desktop and mobile that YouTube's control bar appears on hover/tap

4. **Keyboard shortcuts** — keep existing handler in `page.tsx`:
   - `←` / `→`: prev/next line (works in both modes)
   - `Space`: play/pause (YouTube handles natively)
   - `R`: rewind to start of current line
   - `Shift+←` / `Shift+→`: prev/next video in queue

---

### Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Iframe blocks pointer events on overlay band (w:h > 1) | Band is narrow and positioned above YouTube controls area; most of the player remains clickable. When w:h ≤ 1, band is not overlaid at all. |
| Subtitle lines with extreme length | `line-clamp-2` on L2 text; band has `min-h` not fixed `h` so it can grow to 2 lines. |
| Users don't discover how to switch to transcript mode | `◧` button uses the familiar `PanelRightOpen` icon suggesting "open side panel." Tooltip reads "Show transcript & queue." |
| Queue navigation lost in subtitles mode | Users must exit to transcript mode to browse the queue. This is intentional — subtitles mode is for focused watching of a single video. |
| LP-specific controls (line nav, queue nav) hard to find | All five buttons (`⏮ ← → ⏭ ◧`) are in the reduced control bar, always visible in both modes. Keyboard shortcuts work regardless. |
