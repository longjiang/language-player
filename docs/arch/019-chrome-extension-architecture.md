# Chrome Extension Architecture

## Metadata
- **Arch ID**: ARCH-019
- **Feature**: Language Player Chrome Extension — transcript panel, subtitle interception, interactive dictionary
- **Type**: as-built
- **Status**: accepted
- **Created**: 2026-07-30
- **Last Updated**: 2026-07-30
- **Scope**: Chrome Extension (`apps/chrome-extension/`)
- **See also**:
  - `apps/chrome-extension/src/content-entry.js` — entry point, all platform logic
  - `apps/chrome-extension/src/background.js` — service worker (subtitle HTTP interception)
  - `apps/chrome-extension/src/popup.js` — extension popup UI
  - `apps/chrome-extension/src/popup.html` — popup HTML shell
  - `apps/chrome-extension/src/transcript-app.tsx` — React transcript component
  - `apps/chrome-extension/src/subtitle-parsers.js` — format parsers (TTML, WebVTT, SRT, YouTube)
  - `apps/chrome-extension/src/netflix-main-world.js` — Netflix JSON.parse monkeypatch (MAIN world)
  - `apps/chrome-extension/src/content.css` — all panel/transcript styles
  - `apps/chrome-extension/manifest.json` — extension manifest
  - `apps/chrome-extension/build.mjs` — esbuild bundler script
  - `apps/chrome-extension/_locales/` — i18n locale files (31 locales)
  - `apps/chrome-extension/scripts/generate-locales.js` — locale file generator
  - `apps/chrome-extension/scripts/generate-lang-names.js` — lang name lookup generator
  - `specs/027-chrome-extension-auto-open-toggle.md` — auto-open panel spec
  - `packages/shared/src/` — shared types & constants (SUPPORTED_L2S, etc.)
  - `packages/utils/src/` — shared utilities (buildRuby, baseCode, etc.)

---

## Overview

The Language Player Chrome extension injects an interactive, tokenized transcript panel alongside video players on six streaming platforms: Prime Video, YouTube, Netflix, Disney+, Hulu, and Max. It intercepts subtitle files at the network level (or via platform-specific APIs), parses them, tokenizes the text via a Python backend, and renders clickable words with dictionary lookup, word saving, and AI explanations.

The extension is a single codebase with runtime platform detection — there is no per-platform build step. All platform-specific behavior branches on `location.hostname` checks inside the bundled `content-entry.js`.

---

## Directory Structure

```
apps/chrome-extension/
├── build.mjs                          ← esbuild bundler (source of truth for build)
├── manifest.json                      ← Chrome extension manifest
├── dist/                              ← Build output (bundled content.js, copied CSS/JS)
│   ├── content.js                     ← esbuild IIFE bundle of content-entry.js
│   ├── content.css                    ← Copied from src/
│   ├── netflix-main-world.js          ← Copied from src/
│   └── lang-names.json                ← Generated from translations.csv
├── _locales/                          ← Chrome i18n locale files (31 locales)
│   ├── en/messages.json
│   ├── zh_CN/messages.json
│   └── ...
├── icons/                             ← Extension icons
├── scripts/
│   ├── generate-locales.js            ← Generates _locales/{locale}/messages.json from CSV
│   └── generate-lang-names.js         ← Generates dist/lang-names.json from CSV lang.* keys
└── src/
    ├── content-entry.js               ← ENTRY POINT: platform detection, state, init, bundling
    ├── content.js                      ← LEGACY: vanilla JS version (not built, not used)
    ├── content.css                     ← All panel, transcript, and overlay styles
    ├── background.js                   ← Service worker: webRequest interception, MAIN world ops
    ├── popup.html                      ← Popup HTML (auth form, transcript button)
    ├── popup.js                        ← Popup logic (auth, transcript status polling)
    ├── popup.css                       ← Popup styles
    ├── netflix-main-world.js           ← Netflix JSON.parse hook (injected in MAIN world)
    ├── transcript-app.tsx              ← React root component (mountTranscript, TranscriptApp)
    ├── subtitle-parsers.js             ← Subtitle format parsers (platform-agnostic)
    ├── i18n.js                         ← chrome.i18n.getMessage() wrapper
    ├── auth.ts                         ← Auth helpers (getAuthState, token management)
    ├── saved-words.ts                  ← Saved words API calls to Directus
    ├── use-translate-lines.ts          ← React hook: batch subtitle translation
    ├── use-subscription.ts             ← React hook: check Pro subscription status
    └── components/
        ├── DictionaryCard.tsx           ← Dictionary lookup card (lemma, definition, examples)
        ├── Markdown.tsx                 ← Markdown renderer for AI explanations
        └── SavedWordsProvider.tsx       ← React context for saved words state
```

---

## Build Process

The extension uses **esbuild** to bundle the content script because Chrome's content script isolation doesn't support ES module `import`/`export` syntax. Source files in `src/` use ES modules; the build produces a single IIFE that runs in the content script's isolated world.

### Build Steps

```
node apps/chrome-extension/build.mjs
```

The build script (`build.mjs`) does three things in order:

1. **Generate language name lookup** — runs `scripts/generate-lang-names.js` which parses the monorepo's `translations.csv`, extracts all `lang.*` keys across 31 locales, and produces `dist/lang-names.json`. This JSON maps language codes (e.g., `"ja"`) to translated names (e.g., `{"en": "Japanese", "zh_CN": "日语", ...}`) for use in the L2 language dropdown.

2. **Bundle content script with esbuild** — takes `src/content-entry.js` as the entry point and produces `dist/content.js`. Key esbuild settings:
   - `format: 'iife'` — wraps everything in an immediately-invoked function expression
   - `target: 'chrome120'` — targets Chrome 120+ APIs
   - `platform: 'browser'` — assumes browser globals (no Node)
   - `jsx: 'automatic'` — React JSX transform (no manual `React.createElement`)
   - `external: ['chrome']` — `chrome.*` APIs are provided by the extension runtime
   - `minify: false` — kept readable for debugging
   - Resolves `@langplayer/shared` and `@langplayer/utils` via aliases to `packages/shared/src/` and `packages/utils/src/`

3. **Copy static assets** — copies `src/content.css` → `dist/content.css` and `src/netflix-main-world.js` → `dist/netflix-main-world.js`.

### Generating Locale Files

Locales (`_locales/{locale}/messages.json`) are generated separately from the main build:

```bash
node scripts/generate-locales.js
```

This script reads `translations.csv` and merges CSV translations with a built-in map of extension-specific keys. It produces all 31 locale files at once. CSV keys take priority; extension-only keys use the built-in fallback map.

### Lifecycle After Changes

1. Edit source in `src/`
2. Run `node apps/chrome-extension/build.mjs`
3. Go to `chrome://extensions` → refresh Language Player
4. Reload the video page

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CHROME BROWSER                               │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │                   Video Page (e.g., netflix.com)           │      │
│  │                                                           │      │
│  │  ┌────────────────────┐  ┌──────────────────────────┐     │      │
│  │  │  MAIN World         │  │  Isolated World           │     │      │
│  │  │                     │  │  (Content Script)         │     │      │
│  │  │  netflix-main-      │  │                          │     │      │
│  │  │  world.js           │──│→ content-entry.js        │     │      │
│  │  │  (JSON.parse hook)  │  │  (postMessage bridge)    │     │      │
│  │  │                     │  │                          │     │      │
│  │  │  Netflix / YouTube  │  │  STATE.cues[]            │     │      │
│  │  │  player APIs        │  │  renderTranscript()      │     │      │
│  │  │                     │  │  mountTranscript()       │     │      │
│  │  └────────────────────┘  │  ┌──────────────────┐    │     │      │
│  │                           │  │  React Tree       │    │     │      │
│  │                           │  │  ┌────────────┐  │    │     │      │
│  │                           │  │  │TranscriptApp│  │    │     │      │
│  │                           │  │  │  Tokenized   │  │    │     │      │
│  │                           │  │  │  Lines       │  │    │     │      │
│  │                           │  │  │  Dictionary  │  │    │     │      │
│  │                           │  │  │  Card        │  │    │     │      │
│  │                           │  │  └────────────┘  │    │     │      │
│  │                           │  └──────────────────┘    │     │      │
│  │  ┌──────────────────┐     │                          │     │      │
│  │  │   Video Player    │     │  ┌──────────────────┐   │     │      │
│  │  │   <video>          │─────│─▶│ timeupdate →     │   │     │      │
│  │  │                   │     │  │ updateActiveCue() │   │     │      │
│  │  └──────────────────┘     │  └──────────────────┘   │     │      │
│  └───────────────────────────┴────────────────────────┘      │      │
│                                                              │      │
│  ┌────────────────────────────────────────────────────┐      │      │
│  │            Background Service Worker                │      │      │
│  │                                                     │      │      │
│  │  webRequest.onCompleted → detect subtitle URLs      │      │      │
│  │  → send 'subtitleDetected' to content script        │      │      │
│  │                                                     │      │      │
│  │  chrome.scripting.executeScript (MAIN world ops):   │      │      │
│  │  • netflixSeek (player API)                         │      │      │
│  │  • mainWorldFetch (bypass CORS for YouTube)         │      │      │
│  │  • netflixProbeActiveTrack                          │      │      │
│  └────────────────────────────────────────────────────┘      │      │
│                                                              │      │
│  ┌────────────────────────────────────────────────────┐      │      │
│  │   Popup                                             │      │      │
│  │                                                     │      │      │
│  │  Login form → Directus auth                        │      │      │
│  │  Polls content script for transcript status         │      │      │
│  │  "Show Transcript" → sendMessage('showTranscript')  │      │      │
│  └────────────────────────────────────────────────────┘      │      │
│                                                              │      │
│  ┌────────────────────────────────────────────────────┐      │      │
│  │   Python API (pythonvps.zerotohero.ca)              │      │      │
│  │                                                     │      │      │
│  │  POST /tokenize  → lemmatize + tokenize text       │      │      │
│  │  POST /translate_array → batch translate lines      │      │      │
│  │  GET /user-subscription → Pro check                 │      │      │
│  └────────────────────────────────────────────────────┘      │      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Platform-Specific Subtitle Detection

The extension supports six platforms. Each has a different mechanism for detecting and fetching subtitles, but they all converge into the same data flow once cues are parsed.

### Platform Comparison

| Aspect | Prime Video | Netflix | YouTube | Disney+ | Hulu | Max |
|---|---|---|---|---|---|---|
| **Detection method** | HTTP webRequest | JSON.parse hook (MAIN world) | InnerTube API + page data | HTTP webRequest | HTTP webRequest | HTTP webRequest |
| **Subtitle format** | TTML/XML | DFXP (TTML) or WebVTT | Timedtext XML or JSON3 | WebVTT (segmented) | WebVTT or SRT | WebVTT or TTML |
| **Content script timing** | `document_idle` | `document_start` | `document_idle` | `document_idle` | `document_idle` | `document_idle` |
| **Subtitle source** | background worker intercepts HTTP | JSON.parse monkeypatch intercepts playback manifest JSON | Page's `ytInitialPlayerResponse` + InnerTube API call to `/youtubei/v1/player` | background worker intercepts HTTP segments | background worker intercepts HTTP | background worker intercepts HTTP |
| **Seek method** | `video.currentTime` | `chrome.scripting.executeScript` in MAIN world (Netflix API) | `video.currentTime` | `mediaPlayer.seek()` API + `video.currentTime` fallback | `video.currentTime` | `video.currentTime` |
| **Video element selector** | `#dv-web-player-2` / `#dv-web-player` | Generic `video` element | `#movie_player video.html5-main-video` | Shadow DOM `disney-web-player` | `.hulu-player` | `#content-video-player` or `[data-testid="player-ux-video"]` |
| **Cue segment handling** | Full file, replace | Full file, replace | Full file, replace | Segmented VTT — merge & dedup | Full file, replace | Full file, replace |

### Detection Flow by Platform

#### Prime Video, Disney+, Hulu, Max (HTTP webRequest)

```
1. background.js registers webRequest.onCompleted listener
2. HTTP response URL detected ending in subtitle extension (.vtt, .srt, .ttml, .dfxp, etc.)
3. Background worker sends { action: 'subtitleDetected', url, fileName } to content script
4. content-entry.js receives message → calls fetchAndParseSubtitles(url)
5. Fetches subtitle text, detects format (TTML/XML, WebVTT, SRT), parses → STATE.cues[]
6. Disney+ special case: VTT segments are merged (mergeCues) instead of replaced,
   and distant segments are trimmed (trimDistantCues) to prevent memory growth
```

#### Netflix (JSON.parse Monkeypatch)

```
1. manifest.json injects content script at document_start on *.netflix.com/*
2. init() calls setupNetflixInterceptor() immediately (before player exists)
3. setupNetflixInterceptor() creates a <script src="dist/netflix-main-world.js"> tag
   injected into the page at document_start — this is a web-accessible resource
   that bypasses Netflix's CSP and runs in the MAIN world
4. netflix-main-world.js hooks JSON.parse BEFORE any Netflix code runs
5. When Netflix loads its playback manifest, JSON.parse fires, the hook
   extracts timedtexttracks metadata, and posts it via window.postMessage
6. content-entry.js listens for 'lpv-netflix' messages → handleNetflixSubs()
7. handleNetflixSubs() caches all available subtitle tracks (cachedNetflixTracks)
   and detects the currently active track via video.textTracks probing
8. loadNetflixTrackForLanguage() fetches the subtitle URL and parses cues
9. observeNetflixSubtitleChanges() polls every 3s for track changes
   (Netflix recreates text tracks when user switches subtitle language)
```

#### YouTube (InnerTube API + Page Data)

```
1. init() calls loadYouTubeSubtitles()
2. First attempt: fetchInnerTubeTracks(videoId)
   - Extracts INNERTUBE_API_KEY from page HTML
   - POSTs to https://www.youtube.com/youtubei/v1/player?key={apiKey}
     with ANDROID client context (bypasses CORS limitations)
3. Fallback: polls page for ytInitialPlayerResponse (up to 15s, 30×500ms)
   - Extracts captionTracks from playerResponse.captions
4. Builds L2 language dropdown from available tracks
5. Picks best track (prefers manual over ASR, matches detected L2)
6. fetchYTTrack() fetches via mainWorldFetch (background.js runs
   chrome.scripting.executeScript in MAIN world to bypass CORS)
7. Falls back to unsigned timedtext API if first fetch is empty
8. Parses as timedtext XML or JSON3 format
9. setupYouTubeNavigationObserver() watches for SPA navigation
   (video ID changes) and reloads subtitles after 1.5s delay
```

---

## Content Script Lifecycle

```
PAGE LOAD
   │
   ▼
┌─────────────────────────────────────────────────────┐
│ detectL2Code()                                       │
│   • html lang attribute → og:locale → fallback 'en'  │
│   • loadSavedL2Preference() from chrome.storage.local │
└─────────────────────────────────────────────────────┘
   │
   ▼ (Netflix only, before player)
┌─────────────────────────────────────────────────────┐
│ setupNetflixInterceptor()                             │
│   • Inject <script> tag for netflix-main-world.js    │
│   • Listen for window.postMessage('lpv-netflix')     │
└─────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────┐
│ waitForPlayer() — platform-specific element polling   │
│   • YouTube: #movie_player                            │
│   • Prime Video: #dv-web-player-2 / #dv-web-player   │
│   • Netflix: any <video> with duration > 0            │
│   • Disney+: video[src] in DOM or Shadow DOM          │
│   • Hulu/Max: generic video element                   │
└─────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────┐
│ createPanelUI()                                       │
│   • Creates panel DOM (#lpv-transcript-panel)         │
│   • Creates L2 language <select> dropdown             │
│   • Creates ✕ close button                            │
│   • mountTranscript() with empty cues (React root)    │
└─────────────────────────────────────────────────────┘
   │
   ▼ (platform-specific init path)
┌─────────────────────────────────────────────────────┐
│ Platform Branch                                        │
│                                                       │
│ YouTube → loadYouTubeSubtitles()                      │
│            setupYouTubeNavigationObserver()            │
│            setInterval(attachTimeTracking, 2000)       │
│                                                       │
│ Netflix → render pre-loaded cues (if any)              │
│            attachTimeTracking()                        │
│            setInterval(attachTimeTracking, 2000)       │
│                                                       │
│ Disney+ / Hulu / Max → attachTimeTracking()            │
│            MutationObserver on player container        │
│                                                       │
│ Prime Video → attachTimeTracking()                     │
│            MutationObserver on player container        │
└─────────────────────────────────────────────────────┘
   │
   ▼
SUBTITLE DETECTION (async) → cues parsed
   │
   ▼
Read autoOpenPanel from chrome.storage.sync
   │
   ├─ true  → setPanelVisible(true)  → panel opens
   └─ false → panel stays collapsed  → cues in memory for instant open
```

---

## State Management

The content script uses module-level state rather than React state for cross-cutting concerns. React state is only used for UI rendering within the transcript panel.

### Module-Level State

```js
const STATE = {
  cues: [],           // parsed subtitle cues: { start, end, text }
  activeCueIdx: -1,   // index of currently active cue
  panelVisible: false,
  panelReady: false,
  subtitleUrl: null,
  loading: false,
};

let fetchGen = 0;     // generation counter — prevents stale fetch races
let autoOpenPanel = true;  // user preference, synced via chrome.storage.sync
let detectedL2Code = 'en'; // detected or user-selected L2 language
let cachedNetflixTracks = {}; // all available Netflix subtitle tracks
let ytCaptionTracks = [];    // available YouTube caption tracks
```

### Chrome Storage Keys

| Key | Scope | Type | Default | Description |
|---|---|---|---|---|
| `autoOpenPanel` | `chrome.storage.sync` | boolean | `true` | Whether to auto-open panel on subtitle detection |
| `l2Language` | `chrome.storage.local` | string | — | User's preferred L2 language code (persisted) |
| `lpv_auth` | `chrome.storage.local` | object | — | Auth token, email, userId, expiry |

---

## React Component Tree

```
mountTranscript(container, cues, activeCueIdx, l2Code, l1Code, onSeekTo)
└── <React.StrictMode>
    └── <SavedWordsProvider>
        ├── <TranscriptApp>  ← main transcript list
        │   └── <TokenizedLine>  ← per-cue (virtualized via IntersectionObserver)
        │       ├── ruby annotations (furigana, pinyin)
        │       ├── clickable token spans
        │       └── ... (more lines)
        │   └── <TokenizedLine> ...
        └── <DictionaryCard>  ← shown when user clicks a word
            ├── lemma, readings, definitions
            ├── example sentences
            └── "Save" / "Explain" buttons
```

Key behaviors:
- **Lazy tokenization**: `TokenizedLine` uses `IntersectionObserver` — tokens are only fetched from the Python API when the line scrolls into view
- **Token cache**: `tokenCache = new Map<string, LemmatizedToken[]>()` — prevents re-fetching tokens for the same text
- **Translated lines**: `useTranslateLines` hook batch-translates visible lines in chunks of 5 via `/translate_array`

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+T` | Toggle panel visibility |
| `Ctrl/Cmd+Shift+Y` | Toggle panel visibility (alternative) |
| `↑` / `↓` (panel open) | Seek to previous/next cue |
| `Enter` (popup) | Submit login form |

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Single bundled content script** | Chrome doesn't support ES modules in content scripts. esbuild produces one IIFE file. |
| **Runtime platform detection** | Avoids maintaining N separate builds. All 6 platforms share the same `dist/content.js`. |
| **Netflix JSON.parse hook** | Netflix doesn't expose subtitles via HTTP or DOM — the manifest is in a JSON API response. The monkeypatch intercepts the parsed object before Netflix renders it. Injected via `<script src>` (not inline or executeScript) because: (a) inline `<script>` is blocked by Netflix's CSP, and (b) `chrome.scripting.executeScript` has latency that can miss the manifest. The `dist/netflix-main-world.js` web-accessible resource bypasses CSP. |
| **YouTube MAIN world fetch** | YouTube's timedtext URLs require cookies/credentials from the MAIN world — the isolated world's `fetch()` returns empty responses. `background.js` uses `chrome.scripting.executeScript` with `world: 'MAIN'` to fetch the subtitle XML, then passes it back. |
| **Disney+ cue merging** | Disney+ loads subtitles in 2–5 minute VTT segments. Without merging, seeking back would re-fetch and clear previous segments. Segment trimming prevents unbounded memory growth. |
| **React for transcript, vanilla for shell** | The transcript panel benefits from React's component model (tokenized lines, dictionary cards, lazy rendering), but the panel shell (DOM creation, CSS classes, event listeners) stays in vanilla JS to avoid extra dependency weight in the bundle. |
| **No Settings UI for auto-open** | The toggle is implicit — ✕ close disables, manual open re-enables. This avoids adding UI elements to the panel header. |
| **`chrome.storage.sync` for preferences** | Sync propagates across all Chrome instances where the user is signed in. `local` is used for auth tokens (shouldn't sync) and transient state. |
| **L2 dropdown with popular-first sorting** | Popular languages (`en`, `zh`, `ja`, `ko`, `es`, `fr`, `de`, etc.) appear first, then alphabetically by translated name. Language names come from `translations.csv` via `lang-names.json`, localized to the Chrome UI language. |

---

## Files Requiring No Changes for New Platforms

When adding a new streaming platform, the following files generally need updates:

| File | Likely needs change? | What |
|---|---|---|
| `src/content-entry.js` | ✅ | Add `isXxx` boolean, `getVideoElement` selector, `waitForPlayer` case, `init()` branch |
| `manifest.json` | ✅ | Add URL pattern to `content_scripts` matches and `web_accessible_resources` |
| `src/content.css` | ✅ | Add CSS rule to shrink player when panel is open on the new platform |
| `src/background.js` | ❌ | HTTP webRequest interception is URL-pattern agnostic (works for any domain) |
| `src/subtitle-parsers.js` | ❌ | Parsers are format-based (TTML, WebVTT, etc.), not platform-based |
| `src/netflix-main-world.js` | ❌ | Netflix-specific; irrelevant for other platforms |
| `src/popup.js` / `src/popup.html` | ❌ | Popup is platform-agnostic |
| `_locales/` | ❌ | No new strings needed |
| `scripts/` | ❌ | Generators are platform-agnostic |
