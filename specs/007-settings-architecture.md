# Feature Specification: Settings Architecture

## Metadata
- **Spec ID**: SPEC-007
- **Feature**: Settings storage, mutation, and synchronization
- **Status**: draft
- **Created**: 2026-07-17
- **ROADMAP Phase**: Cross-cutting (all phases)
- **Scope**: Classic (legacy), GO (reference), Next.js Web (active)

## Overview

Settings control the user's display preferences, learning parameters, and UI behavior. They span three categories:
1. **Display** — phonetics, translations, script variant, theme
2. **Learning** — daily new card limit, quiz mode
3. **Speech** — TTS voice, speech rate

This document analyzes how settings are stored, mutated, and synced across all three apps, identifying gaps and divergence.

---

## Settings Inventory

### All Settings Across Three Apps

| Setting | Classic | GO | Next.js Web | Type | Per-L2? | Synced to Cloud? |
|---|---|---|---|---|---|---|
| `showTranslation` | ✅ `true` | ✅ `true` | ✅ `true` | boolean | Classic: ✅ / GO: ❌ / Web: ❌ | Classic: ✅ / GO: ❌ / Web: ❌ |
| `showPhonetics` | ✅ `true` | ✅ `true` | ✅ `true` | boolean | Classic: ✅ / GO: ❌ / Web: ❌ | Classic: ✅ / GO: ❌ / Web: ❌ |
| `showDefinition` | ✅ `false` | ✅ `false` | ❌ | boolean | Classic: ✅ | Classic: ✅ |
| `useTraditional` | ✅ `false` | ✅ `false` | ✅ `false` | boolean | Classic: ✅ / GO: ❌ / Web: ❌ | Classic: ✅ / GO: ❌ / Web: ❌ |
| `showQuickGloss` | ✅ `true` | ✅ `true` | ❌ | boolean | Classic: ✅ | Classic: ✅ |
| `autoPronounce` | ✅ `true` | ✅ `true` | ❌ | boolean | Classic: ✅ | Classic: ✅ |
| `quizMode` | ✅ `false` | ✅ `false` | ❌ | boolean | Classic: ✅ | Classic: ✅ |
| `darkMode` / `skin` | ✅ `"dark"` | ✅ `true` | ❌ | boolean/string | ❌ | Classic: ✅ |
| `zoomLevel` | ✅ `0` | ❌ | ❌ | number (0–7) | Classic: ✅ | Classic: ✅ |
| `useSerif` | ✅ `false` | ❌ | ❌ | boolean | Classic: ✅ | Classic: ✅ |
| `showByeonggi` | ✅ `true` | ❌ | ❌ | boolean | Classic: ✅ | Classic: ✅ |
| `showPinyinForHigherLevelWordsOnly` | ✅ `false` | ❌ | ❌ | boolean | Classic: ✅ | Classic: ✅ |
| `phoneticsOnly` | ✅ `false` | ❌ | ❌ | boolean | Classic: ✅ | Classic: ✅ |
| `disableAnnotation` | ✅ `false` | ❌ | ❌ | boolean | Classic: ✅ | Classic: ✅ |
| `voice` (TTS) | ✅ `null` | ❌ | ✅ `undefined` | string? | Classic: ✅ / Web: ❌ | ❌ |
| `rate` (TTS) | ❌ | ❌ | ✅ `0.75` | number | ❌ | ❌ |
| `speed` (playback) | ✅ `1` | ❌ | ❌ | number | ❌ | Classic: ✅ |
| `autoPause` | ✅ `false` | ❌ | ❌ | boolean | ❌ | Classic: ✅ |
| `collapsed` | ✅ `false` | ❌ | ❌ | boolean | ❌ | Classic: ✅ |
| `karaokeAnimation` | ✅ `true` | ❌ | ❌ | boolean | ❌ | Classic: ✅ |
| `useSmoothScroll` | ✅ `false` | ❌ | ❌ | boolean | ❌ | Classic: ✅ |
| `dailyNewLimit` (SRS) | ❌ | ❌ | ✅ `20` | number | ❌ | ✅ (via srs_progress blob) |
| `mode` (transcript/subtitles) | ✅ `"subtitles"` | ❌ | ❌ | string | ❌ | Classic: ✅ |
| `subsSearchLimit` | ✅ `true` | ❌ | ❌ | boolean | ❌ | Classic: ✅ |
| `muteAutoplay` | ✅ `false` | ❌ | ❌ | boolean | ❌ | Classic: ✅ |
| `adminMode` | ✅ `false` | ❌ | ❌ | boolean | ❌ | Classic: ✅ |
| `preferredCategories` | ✅ `[]` | ❌ | ❌ | string[] | ❌ | Classic: ✅ |
| `tvShowFilter` | ✅ `null` | ❌ | ❌ | string? | Classic: ✅ | Classic: ✅ |
| `categoryFilter` | ✅ `null` | ❌ | ❌ | string? | Classic: ✅ | Classic: ✅ |
| `corpname` | ✅ `null` | ❌ | ❌ | string? | Classic: ✅ | Classic: ✅ |

### Per-L2 vs Global

| Setting | Scope | Rationale |
|---|---|---|
| `theme`, `playbackSpeed`, `autoPause`, `karaokeMode`, `smoothScroll`, `collapsedVideo`, `transcriptMode` | **Global** | Video player behavior is independent of which language you're studying |
| `translation`, `quickGloss`, `definition`, `zoom`, `serifFont` | **Global** | Display preferences are consistent across languages — if you want translations, you want them everywhere |
| `quizMode`, `autoPronounce`, `disableAnnotation` | **Global** | Interaction preferences apply regardless of L2 |
| `phonetics`, `traditional`, `phoneticsOnly`, `phoneticsForHardWordsOnly` | **Per-L2** | Phonetic needs differ by language (pinyin for zh, furigana for ja, none for en) |
| `voiceURI`, `speechRate` | **Per-L2** | TTS voice and speed are language-specific |
| `tvShowFilter`, `categoryFilter` | **Per-L2** | Content filters are language-scoped |
| `dailyNewLimit` | **Global** | SRS queue is shared across all languages |

| App | Per-L2 Keying | Mechanism |
|---|---|---|
| **Classic** | ✅ Most display settings | `state.l2Settings[l2Code]` — nested object inside general settings |
| **GO** | ❌ All flat | Single `SettingsState` object, no per-language nesting |
| **Next.js Web** | ❌ All flat | Individual localStorage keys, no per-language awareness |

**V2 Design:** Moves display/interaction settings to global scope and keeps only truly language-specific settings per-L2. This is a deliberate simplification — Classic's per-L2 model was overly granular (users rarely want different `zoomLevel` per language).

---

## Classic & GO Implementation Reference

> **Classic app settings details** have been moved to `docs/lp-classic-app-architecture.md` → "Settings Architecture" section.
> **GO app settings details** have been moved to `docs/lp-go-app-architecture.md` → "Settings Architecture" section.
>
> Key differences at a glance:
> - **Classic**: Vuex store, `zthSettings` key, per-L2 via `l2Settings[l2Code]`, synced to Directus `user_data.settings`, server-wins conflict resolution
> - **GO**: `useReducer` in `SettingsContext`, `userSettings` key in `expo-secure-store`, flat/global settings (not per-L2), **not synced** to backend

---

## Current Web App State (Problem Statement)

The Next.js Web app currently has **three independent settings mechanisms** with no shared architecture:

### Store 1: Display Settings (`lib/settings.ts`)
- **Storage:** Three separate `localStorage` keys: `lp_show_translation`, `lp_use_traditional`, `lp_show_phonetics`
- **Pattern:** Plain module with synchronous getter/setter functions — no React context
- **Reactivity:** ❌ Reads are synchronous `localStorage.getItem()` calls; components do NOT re-render on cross-tab changes. The `onSettingChange()` cross-tab listener exists but is unused.
- **Sync:** ❌ Not synced to cloud
- **Per-L2:** ❌ Global only

### Store 2: Speech Settings (`hooks/use-speech.ts`)
- **Storage:** Single `localStorage` key: `zthSpeechSettings` → `{ voiceURI?, rate? }`
- **Pattern:** React hook + context (`SpeechProvider`)
- **Reactivity:** ✅ Reads via React state (loaded in `useEffect`)
- **Sync:** ❌ Not synced to cloud
- **Per-L2:** ❌ Global only

### Store 3: SRS Settings (`hooks/use-srs.ts`)
- **Storage:** Single `localStorage` key: `zthSrsProgress` → `{ settings: { dailyNewLimit }, cards: {...} }`
- **Pattern:** React hook + context (`SrsProvider`)
- **Reactivity:** ✅ Reads via React state
- **Sync:** ✅ Debounced 3s cloud sync via `POST /user-data/sync` → Directus `user_data.srs_progress`
- **Per-L2:** ❌ Global only (though SRS cards are per-language)
- **Note:** `dailyNewLimit` is piggybacked inside the SRS progress blob; it's not a standalone setting

### Summary of Current Problems

| Problem | Impact |
|---|---|
| Three separate localStorage namespaces | No single source of truth; inconsistent patterns |
| `lib/settings.ts` uses synchronous reads | Components don't re-render on setting changes |
| No per-L2 settings | Can't have different preferences per language |
| Only SRS settings sync to cloud | Display/speech preferences lost on new device |
| `onSettingChange` defined but unused | Cross-tab changes don't propagate |
| Settings page requires auth | Guest users can't access settings |

---

## Gaps & Divergence

### 1. No Unified Settings Store (Web)
The Next.js app has three independent settings mechanisms with no shared architecture. Simple display settings use a plain module, speech uses a custom hook, and SRS uses another hook. There is no single source of truth.

**Recommendation:** Consolidate into a single `useSettings()` hook/provider, or at minimum unify the localStorage namespace.

### 2. Non-Reactive Display Settings (Web)
`lib/settings.ts` reads localStorage synchronously via plain functions. Components like `TokenizedText` and `useScriptPreference` call `getUseTraditional()` at render time — they will NOT re-render when the setting changes in another tab or in the Settings page (unless the component remounts).

**Recommendation:** Wrap display settings in a React context with `useState` + `useEffect` + `storage` event listener.

### 3. Missing Per-L2 Settings (GO + Web)
Only the Classic app supports per-language settings (e.g., show pinyin for Chinese but not for Spanish). Both GO and Web apply settings globally without language awareness.

**Recommendation:** Key settings by L2 code, like Classic's `l2Settings[l2Code]` pattern.

### 4. No Cloud Sync for Display/UI Settings (GO + Web)
Settings like `showTranslation`, `useTraditional`, `darkMode` are device-local in GO and Web. Classic syncs all settings to Directus. Without sync, a user's preferences don't follow them across devices or survive clearing browser data.

**Recommendation:** Sync all settings to the cloud via the `user_data` endpoint, using the same JSON blob pattern as Classic.

### 5. Divergent Defaults
| Setting | Classic | GO | Web |
|---|---|---|---|
| `darkMode` / `skin` | `"dark"` (string) | `true` (boolean) | Not implemented |
| `showDefinition` | `false` | `false` | Not implemented |
| `showQuickGloss` | `true` | `true` | Not implemented |
| `autoPronounce` | `true` | `true` | Not implemented |

### 6. Missing Settings in Web
The Web app is missing many settings present in Classic and GO:
- `showQuickGloss` — quick definition for saved words
- `showDefinition` — inline definition on tokens
- `autoPronounce` — TTS on word popup open
- `quizMode` — blank out saved words for self-testing
- `darkMode` — light/dark theme
- `zoomLevel` — text size scaling
- `showByeonggi` — hanja/han tự for Korean/Vietnamese

### 7. Settings Page Requires Auth (Web)
The Web middleware lists `'settings'` in `AUTH_REQUIRED_SEGMENTS`. Guest users cannot access settings. Classic and GO allow settings changes without login.

---

## Migration Path (Classic → Web)

When migrating settings from Classic to the Next.js Web app:

1. **Unify storage** — Create a single `useSettings()` hook/provider with:
   - General settings (theme, playback, admin)
   - Per-L2 settings (display preferences keyed by L2 code)
   - Auto-save to localStorage + debounced cloud sync

2. **Adopt Classic's per-L2 pattern** — `l2Settings[l2Code]` with language-aware defaults

3. **Sync to cloud** — Extend the `user_data` sync to include a `settings` JSON blob (separate from `srs_progress`)

4. **Fix reactivity** — All settings reads should go through React state, not synchronous localStorage calls

5. **Port missing settings** — Prioritize: `darkMode`, `quizMode`, `showQuickGloss`, `autoPronounce`, `zoomLevel`

6. **Consider guest access** — Either allow settings without auth (store in localStorage only) or clearly communicate why auth is required

---

## V2 Data Structure Design (Next.js Migration Target)

### Design Goals

1. **Single source of truth** — one `localStorage` key, one React context, one sync endpoint
2. **Per-L2 settings** — users can have different display preferences per language (like Classic)
3. **Fully reactive** — all reads go through React state; cross-tab changes propagate via `storage` events
4. **Cloud-synced** — settings follow the user across devices, survive cache clears
5. **Versioned** — `v` field enables schema migrations without data loss
6. **Type-safe** — TypeScript types in `@langplayer/shared` serve as the canonical schema
7. **Backward-compatible** — migration reads from the three old storage keys (`lp_*`, `zthSpeechSettings`, `zthSrsProgress`) on first load

### Type Definitions

Types are defined in `packages/shared/src/types.ts` as the canonical source. See `GlobalSettings`, `L2Settings`, `SettingsV2`, and the `*_DEFAULTS` constants and `createSettingsV2()` factory.

**Structure — nested by functional category:**

```
SettingsV2
├── v: 2
├── ts: string
├── global: GlobalSettings
│   ├── theme: 'light' | 'dark' | 'system'
│   ├── playback: { speed, autoPause, karaokeMode, smoothScroll, collapsedVideo, transcriptMode }
│   ├── display: { translation, quickGloss, definition, zoom, serifFont }        ← Display tab
│   ├── interaction: { quizMode, autoPronounce, disableAnnotation }
│   └── review: { dailyNewLimit }                                                 ← Review tab
└── l2: Record<string, L2Settings>
    └── L2Settings
        ├── display: { phonetics, traditional, phoneticsOnly, phoneticsForHardWordsOnly }  ← Display tab
        ├── speech: { voiceURI, rate }                                                      ← Pronunciation tab
        └── content: { tvShowFilter, categoryFilter }
```

**Categories mapped to Settings page tabs:**

| Category | Location | Settings Page Tab |
|---|---|---|
| `global.display` + `l2[L2].display` | Global + Per-L2 | **Display** — translations, phonetics, script, zoom, font |
| `l2[L2].speech` | Per-L2 | **Pronunciation** — TTS voice, speech rate |
| `global.review` | Global | **Review** — daily new card limit |
| `global.playback` | Global | *(future tab)* — speed, auto-pause, karaoke, scroll, collapse |
| `global.interaction` | Global | *(grouped into Display tab)* — quiz mode, auto-pronounce, disable popup |
| `global.theme` | Global | *(app-level, not in settings page)* — light/dark/system |
| `l2[L2].content` | Per-L2 | *(future tab)* — TV show filter, category filter |

### Design Rationale

#### Why three top-level keys (`global`, `l2`, `learning`) instead of Classic's flat structure?

Classic mixes global and per-language properties in one flat object with a nested `l2Settings` key. This is confusing — you can't tell at a glance whether `autoPause` is global or per-language. The three-key design makes the scope immediately obvious:

| Key | Scope | Example |
|---|---|---|
| `global` | Applies everywhere, regardless of L2 | `theme`, `playback`, `display`, `interaction`, `review` |
| `l2` | Scoped to the target language being learned | `display.phonetics`, `speech.voiceURI`, `content.tvShowFilter` |

`learning` has been folded into `global.review` since `dailyNewLimit` is the only learning parameter and is global.

#### Why nest by functional category?

Flat interfaces scatter related settings (e.g., `playbackSpeed`, `autoPause`, `karaokeMode` are all video behaviour but separated by alphabetization). Nesting by category:
- **Makes the settings page trivial to build** — each tab maps to one sub-object: `global.display` + `l2[code].display` → Display tab, `l2[code].speech` → Pronunciation tab, `global.review` → Review tab
- **Enables partial updates** — `updateGlobal({ playback: { ...global.playback, autoPause: true } })` changes one category without touching others
- **Self-documents scope** — a setting nested under `l2[code].speech` is clearly per-language; under `global.display` it's clearly global
- **Future-proofs** — adding a "Notifications" category means adding `global.notifications: {}` without touching existing keys

#### Why `l2` is a `Record<string, L2Settings>` instead of an array?

Classic uses `l2Settings: { zh: {...}, ja: {...} }`. This is perfect — dictionary lookup by L2 code is O(1), and JSON serialization round-trips cleanly. Arrays would require linear scans and risk duplicate keys. The `Record` type also naturally handles the "missing key → use defaults" fallback pattern.

#### Why `speech.rate` is per-L2?

A user might prefer 0.75× speed for a difficult language (Japanese) but 1.25× for a familiar one (Spanish). Per-language speech settings match the user's mental model.

#### Why is `dailyNewLimit` in `global.review` instead of a separate `learning` key?

It's the only learning parameter and it's global. Nesting it under `global.review` keeps the top-level keys to two (`global` + `l2`) and maps directly to the Review tab in the settings page. If per-language limits are needed later, it can move into `L2Settings` without breaking the schema.

#### Why NOT include SRS cards in this store?

SRS cards (`{ zh: { wordId: SrsFields } }`) are large, change frequently, and have different access patterns. They remain in their own store (`zthSrsProgress`). The `settings` field that was previously embedded inside `zthSrsProgress` moves into this unified store.

### Migration From Legacy Keys

On first load, the `useSettings()` hook reads from the three old localStorage keys and migrates data into the new shape:

```
┌──────────────────────────────────────────────────────┐
│                 Migration Map                         │
├──────────────────────────────┬───────────────────────┤
│  Old Key / Source            │  New Path             │
├──────────────────────────────┼───────────────────────┤
│  lp_show_translation         │  global.display.translation │
│  lp_use_traditional          │  l2[currentL2].display.traditional │
│  lp_show_phonetics           │  l2[currentL2].display.phonetics │
│  zthSpeechSettings.voiceURI  │  l2[currentL2].speech.voiceURI  │
│  zthSpeechSettings.rate      │  l2[currentL2].speech.rate      │
│  zthSrsProgress.settings     │  global.review.dailyNewLimit   │
│    .dailyNewLimit            │                                 │
└──────────────────────────────┴───────────────────────────────┘
```

**Migration strategy:**
1. Read `lp_settings` (new key) — if present and `v >= 2`, use it directly.
2. If not present, read the three old keys and build a `SettingsV2` object.
3. Write the migrated object to `lp_settings`.
4. **Do NOT delete the old keys** — Classic and GO apps may still read them. The old keys become stale but harmless.
5. **Migration runs once** — the presence of `lp_settings` with `v: 2` prevents re-migration.

**Caveat:** Old `lp_show_translation` was global; V2 `global.display.translation` is also global, so migration is direct. Old `lp_use_traditional` and `lp_show_phonetics` were global but map to per-L2 in V2 (`l2[code].display.*`) because the V2 design keeps script variant and phonetics as language-specific concerns.

### Component API

The `useSettings()` hook provides a clean, minimal API:

```typescript
// apps/web/src/hooks/use-settings.ts

function useSettings() {
  // ── Full store (rarely needed directly) ──
  settings: SettingsV2;

  // ── Global ──
  global: GlobalSettings;
  updateGlobal: (patch: Partial<GlobalSettings>) => void;

  // ── Per-L2 (for the current L2 from useLanguage()) ──
  l2: L2Settings;                              // resolved with defaults
  updateL2: (patch: Partial<L2Settings>) => void;

  // ── Lifecycle ──
  loaded: boolean;                             // true after initial load completes
  error: Error | null;                         // non-null if load/sync failed
}
```

**Usage examples:**

```tsx
// Toggle a global display setting
const { global, updateGlobal } = useSettings();
<Toggle checked={global.display.translation}
        onChange={v => updateGlobal({ display: { ...global.display, translation: v } })} />

// Toggle a per-L2 setting
const { l2, updateL2 } = useSettings();
<Toggle checked={l2.display.phonetics}
        onChange={v => updateL2({ display: { ...l2.display, phonetics: v } })} />

// Change theme
<ThemeSelector value={global.theme}
               onChange={t => updateGlobal({ theme: t })} />

// Change daily new card limit
const { global, updateGlobal } = useSettings();
<Slider value={global.review.dailyNewLimit}
        onChange={n => updateGlobal({ review: { ...global.review, dailyNewLimit: n } })} />
```

For convenience, the hook may also expose shallow setters for common operations:

```tsx
// Convenience: toggle a single boolean in a nested category
const { toggleGlobalDisplay, toggleL2Display } = useSettings();
<Toggle checked={global.display.translation}
        onChange={() => toggleGlobalDisplay('translation')} />
```

### Sync Strategy

```
┌────────────────────────────────────────────────────────────┐
│                     useSettings() hook                       │
│                                                             │
│  Mount:                                                     │
│    1. Try lp_settings (v2) from localStorage                │
│    2. If missing, migrate from old keys (lp_*, zth*, etc.)  │
│    3. Set React state → components re-render                │
│    4. If logged in, fetch cloud copy via GET /user-data     │
│    5. Merge: latest ts wins per top-level key               │
│    6. Persist merged result to localStorage                 │
│                                                             │
│  On change (updateGlobal / updateL2):                        │
│    1. Update React state (immediate UI response)            │
│    2. Write to localStorage (immediate, survives reload)    │
│    3. Schedule cloud sync (debounced 3s)                    │
│       → POST /user-data/sync { settings: JSON.stringify() } │
│                                                             │
│  On cross-tab change (StorageEvent):                        │
│    1. Listen for 'lp_settings' key change                   │
│    2. Parse and merge into React state                      │
│    3. Components re-render automatically                    │
│                                                             │
│  Conflict resolution:                                       │
│    - global and l2 sections have independent timestamps      │
│      via the top-level SettingsV2.ts                         │
│    - On cloud merge: per-section last-write-wins            │
│    - This prevents a theme change on device A from wiping   │
│      a phonetics change on device B                         │
└────────────────────────────────────────────────────────────┘
```

### Conflict Resolution: Per-Section Timestamps

A single `ts` field on the root object is simple but coarse — changing the theme on your phone would overwrite a phonetics change made on your laptop seconds earlier. Instead, each section can carry its own `ts`:

```typescript
// Refined: per-section timestamps for granular conflict resolution
export interface SettingsV2 {
  v: 2;
  ts: string;                    // fallback / overall timestamp
  global: GlobalSettings & { ts: string };
  l2: Record<string, L2Settings & { ts: string }>;
}
```

However, this adds complexity. **Start simple with a single `ts`.** If merge conflicts become a real problem in practice, per-section `ts` can be added later as a non-breaking schema change (additive — old clients ignore unknown fields).

### Storage Layout Summary

| What | Where | Key / Field |
|---|---|---|
| **Settings (v2)** | `localStorage` | `lp_settings` |
| **Settings (v2)** | Directus `user_data` | `settings` (JSON text) |
| **SRS Cards** | `localStorage` | `zthSrsProgress` (unchanged) |
| **SRS Cards** | Directus `user_data` | `srs_progress` (unchanged) |
| **Saved Words** | `localStorage` | `zthSavedWords` (unchanged) |
| **Saved Words** | Directus `user_data` | `saved_words` (unchanged) |
| **Old keys (deprecated)** | `localStorage` | `lp_show_translation`, `lp_use_traditional`, `lp_show_phonetics`, `zthSpeechSettings` |

### File Layout

```
packages/shared/src/
├── types.ts           ← GlobalSettings, L2Settings, SettingsV2,
│                         all _DEFAULTS constants, createSettingsV2() [CANONICAL]

apps/web/src/
├── hooks/
│   └── use-settings.ts     ← NEW: unified settings hook/provider
├── lib/
│   └── settings.ts         ← REMOVE (replaced by use-settings.ts)
├── hooks/
│   └── use-speech.ts       ← SIMPLIFY: read voiceURI/rate from useSettings().l2.speech
│   └── use-srs.ts          ← SIMPLIFY: read dailyNewLimit from useSettings().global.review,
│                              remove embedded settings field from SRS store
├── providers/
│   └── settings-provider.tsx  ← NEW: wraps useSettings() in React context
└── app/[l1]/[l2]/
    └── layout.tsx          ← ADD: <SettingsProvider> to provider tree
```

---

## Future Considerations

- **Settings import/export** — Allow users to export settings as JSON for backup or transfer
- **Per-setting sync granularity** — Instead of syncing the entire blob, sync individual settings to reduce conflict surface
- **Setting validation** — Classic validates against default keys; this pattern should be preserved
- **Setting migration** — When settings schema changes, provide migration functions (like the SRS store's `createSrsStore()`)
- **Cross-tab sync** — The `onSettingChange` utility in Web exists but is unused; wire it up for multi-tab consistency
