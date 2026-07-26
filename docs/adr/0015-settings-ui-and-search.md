# ADR 0015: Settings UI and Search — List→Detail Pattern for Web & Mobile

> **Status:** Accepted
> **Date:** 2026-07-25
> **Replaces:** N/A (new architecture)
> **See also:**
> - [SPEC-015: Mobile Settings Completion](../specs/015-mobile-settings-completion.md) — mobile implementation plan
> - [ADR-0002: Next.js App Router](../adr/0002-nextjs-app-router.md) — web architecture context
> - [ADR-0003: No Shared UI](../adr/0003-no-shared-ui.md) — rendering model boundary
> - [ADR-0010: Port Web to Mobile — Fresh Start](../adr/0010-port-web-to-mobile-fresh-start.md) — mobile porting principles

---

## Context

Both the **web app** (`apps/web/src/app/[l1]/[l2]/settings/page.tsx`, ~330 lines) and the **mobile app** (`apps/mobile/app/(tabs)/(me)/settings.tsx`, ~340 lines) currently use a monolithic tabbed layout with a `<TabbedPanel>` or inline tab bar. Tabs are: Display / Playback / Speech / Review. Offline Dictionaries is a separate screen linked from the bottom of mobile settings.

We need to:
1. Add Offline Dictionaries as a first-class settings category
2. Add settings search (impossible with the current tab pattern)
3. Plan for future settings categories without layout breakage
4. Keep web and mobile on the same architecture to reduce maintenance drift

This ADR covers two interdependent architectural decisions that apply to **both platforms**: **layout pattern** and **search design**.

### Current State

| | Web | Mobile |
|---|---|---|
| **File** | `settings/page.tsx` (~330 lines) | `settings.tsx` (~340 lines) |
| **Pattern** | `<TabbedPanel>` with 4 tabs | Inline tab bar with 4 tabs |
| **Search** | None | None |
| **Offline Dicts** | N/A (web-only, online lookup) | Separate screen, linked from bottom |
| **Routing** | Next.js App Router `/[l1]/[l2]/settings` | expo-router `(tabs)/(me)/settings` |

Both use `useSettingsContext()` (global state) and `useT()` (shared i18n). The tab content is nearly identical across platforms — same controls, same labels, same settings keys.

---

## Decision 1: Layout Pattern — List → Detail (Both Platforms)

### The Problem with Tabs

1. **Overflow** — At 5 tabs, translated labels (e.g., German "Wiedergabe" = 10 chars, "Offline-Wörterbücher" = 20 chars) overflow on 390pt mobile screens. Even on web at narrow viewports (~768px tablet), 5 tabs with padding can wrap or truncate.
2. **No search** — Tabs require visual scanning. Users can't type "font" to jump to the Display tab's text-size control.
3. **Poor scalability** — Each new category adds another tab. There is no ceiling.
4. **Monolithic files** — All tab content lives in one file with conditional rendering. Adding a control means scrolling through ~340 lines of mixed concerns.

### Options Considered

| Option | Verdict |
|---|---|
| **A: Scrollable tab bar** | Rejected. Mitigates overflow but doesn't solve search, scalability, or file organization. Hidden tabs hurt discoverability on mobile. |
| **B: Icon tabs (compact)** | Rejected. Icons alone are ambiguous across cultures. Breaks consistency with the rest of both apps. |
| **C: Keep separate screen for offline dicts** | Rejected. Keeps it as a second-class feature. Doesn't solve any of the structural problems. |
| **D: List → detail + search** | ✅ Selected. |

### Decision: Sectioned List with Detail Navigation

**Pattern**: A root screen with a search bar and grouped rows. Tapping a row navigates to a dedicated detail screen. One file per category. This is the canonical settings pattern — used by iOS Settings, macOS System Settings, VS Code, and Spotify.

#### Web (Next.js App Router)

```
apps/web/src/app/[l1]/[l2]/settings/
├── page.tsx                  ← Root list: search bar + grouped rows
├── display/
│   └── page.tsx              ← Display settings detail
├── playback/
│   └── page.tsx              ← Playback settings detail
├── speech/
│   └── page.tsx              ← Speech settings detail (VoicePicker)
├── review/
│   └── page.tsx              ← Review settings detail
└── layout.tsx                ← Optional shared layout (back link, two-column on wide screens)
```

Web uses Next.js nested routes (each category is a folder with its own `page.tsx`). The root `page.tsx` renders the searchable list. Back navigation is a `<Link>` or browser back button.

#### Mobile (expo-router)

```
apps/mobile/app/(tabs)/(me)/settings/
├── _layout.tsx               ← Stack navigator
├── index.tsx                 ← Root list: search bar + grouped rows
├── display.tsx               ← Display settings detail
├── playback.tsx              ← Playback settings detail
├── speech.tsx                ← Speech settings detail
├── review.tsx                ← Review settings detail
└── (offline-dictionaries)    ← Linked from root row, lives at peer level
```

Mobile uses expo-router file-based routing. The Stack navigator provides native back-swipe gesture.

#### Shared Architecture

```
Root list (both platforms):           Detail screen (both platforms):
┌──────────────────────────────┐      ┌──────────────────────────────┐
│ Settings                     │      │ ← Display                    │
│ 🔍 Search settings...        │      │ ── THEME ──                  │
│ ── APPEARANCE ──             │      │ Theme   Light·Dark·System    │
│ 🎨  Display           Dark › │      │ ── TEXT ──                   │
│ ▶   Playback    Transcript › │      │ Font    Default·Serif·Sans   │
│ 🔊  Speech   Voice & speed › │      │ Size    ────●──── 20px      │
│ ── LEARNING ──               │      │ ...                          │
│ 🔁  Review    20 cards/day › │      └──────────────────────────────┘
│ ── DATA ──                   │
│ 📥  Offline Dicts 3 langs ›  │
└──────────────────────────────┘
```

**Why this wins for both platforms:**

1. **Never overflows** — list rows don't truncate regardless of label length or viewport width
2. **Infinitely scalable** — adding a category = adding one row; no layout redesign
3. **Search is natural** — text input at the top; see Decision 3
4. **Focused files** — each category is its own file (~50–150 lines) with its own state
5. **Same architecture on both platforms** — web and mobile use the same pattern, same file naming, same row/subtitle/search logic. Only the UI primitives differ (React DOM vs React Native per ADR-0003)
6. **Familiar** — iOS, macOS, Android, and Windows all use this pattern for settings

### Shared Sub-Components

Both platforms extract the same sub-components from their old monolithic files. Props are identical; rendering differs per platform (ADR-0003):

| Component | Web | Mobile |
|---|---|---|
| `SliderRow` | `<input type="range">` | `<Slider>` from `@react-native-community/slider` |
| `ToggleRow` | `<input type="checkbox">` + `<label>` | `<Switch>` |
| `SegmentedRow` | `<button>` group | `<Pressable>` group |
| `SectionHeader` | `<h3>` with border | `<Text>` with border |
| `SearchBar` | `<input type="search">` | `<TextInput>` |

### Wide-Screen Adaptation

The same list→detail pattern adapts to wider screens by replacing stack navigation with a persistent sidebar. The detail screens themselves are unchanged — only the layout wrapper differs.

**Web — two-column layout (immediate):** On viewports ≥ 768px, render the root list as a sidebar (~240px) with the selected detail in the main area via CSS Grid in a Next.js layout:

```tsx
// settings/layout.tsx (web)
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-8">
      <aside className="lg:border-r lg:border-border lg:pr-6">
        <SettingsList />  {/* root list — always visible on wide screens */}
      </aside>
      <main>{children}</main>  {/* selected detail page */}
    </div>
  );
}
```

No JavaScript breakpoint needed — pure CSS. Next.js layouts automatically wrap all nested routes, so detail pages render as `children` with no component changes.

**Mobile — iPad split view (immediate):** On screens ≥ 600pt, conditionally render side-by-side instead of using the Stack navigator:

```tsx
const { width } = useWindowDimensions();
if (width >= 600) {
  return (
    <View className="flex-row flex-1">
      <View className="w-64 border-r border-border"><SettingsList /></View>
      <View className="flex-1">{selectedKey === 'display' && <DisplaySettings />}</View>
    </View>
  );
}
return <Stack />;
```

**Key constraint**: Detail screens receive settings via `useSettingsContext()` (global) — no prop drilling. The same `<DisplaySettings />` works in stack navigation (phone) and conditional rendering (iPad/wide web) without changes. Split view is a pure layout wrapper.


## Decision 2: Search — Locale-Agnostic via i18n Key Arrays (Both Platforms)

### The Problem

The search bar must filter settings categories by matching against control labels — not just the category title. The app supports **31 locales**. Hardcoding English strings (e.g., `'theme', 'font', 'karaoke'`) fails for non-English users.

Both platforms share `translations.csv` and `useT()`. The search solution must work identically on web and mobile.

### Options Considered

| Option | Verdict |
|---|---|
| **A: Hardcoded English strings** | Rejected. Fails for 30 of 31 locales. |
| **B: Titles + subtitles only** | Rejected. No deep search — "karaoke", "font", "cards" match nothing. |
| **C: Build-time inverted index from CSV** | Rejected. Adds a build step, ~1MB of JSON, can't handle ICU `{n}` placeholders. |
| **D: i18n key arrays + cached resolution** | ✅ Selected. |

### Decision: Translation-Key Arrays with Cached Resolution

**Mechanism** — identical on both platforms:

1. **Store keys, not strings** — Each category has an array of `translations.csv` keys. This array lives in `packages/shared/src/settings-search-keys.ts` so both apps import the same definition:

```ts
// packages/shared/src/settings-search-keys.ts
export const SETTINGS_SEARCH_KEYS: Record<string, string[]> = {
  display: [
    'setting.theme', 'setting.light', 'setting.dark', 'setting.system',
    'label.font', 'setting.font_default', 'setting.font_serif', 'setting.font_sans_serif',
    'label.text_size', 'setting.smaller', 'setting.bigger',
    'label.show_phonetics', 'setting.phonetics_on_top', 'setting.phonetics_replace',
    'setting.off', 'setting.all_words', 'setting.hard_words_only',
    'label.show_gloss_saved', 'label.show_interlinear_gloss',
    'label.character_set', 'setting.simplified', 'setting.traditional',
    'label.show_hanja', 'label.show_hantu',
    'setting.quiz_mode',
    'label.show_translation', 'label.enable_popup_dictionary',
    'label.tokenized_text_preview',
  ],
  playback: [
    'label.captions_display_as', 'title.transcript', 'label.subtitles',
    'label.smooth_scroll', 'label.karaoke', 'label.auto_pause',
  ],
  speech: ['label.voice', 'label.speed', 'label.rate', 'label.pitch'],
  review: ['label.new_cards_per_day'],
  offline: ['title.offline_dictionaries', 'action.download', 'action.delete'],
};
```

2. **Pre-resolve once on locale change** — When L1 changes, resolve all keys through `t()` and cache:

```ts
const [localizedLabels, setLocalizedLabels] = useState<Record<string, string[]>>({});

useEffect(() => {
  const result: Record<string, string[]> = {};
  for (const [category, keys] of Object.entries(SETTINGS_SEARCH_KEYS)) {
    result[category] = keys.map(key => t(key).toLowerCase());
  }
  setLocalizedLabels(result);
}, [l1Code]); // re-resolves only on L1 switch — not per keystroke
```

On web, the locale change triggers a re-render via the language provider. On mobile, via `l1Lang.code`.

3. **Search against cached strings** — Three-tier matching:

```ts
const filteredSections = useMemo(() => {
  if (!query.trim()) return SECTIONS;
  const q = query.toLowerCase();
  return SECTIONS.map(s => ({
    ...s,
    rows: s.rows.filter(row => {
      // Tier 1: title (already localized at render time)
      if (row.title.toLowerCase().includes(q)) return true;
      // Tier 2: subtitle (already localized at render time)
      if (row.subtitle?.toLowerCase().includes(q)) return true;
      // Tier 3: control labels (pre-resolved from shared keys)
      const labels = localizedLabels[row.key];
      if (labels?.some(label => label.includes(q))) return true;
      return false;
    }),
  })).filter(s => s.rows.length > 0);
}, [query, localizedLabels]);
```

**Performance**: ~30 keys × `t()` on locale switch (sub-millisecond). Per-keystroke: array `.includes()` only — no `t()` calls.

**Example — German user searching "Schrift" on web or mobile**:
1. `l1Code === 'de'` → `localizedLabels['display']` resolves `label.font` → `"schrift"`
2. User types "Schrift" → `"schrift".includes("schrift")` → match → Display row appears

**Trade-offs**:
- ✅ All 31 locales work automatically — no per-locale code
- ✅ Keys are self-documenting (same keys the UI uses)
- ✅ No build step, no extra data files
- ✅ One source of truth in `packages/shared/` — both platforms stay in sync
- ❌ Every searchable control must have a CSV key (most already do)
- ❌ If a key changes, the shared array must be updated

---

## Implementation Order

| Phase | Platform | What |
|---|---|---|
| **Now** (Phase 7) | Mobile | Migrate from monolithic tabbed `settings.tsx` to `settings/` directory with list→detail + search + iPad split view |
| **Now** (Phase 7) | Shared | Extract `SETTINGS_SEARCH_KEYS` to `packages/shared/src/settings-search-keys.ts` |
| **Next** (Phase 8) | Web | Migrate `settings/page.tsx` from `<TabbedPanel>` to `settings/` directory with list→detail + search + two-column layout |

Mobile goes first because it has the more urgent layout constraints (5 tabs don't fit). Web follows for cross-platform consistency.

---

## Consequences

### Positive
- Settings scales to any number of categories without layout redesign on either platform
- Search works in all 31 locales without per-locale maintenance
- Each category is its own focused file (separation of concerns)
- Web and mobile share the same architecture, same file naming, same search logic
- Search keys live in `packages/shared/` — one source of truth for both apps
- iPad/wide-screen split view is built in from the start — no follow-up needed

### Negative
- More files (5–6 detail screens + root list + shared components per platform) vs 1–2 monolithic files
- Both platforms need migration work (mobile first, web follow-up)
- Search key arrays must be maintained when controls change (mitigated by shared location in `packages/shared/`)

### Neutral
- Detail screens are ~50–150 lines each; old monolithic files were ~330–340 lines. Total line count is similar, but organization is significantly better.
- Web already has nested routes for other features (dictionary, reader, etc.) — adding `settings/display/page.tsx` is consistent with existing patterns.
