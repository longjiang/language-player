# SPEC-027: Chrome Extension — Implicit Auto-Open Toggle for Transcript Panel

## Metadata
- **Spec ID**: SPEC-027
- **Feature**: Auto-open toggle for the transcript panel on all supported streaming platforms
- **Status**: draft
- **Created**: 2026-07-30
- **See also**:
  - `apps/chrome-extension/src/content-entry.js` — entry point bundled by esbuild (panel creation, subtitle detection, rendering, all platform logic)
  - `apps/chrome-extension/build.mjs` — esbuild build script (bundles `content-entry.js` → `dist/content.js`, copies `content.css` and `netflix-main-world.js`)
  - `apps/chrome-extension/src/background.js` — service worker (subtitle HTTP interception)
  - `apps/chrome-extension/src/popup.js` — extension popup ("Show Transcript" button)
  - `apps/chrome-extension/src/popup.html` — popup UI
  - `apps/chrome-extension/manifest.json` — extension manifest

### Build Process

The extension uses **esbuild** to bundle the content script. Source files use ES module syntax (`import`/`export`), which Chrome doesn't support in content scripts, so they must be bundled into a single IIFE.

**To compile after making changes:**

```bash
cd /Users/longjiang/Projects/language-player
node apps/chrome-extension/build.mjs
```

This runs `esbuild` on `src/content-entry.js`, resolving workspace packages (`@langplayer/shared`, `@langplayer/utils`) from the monorepo, and outputs a single bundle at `dist/content.js`. It also copies `src/content.css` → `dist/content.css` and `src/netflix-main-world.js` → `dist/netflix-main-world.js`.

**To reload in Chrome after building:**
1. Go to `chrome://extensions`
2. Find **Language Player**
3. Click the refresh/reload icon on the extension card
4. Reload the video page

> The old `src/content.js` (vanilla JS, non-React) is **not** used by the build. All development happens in `src/content-entry.js`.

---

## Overview

Currently, when the extension detects and parses subtitles on any supported platform (Prime Video, Netflix, YouTube, Disney+, Hulu, Max), the transcript panel **always opens automatically**. This is useful for first-time users but can be annoying for returning users who know the feature exists and prefer to open the panel only when they want it.

This spec adds an implicit toggle — `autoOpenPanel` — stored in `chrome.storage.sync`. The toggle is set automatically based on user actions, with **no dedicated UI control** (no gear icon, no switch). This keeps the extension lightweight while giving users control over the auto-open behavior.

The toggle is **lazy** — it only affects the **next** subtitle detection, never closes a panel that's already open.

---

## User Stories

- As a returning user, I want subtitles to be detected in the background without the panel popping open every time, so I can watch without distraction and open the panel manually when I need it.
- As a new user, I want the panel to open automatically on my first visit so I discover the feature without hunting for a button.
- As a user who closed the panel on one video, I don't want it to auto-open on the next video unless I deliberately open it again.

---

## Current Behavior (Baseline)

### Subtitle Detection & Panel Opening Flow (current)

```
1. User navigates to video page
2. Content script injected (document_start for Netflix, document_idle for all others)
3. Wait for player element found (platform-specific selector)
4. Create panel DOM (class="lpv-collapsed", hidden)
5. Background worker intercepts HTTP subtitle request (.vtt, .srt, .ttml, .dfxp, etc.)
6. Worker sends 'subtitleDetected' message to content script
7. Content script fetches & parses subtitle file → STATE.cues[]
8. If cues found → render cues into DOM → OPEN PANEL (always)
```

The panel always opens. There is no way to prevent it.

### Platforms

All platforms run the same `content.js`. The only platform-specific differences are:
- **Player element selectors** (step 3): `#dv-web-player` / `#dv-web-player-2` (Prime Video), `video[class*="video-"]` (Netflix), `.video-stream` (YouTube), etc.
- **Netflix subtitle interception** (step 7): Uses a JSON.parse monkeypatch injected into the MAIN world via `chrome.scripting.executeScript` to intercept Netflix's timedtexttracks API response. All other platforms use standard HTTP `webRequest` interception.
- **Content script injection timing**: Netflix uses `document_start` (needed for the MAIN world hook); all others use `document_idle`.

These differences do not affect the auto-open toggle logic — the same `content.js` runs everywhere.

---

## Design Decisions

### Implicit Toggle (No Settings UI)

The toggle is set implicitly by user actions rather than through a dedicated control:

| User action | `autoOpenPanel` becomes | Next video's panel behavior |
|---|---|---|
| Subtitle detected (first visit / default) | `true` | Opens automatically |
| User closes panel with ✕ | `false` | Stays closed on next video |
| User opens panel via 📝 floating button | `true` | Opens automatically on next video |
| User clicks "Show Transcript" in extension popup | `true` | Opens automatically on next video |

**Rationale**: The ✕ close button intuitively means "stop showing me this" — it's the natural signal that the user doesn't want the panel to auto-open. Conversely, any deliberate open action (clicking 📝 or using the popup) signals intent to use the feature again, so auto-open resumes. This avoids adding a gear icon or switch to the panel header, keeping the UI clean.

### Lazy Rendering When Auto-Open Is Off

When `autoOpenPanel` is `false`, we skip rendering cue DOM elements. The parsed `STATE.cues[]` array is still kept in memory so that when the user manually opens the panel, cues render instantly. This avoids unnecessary DOM work for users who never open the panel.

### Performance Invariant

Subtitle detection (HTTP interception, fetch, parse) always runs — the toggle only controls the display step. This ensures:
- `STATE.cues[]` is always ready for manual panel open
- Keyboard navigation (Alt+T, ↑/↓ arrows) works immediately
- Time-synced highlighting works if the panel is opened later

---

## Implementation Plan

### 1. Add `autoOpenPanel` to `chrome.storage.sync`

No schema changes needed — a single boolean key. Default: `true` (backward compatible).

### 2. Content Script Changes (`content.js`)

#### a) Read preference on subtitle detection

In `fetchAndParseSubtitles()`, after parsing cues successfully (current step 8), read `autoOpenPanel` before deciding whether to open:

```js
// After cues found and rendered (or not):
chrome.storage.sync.get('autoOpenPanel', (result) => {
  const autoOpen = result.autoOpenPanel !== false; // default true
  if (autoOpen) {
    renderCues();
    setPanelVisible(true);
  } else {
    // STATE.cues[] is populated but DOM is not rendered
    // Toggle button 📝 remains visible
  }
});
```

#### b) Close button sets `autoOpenPanel = false`

In the ✕ close button click handler:

```js
closeBtn.addEventListener('click', () => {
  setPanelVisible(false);
  chrome.storage.sync.set({ autoOpenPanel: false });
});
```

#### c) Manual open sets `autoOpenPanel = true`

In the 📝 toggle button click handler and any path that manually opens the panel:

```js
toggleBtn.addEventListener('click', () => {
  // If cues exist but not rendered (lazy render), render now
  if (STATE.cues.length > 0 && cueElements.length === 0) {
    renderCues();
  }
  setPanelVisible(true);
  chrome.storage.sync.set({ autoOpenPanel: true });
});
```

### 3. Popup Changes (`popup.js`)

When the "Show Transcript" button is clicked in the popup, send a message to the content script that also sets `autoOpenPanel = true`:

```js
// In popup.js message handler for "Show Transcript"
chrome.tabs.sendMessage(activeTab.id, {
  action: 'showTranscript',
  enableAutoOpen: true
});
```

The content script handles this message:

```js
if (message.action === 'showTranscript') {
  if (STATE.cues.length > 0 && cueElements.length === 0) {
    renderCues();
  }
  setPanelVisible(true);
  chrome.storage.sync.set({ autoOpenPanel: true });
}
```

### 4. No Changes Needed

| File | Reason |
|---|---|
| `background.js` | Subtitle interception is unchanged |
| `manifest.json` | No new permissions needed (`storage` already declared) |
| `popup.html` | No new UI elements |
| `content.css` | No new styles |

### Flowchart

```
SETUP (once per page load)
  1. Navigate to video
  2. Content script injected
  3. Wait for player element
  4. Create panel DOM (hidden)

SUBTITLE DETECTION (every subtitle file)
  5. Background worker intercepts HTTP subtitle request
  6. Worker sends 'subtitleDetected' message
  7. Fetch & parse → STATE.cues[]
  8. Cues found? ──NO──▶ Show status → STOP
         │
        YES
         │
         ▼
  9. Read autoOpenPanel from chrome.storage.sync
         │
     ┌───┴───┐
    true     false
     │        │
     ▼        ▼
  10.      ┌──────────────────────────────────┐
 Render   │ Skip render. STATE.cues[] ready. │
 cues +   │ Panel collapsed. 📝 visible.      │
 OPEN     └──────────┬───────────────────────┘
 PANEL                │
                      ▼
               11. User clicks 📝 or
                   "Show Transcript" in popup
                      │
                      ▼
               12. autoOpenPanel = true
                   Render cues + OPEN PANEL

CLOSE (any time)
  13. User clicks ✕
         │
         ▼
  14. setPanelVisible(false)
         │
         ▼
  15. autoOpenPanel = false
```

---

## States

| State | Panel behavior | Cues in memory? | Cues in DOM? |
|---|---|---|---|
| First visit (default) | Opens automatically | ✅ | ✅ |
| User closed panel (autoOpen=false) | Stays closed | ✅ | ❌ (rendered on manual open) |
| User reopened manually | Opens | ✅ | ✅ |
| No subtitle file detected | N/A — panel has nothing to show | ❌ | ❌ |
| Cues found = 0 | Status message shown | ❌ | ❌ |

---

## Dependencies

- `chrome.storage.sync` — already declared in manifest permissions

---

## Open Questions

1. **Should closing the panel via Alt+T (keyboard shortcut) also set `autoOpenPanel = false`?** The keyboard shortcut toggles, so pressing Alt+T when the panel is open would close it. This is harder to distinguish from "I just want to peek at the video" vs "I never want this to open again." Proposed: only the ✕ button sets it to `false`; keyboard toggle does not change the preference.

2. **Should the Netflix MAIN world interceptor be modified to pass the auto-open preference?** No — the interceptor only injects the JSON.parse hook. The actual panel logic runs in the content script's isolated world, which has access to `chrome.storage.sync` normally. No change needed.
