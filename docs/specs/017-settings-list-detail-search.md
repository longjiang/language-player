# SPEC-017: Settings — List→Detail Pattern with Search (Web + Mobile)

## Metadata
- **Spec ID**: SPEC-017
- **Feature**: Migrate settings from monolithic tabbed layout to list→detail pattern with locale-agnostic search
- **Status**: draft
- **Created**: 2026-07-25
- **ROADMAP Phase**: Phase 7 — Mobile Integration (mobile first), Phase 8 — Sunset Classic (web follow-up)
- **See also**:
  - [ADR-0015: Settings UI and Search](../adr/0015-settings-ui-and-search.md) — architectural decisions
  - [SPEC-015: Mobile Settings Completion](../specs/015-mobile-settings-completion.md) — prerequisite (gap fixes)
  - [SPEC-016: Interaction Primitives Migration](../specs/016-interaction-primitives-migration.md) — dependency (Switch, Select primitives)
  - [ADR-0003: No Shared UI](../adr/0003-no-shared-ui.md) — rendering model boundary
  - [ADR-0011: Shared Design Tokens](../adr/0011-shared-design-tokens.md) — visual consistency

---

## Overview

Both platforms currently use a monolithic tabbed settings layout (Display / Playback / Speech / Review tabs in one file). This creates three problems:

1. **No search** — users must visually scan tabs to find controls; impossible to type "font" or "karaoke" and jump to the right setting
2. **Tab overflow** — 5 tabs with translated labels don't fit on narrow mobile screens; future categories make it worse
3. **Monolithic files** — ~340 lines of mixed concerns per platform; adding a control means scrolling through unrelated code

This spec implements the iOS-style list→detail pattern with a search bar — identical architecture on both platforms per ADR-0015.

---

## Current State

| | Web | Mobile |
|---|---|---|
| **File** | `app/[l1]/[l2]/settings/page.tsx` (~330 lines) | `app/(tabs)/(me)/settings.tsx` (~340 lines) |
| **Pattern** | `<TabbedPanel>` with 4 tabs | Inline tab bar with 4 tabs |
| **Search** | None | None |
| **Offline Dicts** | N/A | Separate screen |
| **Wide-screen** | Single column | Single column |

---

## User Stories

- As a user, I want to type "font" and see the Display category with the font picker highlighted
- As a German user, I want "Schrift" to find the same font setting
- As a user on a narrow phone, I don't want tab labels to truncate at 5+ categories
- As a developer, I want to add a new setting without editing a 340-line monster file

---

## Target Architecture

### File Structure

```
# Shared (packages/shared/src/)
settings-search-keys.ts          ← NEW: i18n key arrays for search

# Web (apps/web/src/app/[l1]/[l2]/settings/)
├── page.tsx                     ← Root list: search bar + grouped rows
├── layout.tsx                   ← Optional: two-column layout on wide screens
├── display/
│   └── page.tsx                 ← Display settings detail
├── playback/
│   └── page.tsx                 ← Playback settings detail
├── speech/
│   └── page.tsx                 ← Speech settings detail (VoicePicker)
└── review/
    └── page.tsx                 ← Review settings detail

# Mobile (apps/mobile/app/(tabs)/(me)/settings/)
├── _layout.tsx                  ← Stack navigator (unchanged from SPEC-015)
├── index.tsx                    ← Root list: search bar + grouped rows
├── display.tsx                  ← Display settings detail
├── playback.tsx                 ← Playback settings detail
├── speech.tsx                   ← Speech settings detail
├── review.tsx                   ← Review settings detail
└── _components/                 ← Shared sub-components (extracted from old file)
    ├── SliderRow.tsx
    ├── ToggleRow.tsx
    ├── SegmentedRow.tsx
    ├── SectionHeader.tsx
    └── SearchBar.tsx
```

### Root List Screen

```
┌──────────────────────────────┐
│ Settings                     │
│ 🔍 Search settings...        │
│ ── APPEARANCE ──             │
│ 🎨  Display           Dark › │
│ ▶   Playback    Transcript › │
│ 🔊  Speech   Voice & speed › │
│ ── LEARNING ──               │
│ 🔁  Review    20 cards/day › │
│ ── DATA ──                   │
│ 📥  Offline Dicts 3 langs ›  │   ← mobile only
└──────────────────────────────┘
```

Each row shows:
- **Icon** — category icon
- **Title** — localized category name
- **Subtitle** — current value summary (e.g., "Dark", "20 cards/day")
- **Chevron** — indicates tap/click to navigate

---

## Implementation Plan

### Phase 1: Shared — Search Key Definitions

**File**: `packages/shared/src/settings-search-keys.ts`

Define one array of `translations.csv` keys per category. These are the searchable labels — every control visible in settings must have its CSV key listed here.

```ts
export const SETTINGS_SEARCH_KEYS: Record<string, string[]> = {
  display: [
    'title.display', 'setting.theme', 'setting.light', 'setting.dark', 'setting.system',
    'label.font', 'setting.font_default', 'setting.font_serif', 'setting.font_sans_serif',
    'label.text_size',
    'label.show_phonetics', 'setting.phonetics_on_top', 'setting.phonetics_replace',
    'setting.off', 'setting.all_words', 'setting.hard_words_only',
    'label.show_gloss_saved', 'label.show_interlinear_gloss',
    'label.character_set', 'setting.simplified', 'setting.traditional',
    'label.show_hanja', 'label.show_hantu',
    'setting.quiz_mode',
    'label.show_translation', 'label.enable_popup_dictionary',
    'label.tokenized_text_preview',
    'label.preview_sentence',
  ],
  playback: [
    'title.playback', 'label.captions_display_as', 'title.transcript', 'label.subtitles',
    'label.smooth_scroll', 'label.karaoke', 'label.auto_pause',
  ],
  speech: [
    'title.speech', 'label.voice', 'label.speed', 'label.pitch', 'label.rate',
    'label.auto_best_for',
  ],
  review: [
    'title.review', 'label.new_cards_per_day',
  ],
  offline: [
    'title.offline_dictionaries',
  ],
};
```

**Verification**: Run `scripts/validate-icu.mjs` to confirm all keys exist in `translations.csv`.

### Phase 2: Mobile — List→Detail Migration

Mobile goes first because 5 tabs already overflow on 390pt screens.

#### 2.1 Extract Sub-Components

From the current monolithic `settings.tsx`, extract these reusable sub-components to `settings/_components/`:

| Component | Current location (in `settings.tsx`) | Props |
|---|---|---|
| `SectionHeader` | Already extracted (line ~16) | `{ title: string }` |
| `ToggleRow` | Inline in Display/Speech/Review tabs | `{ label: string; value: boolean; onValueChange: (v: boolean) => void }` |
| `SliderRow` | Inline in Display/Review tabs | `{ label: string; value: number; min: number; max: number; step: number; onValueChange: (v: number) => void; formatValue?: (v: number) => string }` |
| `SegmentedRow` | Inline in Display tab (theme, font, phonetics) | `{ label: string; options: { value: string; label: string }[]; value: string; onValueChange: (v: string) => void }` |
| `SearchBar` | NEW | `{ value: string; onChangeText: (v: string) => void; placeholder: string }` |

Each uses NativeWind className + shared design tokens. No `StyleSheet.create()`.

#### 2.2 Build Root List (`index.tsx`)

**Sections definition**:

```ts
interface SettingsRow {
  key: string;
  icon: React.ComponentProps<typeof Download>; // lucide icon component
  title: string;
  subtitle?: string;
  href: string; // expo-router path
}

interface SettingsSection {
  title: string; // section header, e.g., "APPEARANCE"
  rows: SettingsRow[];
}
```

**Search logic** (locale-agnostic, per ADR-0015):

```ts
const [query, setQuery] = useState('');
const [localizedLabels, setLocalizedLabels] = useState<Record<string, string[]>>({});

// Pre-resolve search keys on locale change (not per keystroke)
useEffect(() => {
  const result: Record<string, string[]> = {};
  for (const [category, keys] of Object.entries(SETTINGS_SEARCH_KEYS)) {
    result[category] = keys.map(key => t(key).toLowerCase());
  }
  setLocalizedLabels(result);
}, [l1Lang.code]);

// Filter on query change
const filteredSections = useMemo(() => {
  if (!query.trim()) return SECTIONS;
  const q = query.toLowerCase();
  return SECTIONS.map(s => ({
    ...s,
    rows: s.rows.filter(row => {
      if (row.title.toLowerCase().includes(q)) return true;
      if (row.subtitle?.toLowerCase().includes(q)) return true;
      const labels = localizedLabels[row.key];
      if (labels?.some(label => label.includes(q))) return true;
      return false;
    }),
  })).filter(s => s.rows.length > 0);
}, [query, localizedLabels]);
```

**Live subtitles**: Read current settings values to show summaries on each row. E.g., "20 cards/day" under Review, "Dark" under Display.

#### 2.3 Build Detail Screens

Each detail screen is self-contained (~50–150 lines). It receives settings via `useSettingsContext()` and `useLanguage()` — no prop drilling.

**`display.tsx`** — Theme (light/dark/system), font picker, text size stepper, show translation toggle, popup dictionary toggle, tokenized text preview with sample sentence, phonetics mode, word-level display options (quick gloss, interlinear gloss, character set, hanja, han tu), quiz mode.

**`playback.tsx`** — Captions display mode (transcript/subtitles), smooth scroll toggle, karaoke toggle, auto-pause toggle.

**`speech.tsx`** — VoicePicker (Select-based per SPEC-016), rate slider.

**`review.tsx`** — New cards per day stepper (1–200).

#### 2.4 iPad Split View

On screens ≥ 600pt, render side-by-side instead of stack navigation:

```tsx
const { width } = useWindowDimensions();
const [selectedKey, setSelectedKey] = useState<string | null>(null);

if (width >= 600) {
  return (
    <View className="flex-row flex-1">
      <View className="w-64 border-r border-border">
        <SettingsList onSelect={setSelectedKey} selected={selectedKey} />
      </View>
      <View className="flex-1">
        {selectedKey === 'display' && <DisplaySettings />}
        {/* ... other categories ... */}
      </View>
    </View>
  );
}
return <Stack />; // phone: stack navigation
```

### Phase 3: Web — List→Detail Migration

Web follows after mobile. The current `page.tsx` (~330 lines with `<TabbedPanel>`) is replaced.

#### 3.1 Extract Sub-Components

From the monolithic `page.tsx`, extract to `settings/_components/` (web):

| Component | Props (identical to mobile) |
|---|---|
| `SliderRow` | `{ label, value, min, max, step, onValueChange, formatValue }` |
| `ToggleRow` | `{ label, description?, checked, onChange }` |
| `SegmentedRow` | `{ label, options, value, onChange }` |
| `SectionHeader` | `{ title }` — rendered as `<h3>` with border-bottom |
| `SearchBar` | `{ value, onChange, placeholder }` — `<input type="search">` |

These use Tailwind classes + shared design tokens (identical pattern to mobile's NativeWind, different primitives per ADR-0003).

#### 3.2 Build Root List (`page.tsx`)

Same search logic as mobile (shared `SETTINGS_SEARCH_KEYS` from `packages/shared/`). Rows are `<Link>` components navigating to `/[l1]/[l2]/settings/display`, etc.

#### 3.3 Build Detail Pages

```tsx
// settings/display/page.tsx
export default function DisplaySettingsPage() {
  const { l1, l2 } = useLanguage();
  const settings = useSettingsContext();
  // ... reuse extracted SliderRow, ToggleRow, SegmentedRow, SectionHeader
}
```

Each detail page is a Next.js server component wrapper (with `'use client'` internally for interactivity).

#### 3.4 Two-Column Layout (`layout.tsx`)

```tsx
// settings/layout.tsx
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-8">
      <aside className="lg:border-r lg:border-border lg:pr-6">
        <SettingsList />
      </aside>
      <main>{children}</main>
    </div>
  );
}
```

Pure CSS — no JS breakpoint detection needed.

---

## Data Flow

```
SettingsContext (global state)
├── settings.display.theme → "dark" | "light" | "system"
├── settings.display.font → "default" | "serif" | "sans-serif"
├── settings.display.textSize → 14-24 (px)
├── settings.display.translation → boolean
├── settings.display.popupDictionary → boolean
├── settings.display.phonetics → "ruby" | "word" | "off"
├── settings.display.phoneticsCondition → "all" | "hard"
├── settings.display.gloss → boolean (quick gloss on saved words)
├── settings.display.interlinearGloss → boolean
├── settings.display.characterSet → "simplified" | "traditional"
├── settings.display.quizMode → boolean
├── settings.playback.captionsMode → "transcript" | "subtitles"
├── settings.playback.smoothScroll → boolean
├── settings.playback.karaoke → boolean
├── settings.playback.autoPause → boolean
├── settings.speech.voiceURI → string | undefined
├── settings.speech.rate → 0.25–2.0
├── settings.review.newCardsPerDay → 1–200
└── l2Settings[code].display.byeonggi → boolean (Korean hanja / Vietnamese hán tự)
```

Root list reads current values for live subtitles. Detail screens read and write via `useSettingsContext()`.

---

## States

| State | Handling |
|---|---|
| **Loading** | Settings context returns defaults immediately (no async fetch needed — hydrated from localStorage/SecureStore on mount). Root list renders immediately. |
| **Empty search** | All sections visible. Query is empty string. |
| **No search results** | Empty state: "No settings match [query]" with clear button |
| **Error** | Settings context handles persistence errors internally (logs, doesn't crash). No user-visible error state needed — settings always have defaults. |
| **Wide screen** | Web: CSS Grid two-column (≥ 1024px). Mobile: conditional `<View>` horizontal layout (≥ 600pt). |
| **Narrow screen** | Stack navigation. Back button/swipe to return to root list. |

---

## Dependencies

- **Shared**: `packages/shared/src/settings-search-keys.ts` (new)
- **Web**: shadcn/ui `Switch`, `Select` (SPEC-016), Next.js App Router nested routes
- **Mobile**: `@react-native-community/slider`, expo-router Stack navigator, `useWindowDimensions`
- **Both**: `useSettingsContext()`, `useLanguage()`, `useT()`, shared design tokens (ADR-0011)

---

## Testing Checklist

### Mobile
- [ ] **Root list**: All 5 categories visible with correct subtitles (e.g., "20 cards/day" under Review)
- [ ] **Search "font"**: Only Display row visible
- [ ] **Search "Schrift"** (German L1): Only Display row visible
- [ ] **Search no match**: Empty state shown
- [ ] **Tap Display**: Navigates to Display detail screen
- [ ] **Display detail**: Theme segmented control works, font picker works, text size stepper works, all toggles work
- [ ] **Back navigation**: Back swipe/button returns to root list with search state preserved
- [ ] **iPad split view**: Root list persistent on left, detail on right, no stack navigation
- [ ] **Offline Dicts row**: Visible, shows count of downloaded languages, taps to offline dictionaries screen

### Web
- [ ] **Root list**: All categories visible with correct subtitles
- [ ] **Search**: Same locale-agnostic behavior as mobile
- [ ] **Click Display**: Navigates to `/settings/display`
- [ ] **Display detail**: All controls work, browser back returns to root list
- [ ] **Two-column layout** (≥ 1024px): Root list as sidebar, detail in main area
- [ ] **TypeScript**: 0 errors on both platforms
- [ ] **Build**: `npm run build:check -w apps/web` passes

---

## Migration Order

| Step | Platform | What | Effort |
|---|---|---|---|
| 1 | Shared | Create `packages/shared/src/settings-search-keys.ts` | Small |
| 2 | Mobile | Extract sub-components from monolithic `settings.tsx` | Medium |
| 3 | Mobile | Build root list `index.tsx` with search | Medium |
| 4 | Mobile | Build 4 detail screens (display, playback, speech, review) | Medium |
| 5 | Mobile | Add iPad split view to `_layout.tsx` | Small |
| 6 | Mobile | Delete old monolithic `settings.tsx`, verify typecheck | Small |
| 7 | Web | Extract sub-components from `page.tsx` | Medium |
| 8 | Web | Build root list `page.tsx` with search | Medium |
| 9 | Web | Build 4 detail pages under `settings/display/`, etc. | Medium |
| 10 | Web | Add two-column layout via `layout.tsx` | Small |
| 11 | Web | Delete old `<TabbedPanel>` usage, verify typecheck + build | Small |
