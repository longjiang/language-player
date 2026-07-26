# SPEC-015: Mobile Settings — Full Parity Completion

## Metadata
- **Spec ID**: SPEC-015
- **Feature**: Complete mobile settings parity with web, integrate offline dictionaries, fix bugs
- **Status**: draft
- **Created**: 2026-07-25
- **ROADMAP Phase**: Phase 7 — Mobile Integration
- **Depends on**: SPEC-013 (Offline Dictionary), SPEC-014 (Subscription)
- **See also**:
  - [STATUS.md](../../apps/mobile/STATUS.md) — current 🟡 status
  - [Web settings page](../../apps/web/src/app/[l1]/[l2]/settings/page.tsx) — reference implementation
  - [Mobile settings screen](../../apps/mobile/app/(tabs)/(me)/settings.tsx) — current implementation
  - [Mobile TabbedPanel](../../apps/mobile/components/TabbedPanel.tsx) — shared tab component
  - [ADR-0015: Settings UI and Search](../adr/0015-settings-ui-and-search.md) — list→detail layout, wide-screen, search design for web & mobile
---

## Overview

The mobile settings screen is rated 🟡 (partial) in STATUS.md with two noted gaps:

> **Missing**: Offline Dictionaries entry point, full tab parity with web (tokenized text, review, etc.)

A deeper audit reveals 6 concrete gaps — 1 critical bug (✅ fixed), 3 feature gaps, and 2 polish/UX gaps (1 ✅ resolved). This spec covers all of them plus the architectural migration from a monolithic tabbed screen to a searchable, sectioned list→detail navigation (iOS Settings pattern).

> **⚠️ Forward parity note**: Once the mobile list→detail migration is complete, the **web settings page** (`apps/web/src/app/[l1]/[l2]/settings/page.tsx`) should also be migrated from its current tabbed layout to the same list→detail pattern for cross-platform consistency. The web's tab bar has more horizontal space so it's not urgent, but the list→detail pattern with search is a better UX on all screen sizes — and keeping both platforms on the same architecture reduces maintenance drift. This should be tracked as a follow-up spec (SPEC-016 or a Phase 8 task).

---

## Current State Audit

### What Works (4 tabs)

| Tab | Content | Parity |
|---|---|---|
| Display | Theme (light/dark/system), translation toggle, popup dict toggle, tokenized text preview, font picker, text size stepper, phonetics (ruby/word/off + conditions), word-level display (quick gloss, interlinear gloss, Chinese character set, Korean hanja, Vietnamese hán tự), quiz mode | Mostly ✅ (see gaps below) |
| Playback | Captions display mode (transcript/subtitles), smooth scroll, karaoke, auto-pause | ✅ Full parity |
| Speech | VoicePicker with TTS voice selection and rate control | ✅ Full parity |
| Review | New cards per day stepper (1–50) | ✅ Full parity |

### What Exists Outside Tabs

- **Offline Dictionaries link** — A `Pressable` row at the bottom of the ScrollView (outside the tab content area) that navigates to `/(tabs)/(me)/offline-dictionaries`. This is a separate full screen with search, download/delete management, progress bars, and storage usage.

### Architecture (Target)

```
apps/mobile/app/(tabs)/(me)/settings/
├── _layout.tsx              ← Stack navigator (expo-router)
├── index.tsx                ← Root list: search bar + grouped rows
├── display.tsx              ← Display settings (theme, font, text size, phonetics, etc.)
├── playback.tsx             ← Playback settings (captions, karaoke, auto-pause)
├── speech.tsx               ← Speech settings (VoicePicker)
├── review.tsx               ← Review settings (new cards/day slider)
└── offline-dictionaries.tsx ← Unchanged, linked from root list row
```

Each detail screen imports shared sub-components from a `settings/_components/` folder:
- `SliderRow`, `ToggleRow`, `SegmentedRow`, `SectionHeader` — extracted from the old monolithic settings.tsx

The root list screen (`index.tsx`) reads current settings values to display live subtitles on each row (e.g., "Dark" under Display, "20 cards/day" under Review).

**iPad / wide screen** (deferred): On screens ≥ 600pt, render a two-column split view — the root list persists as a sidebar, and the selected category renders in the main pane. Detail screens are unchanged; only the layout wrapper differs.

---

## Gap Analysis

### 🔴 Critical Bug — ✅ FIXED (2026-07-25)

#### G1: Korean Hanja Toggle Writes to Wrong Property

**Status**: Fixed. Both Korean and Vietnamese toggles now use the correct `byeonggi` property from `L2DisplaySettings`, matching web. All `as any` casts removed.

**File**: `apps/mobile/app/(tabs)/(me)/settings.tsx` (line ~270)

**Current (broken)**:
```tsx
{isKorean && <ToggleRow label={t('label.show_hanja')}
  value={(l2Settings.display as any).hanja !== false}
  onValueChange={(v) => updateL2(l2Lang.code, {
    display: { ...l2Settings.display, hanja: v }
  } as any)}
/>}
```

**Problem**: The shared type `L2DisplaySettings` uses `byeonggi` as the property name for both Korean (hanja) and Vietnamese (hán tự). The mobile code writes to a non-existent `hanja` property, hidden by `as any` casts. The web app correctly uses `byeonggi` for both:

```tsx
// Web (correct):
{isKorean && (
  <Toggle label={t('label.show_hanja')}
    checked={l2Settings.display.byeonggi}
    onChange={v => updateL2(l2.code, {
      display: { ...l2Settings.display, byeonggi: v }
    })}
  />
)}
```

**Impact**: The Korean hanja toggle is functionally broken — it reads from and writes to a property that doesn't exist in the type. The actual `byeonggi` value is never updated, so the toggle always shows the default and changes are silently lost.

**Fix**: Replace `hanja` with `byeonggi` and remove the `as any` casts.

---

### 🟡 Feature Gaps

#### G2: Tokenized Text Preview Missing L1 Translation

**Current (mobile)**: The preview box shows the sample sentence with tokenized text but no L1 translation.

**Expected (web)**: The preview box shows the sample sentence + its L1 translation fetched via `translateText()`:

```tsx
// Web:
const [previewTranslation, setPreviewTranslation] = useState('');
useEffect(() => {
  if (!previewText || !display.translation) { setPreviewTranslation(''); return; }
  let cancelled = false;
  translateText(previewText, l1.code, l2.code).then(result => {
    if (!cancelled) setPreviewTranslation(result);
  });
  return () => { cancelled = true; };
}, [previewText, l1.code, l2.code, display.translation]);

// Rendered below the tokenized text:
{previewTranslation && (
  <p className="pt-1 text-sm text-muted-foreground leading-relaxed">
    {previewTranslation}
  </p>
)}
```

**Impact**: Users can't see how their L1 translation setting affects the reading experience without leaving settings.

**Fix**: Add a `useEffect` to fetch the translation when `display.translation` is enabled, and render it below the `TokenizedText` component.

---

#### G3: No "Settings Saved" Confirmation Toast

**Current (mobile)**: No user feedback when settings change. Changes are persisted silently.

**Expected (web)**: A debounced toast appears 1.2s after any setting change:

```tsx
// Web:
const mountedRef = useRef(false);
useEffect(() => {
  if (!mountedRef.current) { mountedRef.current = true; return; }
  const timer = setTimeout(() => {
    toast.success(t('msg.settings_saved'));
  }, 1200);
  return () => clearTimeout(timer);
}, [/* all settings deps */]);
```

**Impact**: Users have no confirmation that their changes were saved, which can cause confusion — especially since settings sync to the cloud asynchronously.

**Fix**: Add a debounced toast. On React Native, this can be done with a simple `Alert` or a custom toast component. Since the app doesn't have a toast system yet, the simplest approach is a brief inline confirmation text (e.g., "✓ Saved" that fades out) — or add a lightweight toast utility.

---

#### G4: Offline Dictionaries Access Pattern

**Current**: A text link at the bottom of the settings ScrollView navigates to a separate full screen.

**Issues**:
- Low discoverability — buried at the bottom of a scrollable page
- Not integrated into the tab structure — feels like an afterthought
- The separate screen (`offline-dictionaries.tsx`) is fully functional but disconnected from the settings flow

**Decision needed**: Should this become a 5th tab, or remain a separate screen with an improved entry point? See [UI Pattern Decision](#ui-pattern-decision) below.

---

### 🟢 Polish / UX Gaps

#### G5: Missing Settings Page Subtitle

**Current (mobile)**:
```tsx
<Text className="text-3xl font-bold text-foreground px-4 pt-6 pb-1">
  {t('title.settings')}
</Text>
```

**Expected (web)**:
```tsx
<h1 className="text-3xl font-bold">{t('title.settings')}</h1>
<p className="mt-2 text-muted-foreground">
  {t('msg.settings_desc', { l1: languageName(l1.code), l2: languageName(l2.code, l1.code) })}
</p>
```

**Impact**: Minor — the subtitle adds helpful context ("Configure your English → Japanese experience") but isn't critical.

**Fix**: Add the `msg.settings_desc` line below the title. Requires the i18n key to exist (it should already — web uses it).

---

#### G6: Slider vs Stepper UX — ✅ RESOLVED (2026-07-25)

**Decision**: Use sliders on mobile, matching web. The `@react-native-community/slider` package provides a native slider component that works well on both iOS and Android. Implemented via a new `SliderRow` component with `minimumValue`, `maximumValue`, `step`, and labeled min/max/center annotations — matching the web's Slider pattern exactly.

**Implementation**: `apps/mobile/app/(tabs)/(me)/settings.tsx` — `SliderRow` component using `@react-native-community/slider` with `ICON_PRIMARY` tint for the track fill and thumb, `ICON_MUTED` for the unfilled track. Used for text size (0–7, with px value display) and new cards per day (1–50, with center default label).

---

## UI Pattern Decision: List → Detail (iOS Settings Style) + Search

### The Problem

The current tab bar approach has three limitations:

1. **Tab overflow** — 5 tabs with translated labels (e.g., German "Wiedergabe", "Offline-Wörterbücher") don't fit on 390pt screens
2. **Poor scalability** — each new settings category adds another tab, making crowding worse
3. **No search** — users must visually scan tabs and scroll through controls to find a specific setting

The web app uses the same tab pattern, but web has abundant horizontal space and doesn't face the same constraints.

### Decision: Adopt iOS Settings Pattern

The canonical mobile settings pattern — used by iOS Settings, Spotify, WhatsApp, and nearly every well-designed iOS app — is a **searchable list → detail navigation**:

```
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ Settings                         │   │ Display                          │
│                                  │   │                                  │
│ 🔍 Search settings...            │   │ ── THEME ──                      │
│                                  │   │ Theme      Light · Dark · System│
│ ── APPEARANCE ──                 │   │                                  │
│ Display                     ›    │   │ ── TEXT ──                       │
│ Playback                    ›    │   │ Font       Default · Serif · …  │
│ Speech                      ›    │   │ Text size  ──────●────── 20px   │
│                                  │   │                                  │
│ ── LEARNING ──                   │   │ ── PHONETICS ──                  │
│ Review                      ›    │   │ Show       On Top · Replace · Off│
│                                  │   │ ...                              │
│ ── DATA ──                       │   │                                  │
│ Offline Dictionaries        ›    │   │                                  │
│   日本語 · 22K words · 11 MB     │   │                                  │
└──────────────────────────────────┘   └──────────────────────────────────┘
       Root list (phone)                   Detail screen (phone)


┌────────────────────┬─────────────────────────────────────────────┐
│ Settings           │ Display                                     │
│                    │                                             │
│ 🔍 Search...       │ ── THEME ──                                 │
│                    │ Theme                 Light · Dark · System │
│ ── APPEARANCE ──   │                                             │
│ Display       ●    │ ── TEXT ──                                  │
│ Playback           │ Font                  Default · Serif · …  │
│ Speech             │ Text size             ──────●────── 20px   │
│                    │                                             │
│ ── LEARNING ──     │ ── PHONETICS ──                             │
│ Review             │ Show                  On Top · Replace · Off│
│                    │ ...                                         │
│ ── DATA ──         │                                             │
│ Offline Dicts      │                                             │
│  日本語 · 22K words│                                             │
└────────────────────┴─────────────────────────────────────────────┘
       iPad (split view — persistent sidebar + selected detail)
```

**Key design decisions:**

| Aspect | Decision |
|---|---|
| **Root screen** | Scrollable list of rows grouped under section headers |
| **Each row** | Navigates to a dedicated detail screen (one screen per settings category) |
| **Search** | Text input at the top filters rows by label + searches control labels within each category |
| **Subtitle on rows** | Shows current value summary (e.g., "Dark" under Display, "20 cards/day" under Review) |
| **Offline dictionaries row** | Shows download status: language count + storage used (or "Not downloaded") |
| **iPad / wide screens** | Split view: list persists as sidebar; selected detail in main pane |
| **Deep linking** | Each category has its own route: `/(tabs)/(me)/settings/display`, `/settings/playback`, etc. |

### Why This Pattern Wins

1. **Never overflows** — list rows don't truncate regardless of label length
2. **Infinitely scalable** — adding "Notifications", "Privacy", "Data" etc. is just another row
3. **Search is natural** — users type to find any setting instantly (VS Code, macOS, iOS all do this)
4. **iPad-ready** — the list→detail pattern maps directly to `UISplitViewController` semantics
5. **Each detail screen is focused** — no conditional rendering of 5 tabs worth of controls in one file; each category is its own screen with its own state
6. **Familiar** — iOS users expect this pattern; Android users see it in Material Design's "preference hierarchy"

### File Structure

```
apps/mobile/app/(tabs)/(me)/
├── settings/
│   ├── index.tsx              ← Root list with search
│   ├── display.tsx            ← Display settings detail
│   ├── playback.tsx           ← Playback settings detail
│   ├── speech.tsx             ← Speech settings detail
│   ├── review.tsx             ← Review settings detail
│   └── _layout.tsx            ← Stack navigator (or slot for split view)
├── settings.tsx               ← OLD — delete after migration
└── offline-dictionaries.tsx   ← Unchanged (linked from root list row)
```

### Root List Row Design

Each row shows:
- **Icon** (optional, from lucide-react-native) in `ICON_MUTED`
- **Title** (the settings category name)
- **Subtitle** (current value summary, in `text-muted-foreground` text-xs)
- **Chevron** `›` to indicate navigation

```tsx
// Example row data:
const SECTIONS = [
  {
    header: t('label.appearance'),
    rows: [
      {
        key: 'display',
        icon: Palette,
        title: t('setting.display'),
        subtitle: display.theme === 'dark' ? t('setting.dark') : t('setting.light'),
        route: '/(tabs)/(me)/settings/display',
      },
      { key: 'playback', icon: Play, title: t('setting.playback'), subtitle: playback.transcriptMode === 'transcript' ? t('title.transcript') : t('label.subtitles'), route: '...' },
      { key: 'speech', icon: Volume2, title: t('setting.speech'), subtitle: '...', route: '...' },
    ],
  },
  {
    header: t('label.learning'),
    rows: [
      { key: 'review', icon: Repeat, title: t('setting.review'), subtitle: t('label.cards_per_day_short', { n: review.dailyNewLimit }), route: '...' },
    ],
  },
  {
    header: t('label.data'),
    rows: [
      { key: 'offline', icon: Download, title: t('title.offline_dictionaries'), subtitle: offlineSummary, route: '/(tabs)/(me)/offline-dictionaries' },
    ],
  },
];
```

### Search Implementation

The search bar filters rows by three tiers:

1. **Title match** — row title contains query (case-insensitive). Already localized via `t()`.
2. **Subtitle match** — subtitle text contains query. Already localized.
3. **Control label match** — per [ADR-0015](../../docs/adr/0015-settings-ui-and-search.md), searchable control labels are stored as **i18n translation keys** (not hardcoded English strings). Keys are pre-resolved once on locale change and cached, so search works in all 31 locales without per-locale maintenance.

```tsx
const [query, setQuery] = useState('');

// ── Locale-agnostic deep search: keys → resolved strings, cached on L1 change ──
const [localizedLabels, setLocalizedLabels] = useState<Record<string, string[]>>({});

useEffect(() => {
  const result: Record<string, string[]> = {};
  for (const [category, keys] of Object.entries(SEARCHABLE_LABEL_KEYS)) {
    result[category] = keys.map(key => t(key).toLowerCase());
  }
  setLocalizedLabels(result);
}, [l1Lang.code]); // re-resolves only when L1 changes — not per keystroke

// ── Filter ──
const filteredSections = useMemo(() => {
  if (!query.trim()) return SECTIONS;
  const q = query.toLowerCase();
  return SECTIONS.map(section => ({
    ...section,
    rows: section.rows.filter(row => {
      if (row.title.toLowerCase().includes(q)) return true;
      if (row.subtitle?.toLowerCase().includes(q)) return true;
      const labels = localizedLabels[row.key];
      if (labels?.some(label => label.includes(q))) return true;
      return false;
    }),
  })).filter(section => section.rows.length > 0);
}, [query, localizedLabels]);
```

**Key arrays** — one per category, referencing existing `translations.csv` keys:

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
  speech: [
    'label.voice', 'label.speed', 'label.rate', 'label.pitch',
  ],
  review: [
    'label.new_cards_per_day',
  ],
  offline: [
    'title.offline_dictionaries', 'action.download', 'action.delete',
  ],
};
```

**Example — German user searching "Schrift"**:
1. `l1Lang.code === 'de'` → `localizedLabels['display']` resolves `label.font` via `t()` → `"Schrift"`
2. User types "Schrift" → `"schrift".includes("schrift")` → match → Display row appears

No per-locale code. Adding a new searchable control = adding its translation key to the array.

### iPad Split View

On screens ≥ 600pt wide, render a two-column layout:

```tsx
const { width } = useWindowDimensions();
const isWide = width >= 600;

// expo-router file system route for the active detail:
// /settings/display, /settings/playback, etc.
// The _layout.tsx uses a Stack navigator.

if (isWide) {
  return (
    <View className="flex-row flex-1">
      {/* Sidebar: root list */}
      <View className="w-64 border-r border-border">
        <SettingsList onSelect={setSelectedKey} selected={selectedKey} />
      </View>
      {/* Main: selected detail */}
      <View className="flex-1">
        {selectedKey === 'display' && <DisplaySettings />}
        {selectedKey === 'playback' && <PlaybackSettings />}
        {/* ... */}
      </View>
    </View>
  );
}

// Phone: stack navigation via expo-router
return <Stack />;
```

Note: For the initial implementation, defer iPad split view. The expo-router file-based routing (`settings/display.tsx`, etc.) naturally supports phone navigation. Split view can be added later with a layout breakpoint check — the detail screens don't change.

---

## Implementation Plan

### Phase 1: Bug Fix (Critical) — ~15 min

#### 1.1 Fix Korean Hanja Property Name

**File**: `apps/mobile/app/(tabs)/(me)/settings.tsx`

Change the Korean hanja toggle to use `byeonggi` (matching web and shared types):

```tsx
// Before (broken):
{isKorean && <ToggleRow label={t('label.show_hanja')}
  value={(l2Settings.display as any).hanja !== false}
  onValueChange={(v) => updateL2(l2Lang.code, {
    display: { ...l2Settings.display, hanja: v }
  } as any)}
/>}

// After (fixed):
{isKorean && <ToggleRow label={t('label.show_hanja')}
  value={l2Settings.display.byeonggi !== false}
  onValueChange={(v) => updateL2(l2Lang.code, {
    display: { ...l2Settings.display, byeonggi: v }
  })}
/>}
```

Note: The Vietnamese toggle already correctly uses `byeonggi` — no change needed there.

---

### Phase 2: Feature Gaps — ~1 hr

#### 2.1 Add L1 Translation Preview

**File**: `apps/mobile/app/(tabs)/(me)/settings.tsx`

Add a `useEffect` to fetch the translation of the sample sentence when translation is enabled, and display it below the `TokenizedText` preview.

**Implementation notes**:
- Use the existing `translateText` function from the web app (check if available in `@langplayer/shared` or needs to be copied)
- Only fetch when `display.translation` is `true`
- Cancel in-progress fetch on dependency change (cleanup function)
- The translation endpoint is `POST /translate` on the Python backend

```tsx
const [previewTranslation, setPreviewTranslation] = useState('');

useEffect(() => {
  if (!previewText || !display.translation) {
    setPreviewTranslation('');
    return;
  }
  let cancelled = false;
  // Use the Python translate endpoint
  fetch(`${PYTHON_API_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: previewText, l1: l1Lang.code, l2: l2Lang.code }),
  })
    .then(r => r.json())
    .then(data => {
      if (!cancelled) setPreviewTranslation(data.translation ?? '');
    })
    .catch(() => {});
  return () => { cancelled = true; };
}, [previewText, l1Lang.code, l2Lang.code, display.translation]);
```

Then render below the `TokenizedText`:
```tsx
{previewTranslation ? (
  <Text className="pt-1 text-sm text-muted-foreground leading-relaxed">
    {previewTranslation}
  </Text>
) : null}
```

#### 2.2 Add "Settings Saved" Confirmation

Add a debounced confirmation indicator. Since the app doesn't have a toast system, use a simple inline approach:

```tsx
const [savedVisible, setSavedVisible] = useState(false);
const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

// Watch all settings for changes (skip initial mount)
const mountedRef = useRef(false);
useEffect(() => {
  if (!mountedRef.current) { mountedRef.current = true; return; }
  if (saveTimer.current) clearTimeout(saveTimer.current);
  saveTimer.current = setTimeout(() => {
    setSavedVisible(true);
    setTimeout(() => setSavedVisible(false), 2000);
  }, 1200);
  return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
}, [
  tokenizedText, display, playback, review,
  l2Settings.tokenSpan.phonetics.show,
  l2Settings.tokenSpan.phonetics.conditions,
  l2Settings.tokenSpan.definition.show,
  l2Settings.display.traditional,
  l2Settings.display.byeonggi,
]);
```

Render a subtle confirmation:
```tsx
{savedVisible && (
  <View className="absolute top-2 right-4 bg-primary/90 px-3 py-1.5 rounded-full">
    <Text className="text-xs font-medium text-primary-foreground">
      ✓ {t('msg.settings_saved')}
    </Text>
  </View>
)}
```

**Alternative**: If a toast library is already available (check `react-native-toast-message` or similar in `package.json`), use it instead for a more standard UX.

#### 2.3 Add Settings Page Subtitle

Add the descriptive subtitle below the title:

```tsx
<Text className="text-3xl font-bold text-foreground px-4 pt-6 pb-1">
  {t('title.settings')}
</Text>
{/* ADD: */}
<Text className="text-sm text-muted-foreground px-4 mb-2">
  {t('msg.settings_desc', { l1: l1Lang.name, l2: l2Lang.name })}
</Text>
```

---

### Phase 3: List → Detail Navigation + Search — ~3 hr

#### 3.1 Extract Shared Settings Components

**New file**: `apps/mobile/components/settings/SliderRow.tsx` (and peer files)

Extract `SliderRow`, `ToggleRow`, `SegmentedRow`, `SectionHeader` from the existing `settings.tsx` into reusable components under `components/settings/`. These are used by every detail screen.

```
apps/mobile/components/settings/
├── SliderRow.tsx        ← Slider + label + min/max/center annotations
├── ToggleRow.tsx        ← Label + Switch
├── SegmentedRow.tsx     ← Pill selector for enum options
└── SectionHeader.tsx    ← Uppercase section divider
```

These are already written — just move them from `settings.tsx` into their own files and re-export.

#### 3.2 Create Detail Screens

Each detail screen is a focused, self-contained page with its own title, back navigation, and controls. The old tab content is split across files:

| New File | Content (from old settings.tsx tabs) |
|---|---|
| `settings/display.tsx` | Theme picker, translation toggle, popup dict toggle, tokenized text preview + L1 translation, font picker, text size slider, phonetics settings, word-level display, Chinese character set, Korean/Vietnamese script toggles, quiz mode |
| `settings/playback.tsx` | Captions display mode, smooth scroll toggle, karaoke toggle, auto-pause toggle |
| `settings/speech.tsx` | VoicePicker component |
| `settings/review.tsx` | New cards per day slider |

Each screen uses `useSettingsContext()` directly — the settings state is global, so no prop drilling needed.

**Detail screen template**:
```tsx
// settings/display.tsx
export default function DisplaySettingsScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay, tokenizedText, updateTokenizedText, getL2, updateL2 } = useSettingsContext();
  const t = useT();

  return (
    <ScrollView className="flex-1 bg-background">
      <Text className="text-3xl font-bold text-foreground px-4 pt-6 pb-4">
        {t('setting.display')}
      </Text>

      <View className="mb-5 px-4">
        <SectionHeader title={t('setting.theme')} />
        {/* ... controls ... */}
      </View>
      {/* ... more sections ... */}
    </ScrollView>
  );
}
```

#### 3.3 Create Root List Screen with Search

**File**: `apps/mobile/app/(tabs)/(me)/settings/index.tsx`

The root list replaces the old `settings.tsx`:

```tsx
export default function SettingsIndexScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, playback, review, getL2 } = useSettingsContext();
  const { getDownloadState, isOfflineAvailable } = useDictionaryContext();
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState('');

  // Build offline summary subtitle
  const [offlineSummary, setOfflineSummary] = useState('');
  useEffect(() => {
    (async () => {
      let count = 0;
      for (const l2 of SUPPORTED_L2S) {
        if (await isOfflineAvailable(l2)) count++;
      }
      setOfflineSummary(count > 0 ? t('label.languages_downloaded', { n: count }) : '');
    })();
  }, []);

  const l2Settings = getL2(l2Lang.code);

  const SECTIONS = [
    {
      header: t('label.appearance'),
      rows: [
        { key: 'display', icon: Palette, title: t('setting.display'),
          subtitle: display.theme === 'dark' ? t('setting.dark') : display.theme === 'light' ? t('setting.light') : t('setting.system'),
          route: '/(tabs)/(me)/settings/display' },
        { key: 'playback', icon: Play, title: t('setting.playback'),
          subtitle: playback.transcriptMode === 'transcript' ? t('title.transcript') : t('label.subtitles'),
          route: '/(tabs)/(me)/settings/playback' },
        { key: 'speech', icon: Volume2, title: t('setting.speech'),
          subtitle: t('label.voice_and_speed'),
          route: '/(tabs)/(me)/settings/speech' },
      ],
    },
    {
      header: t('label.learning'),
      rows: [
        { key: 'review', icon: Repeat, title: t('setting.review'),
          subtitle: t('label.cards_per_day_short', { n: review.dailyNewLimit }),
          route: '/(tabs)/(me)/settings/review' },
      ],
    },
    {
      header: t('label.data'),
      rows: [
        { key: 'offline', icon: Download, title: t('title.offline_dictionaries'),
          subtitle: offlineSummary || t('msg.not_downloaded'),
          route: '/(tabs)/(me)/offline-dictionaries' },
      ],
    },
  ];

  // Pre-resolve search labels once on locale change (see ADR-0015)
  const [localizedLabels, setLocalizedLabels] = useState<Record<string, string[]>>({});
  useEffect(() => {
    const result: Record<string, string[]> = {};
    for (const [category, keys] of Object.entries(SEARCHABLE_LABEL_KEYS)) {
      result[category] = keys.map(key => t(key).toLowerCase());
    }
    setLocalizedLabels(result);
  }, [l1Lang.code]);

  // Filter by search query
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

  return (
    <ScrollView className="flex-1 bg-background">
      <Text className="text-3xl font-bold text-foreground px-4 pt-6 pb-1">
        {t('title.settings')}
      </Text>
      <Text className="text-sm text-muted-foreground px-4 mb-4">
        {t('msg.settings_desc', { l1: l1Lang.name, l2: l2Lang.name })}
      </Text>

      {/* Search bar */}
      <View className="mx-4 mb-4 rounded-lg border border-border bg-muted px-3 py-2 flex-row items-center gap-2">
        <Search size={16} color={ICON_MUTED} />
        <TextInput
          className="flex-1 text-sm text-foreground"
          placeholder={t('action.search_settings')}
          placeholderTextColor={PLACEHOLDER_COLOR}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Sectioned rows */}
      {filteredSections.map(section => (
        <View key={section.header} className="mb-5 px-4">
          <SectionHeader title={section.header} />
          {section.rows.map(row => (
            <Pressable
              key={row.key}
              onPress={() => router.push(row.route as any)}
              className="flex-row items-center gap-3 py-3 border-b border-border/50"
            >
              {row.icon && <row.icon size={20} color={ICON_MUTED} />}
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground">{row.title}</Text>
                {row.subtitle ? (
                  <Text className="text-xs text-muted-foreground mt-0.5">{row.subtitle}</Text>
                ) : null}
              </View>
              <Text className="text-muted-foreground">›</Text>
            </Pressable>
          ))}
        </View>
      ))}

      {filteredSections.length === 0 && (
        <Text className="text-center text-muted-foreground py-8">
          {t('msg.no_settings_found')}
        </Text>
      )}
    </ScrollView>
  );
}

// Deep search labels: i18n keys → resolved via t() per locale (see ADR-0011)
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
  speech: [
    'label.voice', 'label.speed', 'label.rate', 'label.pitch',
  ],
  review: [
    'label.new_cards_per_day',
  ],
  offline: [
    'title.offline_dictionaries', 'action.download', 'action.delete',
  ],
};
```

#### 3.4 Create Stack Navigator Layout

**File**: `apps/mobile/app/(tabs)/(me)/settings/_layout.tsx`

```tsx
import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="display" />
      <Stack.Screen name="playback" />
      <Stack.Screen name="speech" />
      <Stack.Screen name="review" />
    </Stack>
  );
}
```

iOS automatically provides the back gesture and swipe-to-go-back — no custom back buttons needed.

#### 3.5 Delete Old Monolithic File

Delete `apps/mobile/app/(tabs)/(me)/settings.tsx` after verifying all functionality is migrated.

Update `(tabs)/(me)/_layout.tsx` to remove the old `settings` route and add the new `settings` directory route (expo-router picks up `settings/index.tsx` automatically if the old file is gone).

---

### Phase 4: Polish & Testing — ~30 min

#### 4.1 Verify All Settings Work End-to-End

For each detail screen (display, playback, speech, review):
1. Change every control
2. Verify the UI updates immediately
3. Navigate back to root list → verify subtitle reflects the change
4. Kill and restart the app → verify the value persists
5. If logged in, verify it syncs to cloud (check `SecureStore` value matches)

#### 4.2 Test Search

- Search for "font" → Display row appears
- Search for "karaoke" → Playback row appears
- Search for "cards" → Review row appears
- Search for "gibberish" → "No settings found" empty state
- Clear search → all sections reappear

#### 4.3 Test Navigation

- Tap each row → navigates to correct detail screen
- Swipe back (iOS gesture) → returns to root list
- Deep link to `/settings/display` → opens display detail with back button

#### 4.4 Test on Multiple Screen Sizes

- iPhone SE (375pt) — all rows fit, search works, detail screens scroll
- iPhone 14 Pro Max (430pt) — same, with more visible rows
- iPad (≥600pt) — layout doesn't break (split view deferred, but should not crash)

---

## i18n Requirements

### Existing Keys to Verify

These keys are already in `translations.csv` and used by settings:

| Key | Used In |
|---|---|
| `setting.display` | Tab label |
| `setting.playback` | Tab label |
| `setting.speech` | Tab label |
| `setting.review` | Tab label |
| `title.settings` | Page title |
| `msg.settings_desc` | Page subtitle (G5) |
| `msg.settings_saved` | Confirmation toast (G3) |
| `title.offline_dictionaries` | Tab label + card title |
| `label.show_hanja` | Korean toggle |
| `label.show_hantu` | Vietnamese toggle |

### New Keys Needed (if any)

| Key | English | Used For |
|---|---|---|
| `action.search_settings` | "Search settings..." | Search bar placeholder |
| `label.appearance` | "Appearance" | Root list section header |
| `label.learning` | "Learning" | Root list section header |
| `label.data` | "Data" | Root list section header |
| `label.voice_and_speed` | "Voice & speed" | Speech row subtitle |
| `label.cards_per_day_short` | "{n} cards/day" | Review row subtitle |
| `label.languages_downloaded` | "{n} languages downloaded" | Offline dicts row subtitle |
| `msg.not_downloaded` | "Not downloaded" | Offline dicts row subtitle (empty) |
| `msg.no_settings_found` | "No settings found" | Search empty state |

Check `translations.csv` before creating — some may already exist under different keys.

---

## Files Changed

| File | Change | Phase |
|---|---|---|
| `apps/mobile/components/settings/SliderRow.tsx` | **New** — extracted from old settings.tsx | 3 |
| `apps/mobile/components/settings/ToggleRow.tsx` | **New** — extracted from old settings.tsx | 3 |
| `apps/mobile/components/settings/SegmentedRow.tsx` | **New** — extracted from old settings.tsx | 3 |
| `apps/mobile/components/settings/SectionHeader.tsx` | **New** — extracted from old settings.tsx | 3 |
| `apps/mobile/app/(tabs)/(me)/settings/_layout.tsx` | **New** — Stack navigator | 3 |
| `apps/mobile/app/(tabs)/(me)/settings/index.tsx` | **New** — Root list with search + grouped rows | 3 |
| `apps/mobile/app/(tabs)/(me)/settings/display.tsx` | **New** — Display settings detail | 3 |
| `apps/mobile/app/(tabs)/(me)/settings/playback.tsx` | **New** — Playback settings detail | 3 |
| `apps/mobile/app/(tabs)/(me)/settings/speech.tsx` | **New** — Speech settings detail | 3 |
| `apps/mobile/app/(tabs)/(me)/settings/review.tsx` | **New** — Review settings detail | 3 |
| `apps/mobile/app/(tabs)/(me)/settings.tsx` | **Delete** — replaced by `settings/` directory | 3 |
| `apps/mobile/app/(tabs)/(me)/_layout.tsx` | Update — remove old settings route | 3 |
| `translations.csv` | Possibly add 1–3 new i18n keys | 4 |
| `apps/mobile/STATUS.md` | Update settings row from 🟡 → ✅ | 4 |

No changes needed to:
- `apps/mobile/app/(tabs)/(me)/offline-dictionaries.tsx` — unchanged, still the full management screen
- `apps/mobile/components/TabbedPanel.tsx` — not used by settings (settings uses its own inline tab bar)
- `apps/mobile/contexts/DictionaryContext.tsx` — already exposes `isOfflineAvailable`, `getDownloadState`, `startDownload`
- `packages/shared/` — no type changes needed (the `byeonggi` property already exists)

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `translateText` not available on mobile | Medium | Use direct `fetch()` to Python `/translate` endpoint instead |
| expo-router file-based routing conflicts with old `settings.tsx` | Medium | Delete old file before creating `settings/` directory. `_layout.tsx` in the directory handles the Stack. |
| Searchable label keys go stale when controls change | Low | Keys are colocated with row definitions in `index.tsx`. If a control label's CSV key changes, the key array must be updated — but this is the same key the UI uses, so breakage is visible immediately. See ADR-0015. |
| Too many files (5 detail screens + 4 component files) feels heavy | Low | Each file is small (~50–150 lines). The old monolithic file was ~340 lines of mixed concerns. This is cleaner — one purpose per file. |
| Korean hanja toggle was intentionally using `hanja` for some reason | Low | The shared types use `byeonggi` for both Korean and Vietnamese. Web uses `byeonggi`. The mobile `hanja` was likely a porting mistake from the GO legacy app. |

---

## Success Criteria

- [x] Korean hanja toggle correctly reads/writes `byeonggi` property (no `as any` casts)
- [x] Text size and new cards/day use sliders (not steppers), matching web
- [ ] Tokenized text preview shows L1 translation when translation is enabled
- [ ] "Settings saved" confirmation appears after changes (inline badge or toast)
- [ ] Settings page shows descriptive subtitle: "Configure your [L1] → [L2] experience"
- [ ] Root settings screen shows searchable, sectioned list of 5 categories
- [ ] Each category navigates to its own detail screen with proper back navigation
- [ ] Search filters rows by title, subtitle, and control labels
- [ ] Offline Dictionaries row shows live subtitle (e.g., "3 languages · 32 MB")
- [ ] Old monolithic `settings.tsx` is deleted; all functionality migrated
- [ ] All existing settings continue to persist across app restarts
- [ ] TypeScript compiles cleanly: `./node_modules/.bin/tsc --noEmit`
- [ ] STATUS.md updated: Settings row 🟡 → ✅
