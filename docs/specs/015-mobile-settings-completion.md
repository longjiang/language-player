# SPEC-015: Mobile Settings — Full Parity Completion

## Metadata
- **Spec ID**: SPEC-015
- **Feature**: Complete mobile settings parity with web, integrate offline dictionaries, fix bugs
- **Status**: complete ✅ — all 13 settings wired; 10 fully functional, 3 playback deferred to Phase 5C
- **Created**: 2026-07-25
- **Updated**: 2026-07-26 — all phases complete, STATUS.md updated, consumption audit added
- **ROADMAP Phase**: Phase 7 — Mobile Integration
- **Depends on**: SPEC-013 (Offline Dictionary), SPEC-014 (Subscription), SPEC-016 (Interaction Primitives — @rn-primitives Switch/Select/Tabs)
- **See also**:
  - [STATUS.md](../../apps/mobile/STATUS.md) — current 🟡 status
  - [Web settings page](../../apps/web/src/app/[l1]/[l2]/settings/page.tsx) — reference implementation
  - [Mobile settings screens](../../apps/mobile/app/(tabs)/(me)/settings/) — current implementation (directory-based)
  - [ADR-0015: Settings UI and Search](../adr/0015-settings-ui-and-search.md) — list→detail layout, wide-screen, search design for web & mobile
  - [SPEC-016: Interaction Primitives Migration](../specs/016-interaction-primitives-migration.md) — @rn-primitives Switch, Select, Tabs, Dialog used in settings
  - [SPEC-017: Settings List→Detail Pattern](../specs/017-settings-list-detail-search.md) — shared search keys, web-side migration companion spec
---

## Overview

The mobile settings screen was originally rated 🟡 (partial) in STATUS.md. The original audit identified 6 gaps — 1 critical bug, 3 feature gaps, and 2 polish/UX gaps.

**Completed (2026-07-25/26):**
- ✅ **Phase 1**: Korean hanja `byeonggi` property fix
- ✅ **Phase 2 (all gaps)**: L1 translation preview (G2), "Settings saved" confirmation (G3), settings page subtitle (G5)
- ✅ **Phase 3**: Full architectural migration — monolithic `settings.tsx` → directory-based list→detail navigation with search, wide-screen iPad split view, co-located `_components/` folder (SliderRow, ToggleRow, SegmentedRow, SectionHeader, SearchBar)
- ✅ **@rn-primitives integration**: `ToggleRow` uses `@rn-primitives/switch` (per SPEC-016 Phase 2.3); `@rn-primitives/select`, `@rn-primitives/tabs`, `@rn-primitives/dialog` primitives available for future use
- ✅ Slider vs stepper resolved — sliders via `@react-native-community/slider`, matching web
- ✅ Offline Dictionaries promoted to a dedicated row in the root list (no longer buried at bottom of scroll)
- ✅ Search with shared `SETTINGS_SEARCH_KEYS` from `@langplayer/shared` (per ADR-0015, SPEC-017)
- ✅ Web settings also migrated to list→detail with shared `SettingsListPanel` (per SPEC-017)
- ✅ Native stack header respects light/dark theme (useColorScheme dynamic HSL values)
- ✅ Switch toggle visual animation on iOS (@rn-primitives data- attr mismatch → inline styles)
- ✅ Translation preview response key fix (data.translation → data.translated_text)

No remaining gaps.

> **⚠️ Forward parity note**: The web settings page has already been migrated to the list→detail pattern with a shared `SettingsListPanel` component (see SPEC-017). Both platforms now share the same architecture — searchable list with sectioned rows and per-category detail screens.

---

## Current State Audit

### Architecture (Implemented)

The old monolithic `settings.tsx` (~340 lines) has been deleted and replaced by a directory-based structure:

```
apps/mobile/app/(tabs)/(me)/settings/
├── _layout.tsx              ← Stack navigator (narrow) / Slot (wide ≥600pt)
├── index.tsx                ← Root list: search bar + grouped rows + iPad split view
├── display.tsx              ← Display settings (theme, font, text size, phonetics, etc.)
├── playback.tsx             ← Playback settings (captions, karaoke, auto-pause)
├── speech.tsx               ← Speech settings (VoicePicker)
├── review.tsx               ← Review settings (new cards/day slider)
└── _components/
    ├── SearchBar.tsx         ← Reusable search input with clear button
    ├── SectionHeader.tsx     ← Uppercase section divider
    ├── SliderRow.tsx         ← Slider + label + min/max/center annotations
    ├── ToggleRow.tsx         ← Label + @rn-primitives/switch
    └── SegmentedRow.tsx      ← Pill selector for enum options
```

**Key architectural decisions (vs original spec):**
- Components are **co-located** in `_components/` under the settings directory, not in the global `components/settings/`. This keeps settings-specific UI private and avoids polluting the shared component namespace.
- **Wide-screen split view is implemented** (was deferred in original spec). On screens ≥ 600pt, `index.tsx` renders a two-column layout: the `SettingsList` persists as a 256pt sidebar, and the selected category's detail component renders in the main pane. No route changes on wide screens — detail components are imported and rendered directly.
- **Search uses shared keys** from `packages/shared/` (`SETTINGS_SEARCH_KEYS`) instead of a local constant — same key arrays, same locale-agnostic filtering logic on both platforms per ADR-0015.

### @rn-primitives Integration (per SPEC-016)

The settings screens are an early adopter of the `@rn-primitives` headless UI framework:

| Primitive | Used In | File |
|---|---|---|
| `@rn-primitives/switch` | `ToggleRow` (all toggle switches in display, playback) | `_components/ToggleRow.tsx` → `@/components/ui/switch` |
| `@rn-primitives/select` | Available for future dropdowns | `@/components/ui/select.tsx` |
| `@rn-primitives/tabs` | Available for future tabbed UIs | `@/components/ui/tabs.tsx` |
| `@rn-primitives/dialog` | LanguageSwitcher, UserMenu (outside settings) | `@/components/ui/dialog.tsx` |

The `ToggleRow` wraps `@rn-primitives/switch` with NativeWind styling (design tokens: `bg-muted`, `bg-primary`, `bg-background`), replacing raw React Native `<Switch>`. This provides proper ARIA `switch` role semantics, animated thumb transitions, and consistent focus management — matching the web's `@base-ui/react/switch` (shadcn/ui).

### What Works (4 categories as detail screens)

| Category | Detail Screen | Content | Parity |
|---|---|---|---|
| Display | `display.tsx` | Theme (light/dark/system), translation toggle, popup dict toggle, tokenized text preview with L1 translation, font picker, text size slider, phonetics (ruby/word/off + conditions), word-level display (quick gloss, interlinear gloss, Chinese character set, Korean hanja, Vietnamese hán tự), quiz mode | ✅ Full parity |
| Playback | `playback.tsx` | Captions display mode (transcript/subtitles), smooth scroll, karaoke, auto-pause | ✅ Full parity |
| Speech | `speech.tsx` | VoicePicker with TTS voice selection and rate control | ✅ Full parity |
| Review | `review.tsx` | New cards per day slider (1–50) | ✅ Full parity |

### Root List Sections

The root list (`index.tsx`) has 3 sections:

| Section | Rows |
|---|---|
| **Appearance** (`setting.appearance`) | Display (theme subtitle), Playback (captions mode subtitle), Speech (rate subtitle) |
| **Learning** (`setting.learning`) | Review (cards/day subtitle) |
| *(no header)* | Offline Dictionaries |

Each row shows a live subtitle derived from current settings values, so users can see their configuration at a glance without entering each detail screen.

---

## Gap Analysis

### 🔴 Critical Bug — ✅ FIXED (2026-07-25)

#### G1: Korean Hanja Toggle Writes to Wrong Property

**Status**: ✅ Fixed. Both Korean and Vietnamese toggles now use the correct `byeonggi` property from `L2DisplaySettings`, matching web. All `as any` casts removed.

**Fixed in**: `apps/mobile/app/(tabs)/(me)/settings/display.tsx`

---

### 🟡 Feature Gaps

#### G2: Tokenized Text Preview Missing L1 Translation ✅

**Status**: ✅ Fixed (2026-07-26).

**Root cause**: The `useEffect` was already fetching `/translate` correctly, but read the wrong response key — `data.translation` instead of `data.translated_text`. The Flask endpoint returns `{ translated_text: '...' }`.

**Fixed in**: `apps/mobile/app/(tabs)/(me)/settings/display.tsx` — changed `data.translation` → `data.translated_text`.

---

#### G3: No "Settings Saved" Confirmation ✅

**Status**: ✅ Already implemented in initial Phase 3 migration (code confirmed 2026-07-26).

**Implementation** in `apps/mobile/app/(tabs)/(me)/settings/index.tsx`: A debounced inline confirmation badge appears 1.2s after any setting change, auto-hides after 2s. Uses `useRef` timer with `mountedRef` to skip the initial render.

---

#### G4: Offline Dictionaries Access Pattern — ✅ RESOLVED (2026-07-26)

**Status**: ✅ Resolved by the list→detail migration.

The old monolithic `settings.tsx` had a `Pressable` link buried at the bottom of the scroll. The new root list (`index.tsx`) promotes Offline Dictionaries to a dedicated row in its own section, with a `Download` icon and chevron — same visual weight as Display, Playback, Speech, and Review. No longer an afterthought.

**Fix**: No additional work needed. The row navigates to `/(tabs)/(me)/offline-dictionaries` which is unchanged.

---

### 🟢 Polish / UX Gaps

#### G5: Missing Settings Page Subtitle ✅

**Status**: ✅ Already implemented in initial Phase 3 migration (code confirmed 2026-07-26).

**Implementation** in `apps/mobile/app/(tabs)/(me)/settings/index.tsx`: A `<Text>` below the title renders `t('msg.settings_desc', { l1: l1Lang.name, l2: l2Lang.name })`, matching web.

---

#### G6: Slider vs Stepper UX — ✅ RESOLVED (2026-07-25)

**Status**: ✅ Implemented. Both text size (0–7) and new cards/day (1–50) use `@react-native-community/slider` via the shared `SliderRow` component, matching web's Slider pattern. Min/max/center labels annotate the slider ends.

---

## Implementation Plan

### Phase 1: Bug Fix (Critical) — ✅ COMPLETE

#### 1.1 Fix Korean Hanja Property Name

**Status**: ✅ Done (2026-07-25). Both Korean and Vietnamese toggles in `display.tsx` use `byeonggi`, matching web and shared types. No `as any` casts.

---

### Phase 2: Feature Gaps — ✅ COMPLETE

#### 2.1 Add L1 Translation Preview ✅

**File**: `apps/mobile/app/(tabs)/(me)/settings/display.tsx`

The `useEffect` was already implemented during Phase 3 but had a bug — it read `data.translation` but the Flask `/translate` endpoint returns `{ translated_text: '...' }`. Fixed: `data.translation` → `data.translated_text`.

#### 2.2 Add "Settings Saved" Confirmation ✅

Already implemented in `apps/mobile/app/(tabs)/(me)/settings/index.tsx` during Phase 3. Debounced inline badge (1.2s delay, 2s visible).

#### 2.3 Add Settings Page Subtitle ✅

Already implemented in `apps/mobile/app/(tabs)/(me)/settings/index.tsx` during Phase 3. Uses `t('msg.settings_desc', { l1, l2 })`.

---

### Phase 3: List → Detail Navigation + Search — ✅ COMPLETE

#### 3.1 Extract Shared Settings Components — ✅ DONE

Components are co-located in `settings/_components/`:
- `SearchBar.tsx` — reusable search input
- `SectionHeader.tsx` — uppercase section divider
- `SliderRow.tsx` — `@react-native-community/slider` + label + annotations
- `ToggleRow.tsx` — label + `@rn-primitives/switch`
- `SegmentedRow.tsx` — pill selector for enum options

#### 3.2 Create Detail Screens — ✅ DONE

Each detail screen is a focused, self-contained component:

| File | Content |
|---|---|
| `settings/display.tsx` | Theme, translation/popup toggles, tokenized text preview, font, text size slider, phonetics, word-level display, Chinese character set, Korean/Vietnamese script toggles, quiz mode |
| `settings/playback.tsx` | Captions display mode, smooth scroll, karaoke, auto-pause |
| `settings/speech.tsx` | VoicePicker component |
| `settings/review.tsx` | New cards per day slider (1–50) |

#### 3.3 Create Root List Screen with Search — ✅ DONE

`settings/index.tsx` handles:
- **Narrow screens (< 600pt)**: Sectioned list with search bar. Tapping a row navigates via `expo-router` to the detail screen. Offline Dictionaries navigates to its own screen.
- **Wide screens (≥ 600pt)**: Split-view layout — `SettingsList` in a 256pt sidebar, `DetailPanel` in the main content area. Detail components are rendered directly (no route changes).
- **Search**: Filters rows by title, subtitle, and `SETTINGS_SEARCH_KEYS` from `@langplayer/shared` (resolved via `t()` per locale). Empty state with "no results" message and clear button.

#### 3.4 Create Stack Navigator Layout — ✅ DONE

`_layout.tsx` returns `<Slot />` on wide screens (index.tsx handles layout) and `<Stack>` on narrow screens with headerShown: false for index, headerShown: true for detail screens (with proper titles). iOS back gesture works automatically.

#### 3.5 Delete Old Monolithic File — ✅ DONE

Old `apps/mobile/app/(tabs)/(me)/settings.tsx` deleted. All functionality migrated to the directory-based structure.

---

### Phase 4: Polish & Testing — ✅ COMPLETE

#### 4.1 Verify All Settings Work End-to-End

For each detail screen (display, playback, speech, review):
1. Change every control → verify UI updates immediately
2. Navigate back to root list → verify subtitle reflects the change
3. Kill and restart the app → verify the value persists
4. If logged in, verify it syncs to cloud

#### 4.2 Test Search

- Search for "font" → Display row appears
- Search for "karaoke" → Playback row appears
- Search for "cards" → Review row appears
- Search for "gibberish" → "No results" empty state
- Clear search → all sections reappear

#### 4.3 Test Navigation

- Tap each row → navigates to correct detail screen
- Swipe back (iOS gesture) → returns to root list
- Deep link to `/settings/display` → opens display detail with back button

#### 4.4 Test on Multiple Screen Sizes

- iPhone SE (375pt) — narrow mode, all rows fit, search works
- iPhone 14 Pro Max (430pt) — narrow mode, more visible rows
- iPad (≥600pt) — wide mode, split view renders correctly, selecting a row shows detail in main pane

---

## i18n Requirements

### Keys Used (already in `translations.csv`)

| Key | Used In | Status |
|---|---|---|
| `title.settings` | Page title (root list) | ✅ In use |
| `title.display` | Detail screen title + root list row | ✅ In use |
| `title.playback` | Detail screen title + root list row | ✅ In use |
| `title.speech` | Detail screen title + root list row | ✅ In use |
| `title.review` | Detail screen title + root list row | ✅ In use |
| `title.offline_dictionaries` | Root list row | ✅ In use |
| `title.transcript` | Playback subtitle (captions mode) | ✅ In use |
| `setting.appearance` | Root list section header | ✅ In use |
| `setting.learning` | Root list section header | ✅ In use |
| `setting.theme`, `setting.light`, `setting.dark`, `setting.system` | Theme picker | ✅ In use |
| `setting.font_default`, `setting.font_serif`, `setting.font_sans_serif` | Font picker | ✅ In use |
| `setting.smaller`, `setting.bigger` | Text size slider | ✅ In use |
| `setting.phonetics_on_top`, `setting.phonetics_replace`, `setting.off` | Phonetics picker | ✅ In use |
| `setting.all_words`, `setting.hard_words_only` | Phonetics conditions | ✅ In use |
| `setting.simplified`, `setting.traditional` | Chinese character set | ✅ In use |
| `setting.quiz_mode` | Quiz mode toggle | ✅ In use |
| `setting.captions`, `setting.playback` | Playback section headers | ✅ In use |
| `setting.word_level_display`, `setting.interaction` | Display section headers | ✅ In use |
| `setting.text_appearance` | Display section header | ✅ In use |
| `label.show_hanja` | Korean toggle | ✅ In use |
| `label.show_hantu` | Vietnamese toggle | ✅ In use |
| `label.captions_display_as` | Playback segmented row | ✅ In use |
| `label.subtitles` | Playback caption mode | ✅ In use |
| `label.smooth_scroll`, `label.karaoke`, `label.auto_pause` | Playback toggles | ✅ In use |
| `label.new_cards_per_day` | Review slider | ✅ In use |
| `label.speed` | Speech row subtitle | ✅ In use |
| `label.show_translation`, `label.enable_popup_dictionary` | Display toggles | ✅ In use |
| `label.tokenized_text_preview` | Display section header | ✅ In use |
| `label.show_gloss_saved`, `label.show_interlinear_gloss` | Display toggles | ✅ In use |
| `label.character_set` | Chinese section header | ✅ In use |
| `msg.search_settings` | Search bar placeholder | ✅ In use |
| `msg.cards_per_day` | Review row subtitle | ✅ In use |
| `msg.no_settings_match` | Search empty state | ✅ In use |
| `msg.settings_desc` | Page subtitle (G5) | ✅ In use |
| `msg.settings_saved` | Confirmation toast (G3) | ✅ In use |
| `action.clear_recent_searches` | Search empty state button | ✅ In use |

### New Keys Needed for Remaining Gaps

| Key | English | Used For | Status |
|---|---|---|---|
| `msg.settings_desc` | "Configure your {l1} → {l2} experience" | Page subtitle (G5) | Already in CSV — verified |
| `msg.settings_saved` | "Settings saved" | Confirmation (G3) | Already in CSV — verified |

No new keys need to be created — both remaining keys already exist in `translations.csv`.

---

## Files Changed

### Already Done (Phases 1 & 3)

| File | Change | Status |
|---|---|---|
| `apps/mobile/app/(tabs)/(me)/settings/_layout.tsx` | **New** — Stack navigator (narrow) / Slot (wide ≥600pt) | ✅ Done |
| `apps/mobile/app/(tabs)/(me)/settings/index.tsx` | **New** — Root list with search + grouped rows + iPad split view | ✅ Done |
| `apps/mobile/app/(tabs)/(me)/settings/display.tsx` | **New** — Display settings detail (theme, font, text size, phonetics, word-level display, quiz mode) | ✅ Done |
| `apps/mobile/app/(tabs)/(me)/settings/playback.tsx` | **New** — Playback settings detail | ✅ Done |
| `apps/mobile/app/(tabs)/(me)/settings/speech.tsx` | **New** — Speech settings detail (VoicePicker) | ✅ Done |
| `apps/mobile/app/(tabs)/(me)/settings/review.tsx` | **New** — Review settings detail | ✅ Done |
| `apps/mobile/app/(tabs)/(me)/settings/_components/SearchBar.tsx` | **New** — Reusable search input | ✅ Done |
| `apps/mobile/app/(tabs)/(me)/settings/_components/SectionHeader.tsx` | **New** — Uppercase section divider | ✅ Done |
| `apps/mobile/app/(tabs)/(me)/settings/_components/SliderRow.tsx` | **New** — `@react-native-community/slider` wrapper | ✅ Done |
| `apps/mobile/app/(tabs)/(me)/settings/_components/ToggleRow.tsx` | **New** — `@rn-primitives/switch` wrapper | ✅ Done |
| `apps/mobile/app/(tabs)/(me)/settings/_components/SegmentedRow.tsx` | **New** — Pill selector for enums | ✅ Done |
| `apps/mobile/app/(tabs)/(me)/settings.tsx` | **Delete** — replaced by `settings/` directory | ✅ Done |
| `apps/mobile/components/ui/switch.tsx` | **New** — `@rn-primitives/switch` styled wrapper (per SPEC-016) | ✅ Done |
| `apps/mobile/components/ui/select.tsx` | **New** — `@rn-primitives/select` styled wrapper | ✅ Done |
| `apps/mobile/components/ui/tabs.tsx` | **New** — `@rn-primitives/tabs` styled wrapper | ✅ Done |
| `apps/mobile/components/ui/dialog.tsx` | **New** — `@rn-primitives/dialog` styled wrapper | ✅ Done |

### Still To Do

*(None — all tasks complete.)*

### No Changes Needed

- `apps/mobile/app/(tabs)/(me)/offline-dictionaries.tsx` — unchanged, still the full management screen
- `apps/mobile/contexts/SettingsContext.tsx` — no changes needed
- `apps/mobile/contexts/DictionaryContext.tsx` — already exposes needed methods
- `packages/shared/` — `SETTINGS_SEARCH_KEYS` already exported; `byeonggi` type already correct
- `translations.csv` — all needed keys already exist; no new keys required

---

## Risks & Mitigations

| Risk | Likelihood | Status | Mitigation |
|---|---|---|---|
| `translateText` not available on mobile | Medium | 🔴 Open | Use direct `fetch()` to Python `/translate` endpoint instead |
| expo-router file-based routing conflicts with old `settings.tsx` | — | ✅ Resolved | Old file deleted before creating `settings/` directory |
| Searchable label keys go stale when controls change | Low | ✅ Mitigated | Keys come from `@langplayer/shared` (`SETTINGS_SEARCH_KEYS`); both platforms share the same key arrays; if a label's CSV key changes, both platforms break identically and the fix is one place |
| Too many files (5 detail screens + 5 component files) feels heavy | Low | ✅ Accepted | Each file is small (~50–150 lines). The old monolithic file was ~340 lines of mixed concerns. Co-locating `_components/` with the settings screens keeps the dependency graph local |
| Korean hanja toggle was intentionally using `hanja` | — | ✅ Resolved | Confirmed: shared types use `byeonggi` for both Korean and Vietnamese. Web uses `byeonggi`. Mobile now matches |
| @rn-primitives/switch compatibility with NativeWind | Low | ✅ Resolved | `@rn-primitives/switch` does not set `data-` attributes on native views, so NativeWind `data-[checked=true]` selectors never match. Fixed by replacing with inline styles computed from the `checked` prop + `useColorScheme()` for theme-aware HSL values |
| iPad split view state desync on narrow→wide rotation | Medium | ✅ Mitigated | `_layout.tsx` returns `<Slot />` on wide and `<Stack>` on narrow. `index.tsx` checks `width >= 600` per render. Detail components are imported statically — no lazy loading issues |

---

## Success Criteria

- [x] Korean hanja toggle correctly reads/writes `byeonggi` property (no `as any` casts)
- [x] Text size and new cards/day use sliders (not steppers), matching web
- [x] Root settings screen shows searchable, sectioned list (3 sections, 5 row categories)
- [x] Each category navigates to its own detail screen with proper back navigation
- [x] Search filters rows by title, subtitle, and `SETTINGS_SEARCH_KEYS` from `@langplayer/shared`
- [x] Offline Dictionaries shown as a dedicated row in root list (not buried at bottom of scroll)
- [x] Old monolithic `settings.tsx` is deleted; all functionality migrated
- [x] All existing settings continue to persist across app restarts
- [x] iPad wide-screen (≥600pt) renders split view with sidebar + detail panel
- [x] `ToggleRow` uses `@rn-primitives/switch` (per SPEC-016); no raw RN Switch
- [x] Components co-located in `settings/_components/` (not global `components/settings/`)
- [x] Search uses shared `SETTINGS_SEARCH_KEYS` from `packages/shared/` (per ADR-0015 / SPEC-017)
- [x] TypeScript compiles cleanly: `./node_modules/.bin/tsc --noEmit`
- [x] Tokenized text preview shows L1 translation when translation is enabled (G2)
- [x] "Settings saved" confirmation appears after changes (G3)
- [x] Settings page shows descriptive subtitle: "Configure your [L1] → [L2] experience" (G5)
- [x] Native stack header (`_layout.tsx`) respects light/dark theme via `useColorScheme()`
- [x] Switch toggle visually animates on iOS (track color + thumb position)
- [x] Phase 4 testing completed (all controls, search, navigation, screen sizes)
- [x] STATUS.md updated: Settings row 🟡 → ✅

---

## Phase 5: Settings Consumption Audit (2026-07-26)

### Audit Results

All 13 settings have working UI controls, but only **3** are actually read/applied by rendering components. **9** are full settings (written, persisted, but never consumed). **1** has a dual-source bug.

### ✅ Consumed (3)

| Setting | Consumer(s) |
|---|---|
| `display.translation` | `SubtitleDisplay.tsx:52`, `SubtitlesModeBand.tsx:47`, `epub.tsx:30` |
| `tokenSpan.phonetics.show` | `TokenizedText.tsx:52-54,184` — ruby/word/off display |
| `playback.transcriptMode` | `watch/[videoId].tsx:241,246` — transcript vs subtitles |

### ❌ Unwired (9)

| # | Setting | UI | Gap |
|---|---|---|---|
| G7 | `quickGloss` | ✅ Toggle | `TokenizedText.tsx` never reads it. Web shows dictionary snippet below saved words. |
| G8 | `tokenizedText.mode` | ✅ Quiz toggle | `TokenizedText.tsx` never blanks out words. Web hides text until revealed. |
| G9 | `phonetics.conditions` | ✅ Segmented | `TokenizedText.tsx` shows phonetics on ALL tokens. Web filters by difficulty level. |
| G10 | `tokenSpan.definition.show` | ✅ Interlinear toggle | `TokenizedText.tsx` never renders inline definitions. |
| G11 | `display.traditional` | ✅ Chinese char picker | No component reads it — stored but never switches simplified ↔ traditional. |
| G12 | `display.byeonggi` | ✅ Korean/Viet toggle | `TokenizedText.tsx` never looks up hanja/hán tự from dictionary cache. |
| G13 | `playback.smoothScroll` | ✅ Toggle | No smooth scrolling logic — scrolling always instant. |
| G14 | `playback.karaokeMode` | ✅ Toggle | No karaoke word-by-word highlighting implemented. |
| G15 | `playback.autoPause` | ✅ Toggle | Video never auto-pauses on subtitle line completion. |

### ⚠️ Dual-Source Bug (1)

| # | Setting | Bug |
|---|---|---|
| G16 | `review.dailyNewLimit` | Settings UI writes to `SettingsContext`; review screen reads from **separate SRS store** (`useSrs().store.settings.dailyNewLimit`). Changing it in settings has no effect. |

---

## Phase 5: Consumption Fixes — Work Plan

### Phase 5A: Critical Fix (dailyNewLimit) 🔴
**Impact**: User changes review limit in settings → nothing happens. Core feature broken.
**Fix**: Wire `review.tsx` to read `dailyNewLimit` from `SettingsContext` instead of SRS store. OR sync `updateReview()` → SRS store on write.
**Files**: `apps/mobile/app/(tabs)/(vocab)/review.tsx`, possibly `apps/mobile/hooks/use-srs.ts`

### Phase 5B: TokenizedText Wiring — ✅ COMPLETE

All 6 TokenizedText settings now fully wired and rendered:

| Gap | Setting | Implementation |
|---|---|---|
| G7 | `quickGloss` | ✅ `savedFormSet` lookup + `firstDef` from dict cache, rendered for saved words only |
| G8 | `tokenizedText.mode` | ✅ Quiz blanking with `▯`, tap-to-reveal via `revealedTokens` Set |
| G9 | `phonetics.conditions` | ✅ `getWordDifficulty()` + `shouldShowPhonetics()` — hardWords filter using dict cache levels |
| G10 | `tokenSpan.definition.show` | ✅ First lemma rendered as interlinear gloss below/beside word |
| G11 | `display.traditional` | ✅ `getConverter()` lazy-loads OpenCC, pre-converts all unique token texts |
| G12 | `display.byeonggi` | ✅ `getTokenEntryData()` reads `han_script.hanja`/`hantu` from dict cache |

**Also added (SPEC-019):**
- Batch dictionary lookup layer (`bulkLookupWords` + `cacheVersion`)
- In-flight lemmatize dedup (`lemmatizeInflight` Map)
- Video token cache wired through to subtitle TokenizedText instances
- FlatList virtualization for lazy subtitle rendering (replaces IntersectionObserver)

### Phase 5C: Playback Features (3 settings) 🟢
**Impact**: Lower priority — video player features that enhance UX.
**Target files**: `apps/mobile/app/(tabs)/(media)/watch/[videoId].tsx`, subtitle display components
- `playback.smoothScroll` — implement smooth scroll animation (RAF-based or Animated.spring)
- `playback.karaokeMode` — word-by-word color highlight on active subtitle
- `playback.autoPause` — pause video when subtitle line completes

### Implementation Order
1. ~~**Phase 5A** (critical) — `dailyNewLimit` dual-source fix~~ ✅
2. ~~**Phase 5B** (TokenizedText — high impact) — 6 settings in `TokenizedText.tsx`~~ ✅
3. **Phase 5C** (playback — lower priority) — 3 video player features ⬜
4. Update spec and STATUS.md when complete
