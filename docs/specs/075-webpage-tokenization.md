# SPEC-075: Chrome Extension — Webpage Tokenization & Popup Dictionary

## Metadata

- **Spec ID**: SPEC-075
- **Feature**: Tokenize any webpage into interactive L2 text with a persistent popup-dictionary side panel
- **Status**: draft
- **Created**: 2026-08-14
- **ROADMAP Phase**: Chrome Extension
- **See also**:
  - `docs/arch/019-chrome-extension-architecture.md` — current extension architecture (video transcript panel, tokenization, dictionary)
  - `apps/chrome-extension/src/popup.js` / `popup.html` — extension popup where the enable toggle lives
  - `apps/chrome-extension/src/content-entry.js` — video content script (panel shell, platform detection)
  - `apps/chrome-extension/src/transcript-app.tsx` — React transcript panel (dictionary card, toggles)
  - `apps/chrome-extension/src/use-batch-lemmatize.ts` — lazy batched tokenization
  - `apps/chrome-extension/src/use-translate-lines.ts` — lazy batched translation
  - `apps/chrome-extension/src/components/DictionaryCard.tsx` — dictionary popup card
  - `apps/chrome-extension/build.mjs` — esbuild bundler

## Overview

Today the Language Player Chrome extension only tokenizes subtitles on supported video sites. This spec adds a second mode: the user presses **Make Text on Page Interactive** in the extension popup, and the current webpage's visible text is tokenized strictly in the user's saved L2 (no language detection). The familiar side panel from video mode flies open, dictionary lookups render in it, and — when translation is enabled — a lookup also translates the entire text block containing the clicked word. The mode stays active across page navigation until the user closes the side panel.

## UI Sketches

### Extension popup

```text
┌──────────────────────────────────┐
│ Language Player                  │
│                                  │
│ L1: English       L2: 日本語     │
│                                  │
│ [on] Make Text on Page           │
│       Interactive                │
│                                  │
│ Signed in: user@example.com      │
└──────────────────────────────────┘
```

The **Make Text on Page Interactive** button is only shown when the **Read in Language Player** button is also visible — i.e. the same popup logic that decides a page is eligible for the reader link (non-video domains).

### Page tokenization + side panel

```text
┌──────────────────────────────────────────────┬──────────────────────────┐
│ News article page                            │ Side panel               │
│                                              │ ┌──────────────────────┐ │
│  パーシバルがいるからに決まってんだろ         │ │ LP │ [Read in     │ ✕ │ │
│  ＜clickable tokens＞                         │ ├──────────────────────┤ │
│                                              │ │     Language Player]  │ │
│                                              │ │ Translated text block │ │
│  [link text]                                 │ │ （translation…）      │ │
│  → shows Follow link in panel                │ ├──────────────────────┤ │
│                                              │ │ Text [pronunciation] x│ │
│  ＜more tokenized paragraphs…＞               │ │ [Follow Link ->]      │ │
│                                              │ │ [Let DeepSeek Explain]│ │
│                                              │ │ 単語 [pronunciation] n│ │
│                                              │ │ definition…           │ │
│                                              │ │ [Save]                │ │
│                                              │ └──────────────────────┘ │
└──────────────────────────────────────────────┴──────────────────────────┘
```

The side panel header shows the logo, the existing **Read in Language Player** button, and the close button — no L2 name in text mode.

## User Stories

- As a language learner reading a Japanese news article, I want to click any word on the page and see its dictionary entry in the side panel.
- As a user with translation enabled, I want the whole paragraph containing the clicked word to be translated in the side panel, not just the word.
- As a user reading tokenized pages, I want to be able to follow links without disabling the feature.
- As a user reading multiple articles, I want tokenization and the side panel to persist across navigation until I explicitly close the panel.
- As a privacy-conscious user, I want the feature to be opt-in and only run on pages where I enable it.

## Current Behavior (Baseline)

1. The content script only runs on video domains listed in `manifest.json` (Netflix, YouTube, Prime Video, Disney+, Hulu, Max).
2. The transcript panel is tied to video `STATE.cues[]` with `start`/`end` timestamps.
3. Tokenization (`POST /lemmatize-normalized/batch`) and translation (`POST /translate_array`) are already batched and lazy for video subtitles.
4. The dictionary card (`DictionaryCard`) already renders inside the panel for video mode.
5. The popup currently offers language selection, auth, and video-transcript controls; it has no webpage mode.

## Design Decisions

### Opt-in, persistent page mode

- The feature is **off by default**.
- The popup gets a **Make Text on Page Interactive** button.
- The button is only shown when the **Read in Language Player** button is also visible, using the same popup visibility logic (non-video domains).
- Enabling writes `pageTokenizationEnabled: true` to `chrome.storage.sync`.
- Closing the side panel sets `pageTokenizationEnabled: false`, cleans up token spans, and disconnects observers. It stays off on subsequent navigations until re-enabled.

### Separate page content script

- Add a dedicated `dist/page-content.js` bundle (from a new `src/page-content.js` entry point) instead of reusing the video content script.
- Register it in `manifest.json` for `http://*/*` and `https://*/*` at `document_idle`, with `all_frames: false`.
- The script is a no-op unless `pageTokenizationEnabled` is true, so broad matching does not affect pages the user has not enabled.
- This keeps video logic (player detection, subtitle interception, Netflix MAIN-world hooks) out of arbitrary pages.

### Tokenization model

- Scan the document for **visible text nodes**.
- Group text nodes into **blocks** using their nearest block-level ancestor (`p`, `li`, `h1`–`h6`, `blockquote`, `td`, `figcaption`, etc.).
- Skip `script`, `style`, `noscript`, `template`, `svg`, `canvas`, `iframe`, form controls, `[contenteditable]`, and elements with zero rendered size or `visibility: hidden` / `display: none`.
- Tokenize blocks strictly with the saved L2 from `chrome.storage.local.l2Language`. **Never auto-detect language.**
- Replace each block's text node(s) with token spans, preserving whitespace and existing line breaks.
- Use `IntersectionObserver` to tokenize only visible blocks first, then more as the user scrolls.
- Cache `text → tokens` per L2 in module memory so repeated blocks are not re-requested.
- Use a `MutationObserver` to tokenize newly added visible blocks on SPA navigation or dynamic content.
- If the user changes L2 while enabled, clear the old-L2 cache and re-tokenize all blocks.

### Side panel

- Reuse the **same panel component as video mode** — only the content differs: video mode scrolls time-synced subtitles; text mode shows the translated block and dictionary card.
- Shared shell: header with logo, the existing **Read in Language Player** button, and close button (no L2 name in text mode); scrollable content; bottom bar with translation toggle, ruby/furigana toggle, and text-scale controls.
- The ruby/furigana and translation toggles live only in the side panel's bottom bar, exactly like video mode. They are **not** duplicated in the popup.
- In page mode the panel shows:
  1. The translated text block containing the clicked token (when translation is enabled).
  2. The token with pronunciation and a dismiss (✕) control.
  3. **Follow Link ->** when the clicked token lives inside an `<a href>`.
  4. **Let DeepSeek Explain** (Pro).
  5. The dictionary entry for the token with pronunciation, part of speech, definition, and **Save**.

### Click interaction

- Clicking a token stops default navigation and opens/refocuses the side panel.
- The dictionary card renders exactly as in video mode.
- If translation is enabled, the containing block is sent to `/translate_array` and the translation is displayed in the panel.
- If the token is inside a link, the dictionary card shows **Follow link**. Clicking it navigates the current tab to the link's `href` (same-tab navigation by default; new-tab behavior is an open question).

### Persistence across navigation

- Because the page content script runs on every http/https page and checks the flag, enabling once keeps tokenization active across navigations.
- When a page loads with the flag enabled, the content script tokenizes and reopens the panel automatically.
- Closing the panel flips the flag off and performs cleanup; subsequent navigations stay clean until the user re-enables.

## Implementation Plan

### Popup

- Add **Make Text on Page Interactive** button to `popup.html` / `popup.js`.
- Show it only when the **Read in Language Player** button is visible (reuse the existing `isVideoDomain` / open-in-web visibility logic).
- Do **not** add ruby/furigana or translation toggles to the popup; they remain in the shared side panel bottom bar.
- When enabled, set `pageTokenizationEnabled = true`; when disabled, set `false` and send a `pageTokenizationOff` message to the active tab so it cleans up immediately.
- Add new i18n keys through the standard `translations.csv` workflow (e.g. `makeTextInteractive`, `followLink`, `pageTokenizationActive`).

### New page content script (`src/page-content.js`)

- Entry point bundled by `build.mjs` into `dist/page-content.js`.
- Responsibilities:
  - Read `pageTokenizationEnabled` and the saved L1/L2/phonetics/translation preferences.
  - Scan and tokenize visible blocks.
  - Render token spans with click handlers.
  - Own the page-mode side panel (or mount a shared React page panel).
  - Observe mutations and scroll/intersection for lazy tokenization.
  - Clean up on disable (restore original text nodes, close panel, disconnect observers).

### Shared panel refactor

- Use the **same panel component for video and text mode**, with a content slot that differs:
  - Video mode: scrollable, time-synced subtitle list.
  - Text mode: translated block + dictionary card (no scrolling subtitle list).
- The shared shell owns the header (logo + **Read in Language Player** + close; no L2 name in text mode), scroll area, and bottom bar (ruby, translation, text scale).
- Page mode reuses `DictionaryCard`, `SavedWordsProvider`, `useSubscription`, block translation, and the existing `lpv-*` CSS.

### Dictionary card changes

- Add an optional `followLink?: { href: string; label: string }` prop to `DictionaryCard`.
- Render **Follow link** as a button in the card footer when present.
- Clicking it calls `location.href = href` (same tab).

### Translation

- Add a `useBlockTranslation` hook (or extend `use-translate-lines.ts`) that translates a single block on demand:
  - `POST /translate_array` with `{ texts: [blockText], l1, l2 }`.
  - Displays loading/error states in the panel.
  - Only fires on lookup when translation is enabled.

### Build

- `build.mjs` bundles `src/page-content.js` → `dist/page-content.js` and copies any page CSS.
- `manifest.json` adds the page content script entry.

## API Endpoints

| Endpoint | Use |
|---|---|
| `POST /lemmatize-normalized/batch` | Tokenize page blocks strictly in saved L2 |
| `POST /dictionary/lookup` | Dictionary entry for a clicked token |
| `POST /translate_array` | Translate the containing block when translation is enabled |
| `POST /chatgpt` | Existing AI explanation path (Pro) |

## States & Edge Cases

- **Loading**: raw text remains visible while tokens are being fetched.
- **Tokenization error**: leave raw text, log via `[LP Extension]` helpers, retry on next interaction/scroll if practical.
- **Empty page**: panel opens with an empty-state message.
- **L2 change**: re-tokenize all visible blocks with the new L2.
- **Huge pages**: lazy viewport tokenization, batch limits (50 texts per request), and per-page block caps.
- **SPA navigation**: `MutationObserver` handles newly inserted content; panel remains open.
- **Link clicks**: token click does not navigate; **Follow link** in the dictionary card does.
- **Form inputs / editors**: skipped by the scanner so typing is never intercepted.
- **Unsupported pages** (`chrome://`, extension pages, PDF viewer): popup shows a message that the feature cannot run there.

## Dependencies

- Existing extension tokenization, translation, dictionary, saved-words, and subscription code.
- `packages/shared` language lists (`CONTENT_L2S` / `SUPPORTED_L1S`) and `packages/utils` helpers.
- `translations.csv` for new UI strings.
- `docs/arch/019-chrome-extension-architecture.md` for panel and build architecture.

## Open Questions

1. Should `pre`/code blocks be tokenized, or skipped as non-prose content?
2. Should ruby/furigana render inline in the page (which changes layout) or only in the side panel dictionary?
3. Should **Follow link** navigate the current tab or open a new tab?
4. Should page mode also run on supported video sites, or should video mode take precedence there?
5. What is the practical page-size cap for tokenization before batching/queueing needs more aggressive limits?
