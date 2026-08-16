# SPEC-028: Chrome Extension Translation Pipeline - MANUAL Key Audit

Date: 2026-07-30

## Eliminate from MANUAL (6)

Keys replaced with CSS spinners or visual indicators — no text needed.

| # | Key | UI Context | Source files | Replacement |
|---|---|---|---|---|
| 1 | `waitingForSubtitles` | Status text in transcript panel while waiting for video/captions | content-entry.js, transcript-app.tsx | CSS spinner animation |
| 2 | `loadingLanguage` | Loading indicator while downloading locale messages | transcript-app.tsx | CSS spinner |
| 3 | `thinking` | Inline text next to 'Explain' header while loading | transcript-app.tsx | CSS spinner (`lpv-spinner-sm`) |
| 4 | `subtitleEntriesLoaded` | Status bar text confirming subtitle cue count | content-entry.js | Visual only — cues appearing IS the confirmation |

## Map to existing CSV keys (9)

All extension-specific MANUAL keys are replaced by CSV keys already present in `translations.csv` with full 31-locale coverage. CSV_LOOKUP in generate-locales.js handles the mapping.

| # | Extension Key | → CSV Key | CSV English | UI Context |
|---|---|---|---|---|
| 1 | `interfaceLanguage` | `placeholder.select_language` | "Select a language" | Tooltip on L1 dropdown |
| 2 | `learningLanguage` | `placeholder.select_language` | "Select a language" | Tooltip on L2 dropdown |
| 3 | `actions` | `action.more` | "More" | Tooltip on `…` menu button |
| 4 | `aiThinking` | `msg.loading` | "Loading..." | AI explanation loading state |
| 5 | `loadingSubtitles` | `msg.loading` | "Loading..." | Status while fetching subtitles |
| 6 | `translating` | `subtitle.translating` | "Translating…" | Translation progress (progress shown as separate badge) |
| 7 | `popupEmailPlaceholder` | `placeholder.email` | "Email" | Popup email input placeholder |
| 8 | `popupPasswordPlaceholder` | `placeholder.password` | "Password" | Popup password input placeholder |
| 9 | `noTranscriptFound` / `popupNoTranscript` | `subtitle.subtitles_unavailable` | "Subtitles are not available for this video yet." | Popup "no transcript" state |

## Add new keys to CSV (11)

Keys with no existing CSV equivalent — need new entries in `translations.csv`.

| # | Key | English | UI Context | Source files |
|---|---|---|---|---|
| 1 | `startPlaying` | Start playing a video. | Instruction text when no subtitles detected yet | transcript-app.tsx |
| 2 | `failedToLoadSubtitles` | Failed to load subtitles | Error status when subtitle fetching/parsing fails | content-entry.js |
| 3 | `showTranscript` | Show Transcript | Button label in popup (also fallback for popupShowTranscript) | --- (fallback) |
| 4 | `extensionDescription` | Interactive dual subtitles and instant dictionary lookups for language learning on your favorite streaming sites. | manifest.json extension description | manifest.json |
| 5 | `popupLoginPrompt` | Log in to save words and sync with Language Player. | Prompt text above login form in popup | popup.js |
| 6 | `popupShowTranscript` | Show Transcript | Button label on transcript toggle when subtitles available | popup.js |
| 7 | `popupInstructions` | Start playing any video on **Prime Video**, **YouTube** or **Netflix**. The transcript panel opens automatically when subtitles are found. | Instructional HTML paragraph in popup | popup.js |
| 8 | `popupClickWord` | **Click** any word to look it up in the dictionary | Instructional HTML bullet - click words to look up | popup.js |
| 9 | `popupSaveWords` | **Save** words to your Language Player account | Instructional HTML bullet - save words to account | popup.js |
| 10 | `popupToggleShortcut` | Press Alt + T to toggle the panel | Instructional HTML bullet - Alt+T shortcut | popup.js |
| 11 | `popupCaptionsHint` | Make sure **captions are turned on** in the language you are studying. | Hint HTML - turn on captions if transcript missing | popup.js |

## Already migrated (2)
- `popularLanguages` -> `msg.popular_languages`
- `popupChecking` -> `msg.checking`

## Summary

| Category | Count |
|---|---|
| Already migrated to CSV | 2 |
| Eliminate from MANUAL (spinner/visual) | 4 |
| Map to existing CSV keys | 9 |
| Add new keys to CSV (still need 31-locale translations) | 11 |
| **Total originally in MANUAL** | **25** |

## Plan

1. Add `placeholder.select_language` to CSV_LOOKUP for both `interfaceLanguage` and `learningLanguage`
2. Add 19 new keys to translations.csv with English text using {name} format for placeholders
3. Update generate-locales.js: remove entire MANUAL object, add all keys to CSV_LOOKUP, add universal {name} -> $name$ placeholder conversion
4. Run generator and verify
5. Regenerate shared JSONs
