# ADR 0015: Mobile Settings Architecture — Layout, Navigation & Search

> **Status:** Accepted
> **Date:** 2026-07-25
> **Replaces:** N/A (new architecture)
> **See also:**
> - [SPEC-015: Mobile Settings Completion](../specs/015-mobile-settings-completion.md) — full implementation plan
> - [ADR-0002: Next.js App Router](../adr/0002-nextjs-app-router.md) — web architecture context
> - [ADR-0010: Port Web to Mobile — Fresh Start](../adr/0010-port-web-to-mobile-fresh-start.md) — mobile porting principles

---

## Context

The mobile settings screen (`apps/mobile/app/(tabs)/(me)/settings.tsx`) is currently a monolithic ~340-line file with a 4-tab bar (Display / Playback / Speech / Review) and a separate bottom link for Offline Dictionaries. The web app (`apps/web/src/app/[l1]/[l2]/settings/page.tsx`) uses the same tabbed pattern with a shared `<TabbedPanel>`.

We need to:
1. Add Offline Dictionaries as a first-class settings category (currently a buried link)
2. Add settings search (currently impossible with the tab pattern)
3. Fix several bugs and parity gaps identified in the audit
4. Plan for future settings categories without layout breakage

This ADR covers three interdependent architectural decisions: **layout pattern**, **navigation structure**, and **search design**.

---

## Decision 1: Layout Pattern — List → Detail (iOS Settings Style)

### The Problem with Tabs

The current 4-tab bar has three structural limitations:

1. **Overflow at 5 tabs** — Translated labels (e.g., German "Wiedergabe" = 10 chars, "Offline-Wörterbücher" = 20 chars) don't fit on 390pt iPhone screens. A horizontally scrollable tab bar (YouTube-style) mitigates this but hides tabs from view.
2. **No search** — Tabs require visual scanning. Users can't type to find a setting.
3. **Poor scalability** — Each new category (Notifications, Privacy, Data, etc.) adds another tab, worsening crowding. There is no ceiling.

The web app uses tabs too, but web has abundant horizontal space and doesn't face the same constraints. However, the web should eventually follow the same pattern for cross-platform consistency (noted in SPEC-015).

### Options Considered

| Option | Verdict |
|---|---|
| **A: Scrollable 5-tab bar** | Rejected. Mitigates overflow but doesn't solve search or scalability. Hidden tabs hurt discoverability. |
| **B: Icon tabs (compact)** | Rejected. Icons alone are ambiguous across cultures. Breaks consistency with the rest of the app. |
| **C: Keep separate screen + card** | Rejected. Keeps offline dicts as a second-class feature. Doesn't solve search. |
| **D: List → detail + search** | ✅ Selected. See below. |

### Decision: Sectioned List with Detail Navigation

**Pattern**: A root screen with a search bar and grouped rows. Tapping a row pushes a dedicated detail screen. This is the canonical iOS Settings pattern — used by iOS Settings, Spotify, WhatsApp, and most well-designed iOS apps.

```
Phone (stack nav):                    iPad / wide (split view):
┌──────────────────────┐              ┌──────────┬───────────────────┐
│ Settings             │              │ Settings │ Display           │
│ 🔍 Search...         │              │          │                   │
│ ── APPEARANCE ──     │              │ Display  │ Theme: Dark       │
│ Display       Dark › │   tap  ──►   │ Playback │ Font: Serif       │
│ Playback  Transcript ›│              │ Speech   │ Size: 16px        │
│ Speech   Voice&speed ›│              │ Review   │ ...               │
│ ── LEARNING ──       │              │ Offline  │                   │
│ Review   20 cards/day ›│             │          │                   │
│ ── DATA ──           │              │          │                   │
│ Offline    3 langs ›  │              │          │                   │
└──────────────────────┘              └──────────┴───────────────────┘
```

**Why this wins:**

1. **Never overflows** — list rows don't truncate regardless of label length
2. **Infinitely scalable** — adding a category = adding one row; no layout redesign
3. **Search is natural** — text input at the top; see Decision 3 below
4. **iPad-ready** — the list→detail pattern maps directly to split view (see Decision 2)
5. **Focused detail screens** — each category is its own file (~50–150 lines) with its own state, rather than conditional rendering of 5 tabs in one monolithic file
6. **Familiar** — iOS users expect this; Android users recognize it from Material Design's preference hierarchy

### File Structure (Target)

```
apps/mobile/app/(tabs)/(me)/settings/
├── _layout.tsx              ← Stack navigator (expo-router)
├── index.tsx                ← Root list: search bar + grouped rows
├── display.tsx              ← Display settings detail
├── playback.tsx             ← Playback settings detail
├── speech.tsx               ← Speech settings detail (VoicePicker)
├── review.tsx               ← Review settings detail
└── (offline-dictionaries)   ← Linked from root row, lives at peer level

apps/mobile/components/settings/
├── SliderRow.tsx            ← Extracted from old monolithic file
├── ToggleRow.tsx
├── SegmentedRow.tsx
└── SectionHeader.tsx
```

The old `settings.tsx` (~340 lines, mixed concerns) is deleted after migration. Each detail screen is self-contained and imports shared sub-components.

---

## Decision 2: iPad / Wide Screen — Split View (Deferred)

### Context

On screens ≥ 600pt wide (iPad, large Android tablets), the phone's stack navigation wastes horizontal space. The iOS standard is a persistent sidebar with the selected detail in the main pane.

### Decision: Defer split view to a follow-up, but design for it now

The expo-router file-based routing (`settings/_layout.tsx` with a Stack) works correctly on phones. To add split view later:

```tsx
const { width } = useWindowDimensions();
if (width >= 600) {
  return (
    <View className="flex-row flex-1">
      <View className="w-64 border-r border-border">
        {/* Sidebar: root list, always visible */}
        <SettingsList />
      </View>
      <View className="flex-1">
        {/* Main: conditionally rendered detail */}
        {selectedKey === 'display' && <DisplaySettings />}
        {/* ... */}
      </View>
    </View>
  );
}
// Phone: Stack navigator
return <Stack />;
```

**Key design constraint**: Detail screens must NOT depend on navigation state. They receive settings via `useSettingsContext()` (global) — no prop drilling. This means the same `<DisplaySettings />` component works in both stack navigation (phone) and conditional rendering (iPad) without changes.

Split view is deferred because:
- It requires testing on physical iPads
- The phone UX is the priority for Phase 7
- It's a pure layout wrapper change — zero changes to detail screens

---

## Decision 3: Settings Search — Locale-Agnostic via i18n Key Arrays

### The Problem

The search bar must filter settings categories by matching against control labels (toggle labels, segmented option labels, slider labels) — not just the category title. The app supports **31 locales**. Hardcoding English strings (e.g., `'theme', 'font', 'karaoke'`) fails for non-English users. A German user searching "Schrift" should find the Display row because "Schrift" is the German translation of "font", which is a control within Display settings.

### Options Considered

| Option | Verdict |
|---|---|
| **A: Hardcoded English strings** | Rejected. Fails for 30 of 31 locales. |
| **B: Titles + subtitles only** | Rejected. No deep search — "karaoke", "font", "cards" match nothing. |
| **C: Build-time inverted index from CSV** | Rejected. Adds a build step, ~1MB of JSON, can't handle ICU `{n}` placeholders. |
| **D: i18n key arrays + cached resolution** | ✅ Selected. |

### Decision: Translation-Key Arrays with Cached Resolution

**Mechanism**:

1. **Store keys, not strings** — Each category has an array of `translations.csv` keys for its searchable labels:

```ts
const SEARCHABLE_LABEL_KEYS: Record<string, string[]> = {
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
  for (const [category, keys] of Object.entries(SEARCHABLE_LABEL_KEYS)) {
    result[category] = keys.map(key => t(key).toLowerCase());
  }
  setLocalizedLabels(result);
}, [l1Lang.code]); // re-resolves only on L1 switch — not per keystroke
```

3. **Search against cached strings** — Title and subtitle are already localized at render time:

```ts
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

**Performance**: ~30 keys × `t()` on locale switch (sub-millisecond). Per-keystroke: array `.includes()` only — no `t()` calls.

**Example — German user searching "Schrift"**:
1. `l1Lang.code === 'de'` → `localizedLabels['display']` resolves `label.font` → `"schrift"`
2. User types "Schrift" → `"schrift".includes("schrift")` → match → Display row appears

**Trade-offs**:
- ✅ All 31 locales work automatically — no per-locale code
- ✅ Keys are self-documenting (same keys the UI uses)
- ✅ No build step, no extra data files
- ❌ Every searchable control must have a CSV key (most already do)
- ❌ If a key changes, the array must be updated (colocated, easy to spot)

---

## Cross-Platform Parity Note

The web settings page (`apps/web/src/app/[l1]/[l2]/settings/page.tsx`) currently uses a tabbed layout. Once the mobile list→detail migration is complete, the web should follow the same pattern. The list→detail architecture with search is better UX on all screen sizes, and keeping both platforms on the same architecture reduces maintenance drift. Tracked in SPEC-015 as a follow-up task (Phase 8 / SPEC-016).

---

## Consequences

### Positive
- Settings scales to any number of categories without layout redesign
- Search works in all 31 locales without per-locale maintenance
- Each category is its own focused file (separation of concerns)
- iPad split view is a natural extension, not a rewrite
- Web can adopt the same pattern for cross-platform consistency

### Negative
- More files (5 detail screens + 4 component files + root list) vs 1 monolithic file
- expo-router file-based routing requires deleting old `settings.tsx` before creating `settings/` directory
- Search key arrays must be maintained when controls change (mitigated by colocation)

### Neutral
- Detail screens are ~50–150 lines each — the old monolithic file was ~340 lines of mixed concerns. Total line count is similar, but organization is significantly better.
