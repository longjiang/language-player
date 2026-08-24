# Settings Architecture

## Metadata
- **Arch ID**: ARCH-011
- **Feature**: Settings storage, mutation, and synchronization
- **Status**: as-built (web + mobile); the V2 design below is implemented —
  see [Current Implementation](#current-implementation-web--mobile-2026-08-24)
  and the
  [known issue](#known-issue-settings_v2-resets-to-default-debug-in-progress-2026-08-24)
  at the top of this page
- **Created**: 2026-07-17
- **Last updated**: 2026-08-24
- **ROADMAP Phase**: Cross-cutting (all phases)
- **Scope**: Classic (legacy, `settings_classic` only), GO (reference),
  Next.js Web (active, `settings_v2`), React Native Mobile (active,
  `settings_v2`)

---

## ⚠️ Known Issue — settings_v2 resets to default (debug in progress, 2026-08-24)

**Symptom:** settings intermittently reset to defaults ("from time to time")
across devices sharing the `settings_v2` column (web + mobile).

**Ruled out so far:**
- **Classic Nuxt** — only reads/writes `settings_classic`; never touches
  `settings_v2` (verified: `store/settings.js` + server `upsert_settings`
  `coalesce` keeps the columns independent). Classic's own reset bug is
  isolated to classic.
- **Chrome extension** — device-local `chrome.storage.local`, no backend sync.

**Root cause (first pass, fixed):** the confirmed production root cause
(commit `32154e91`, 2026-08-18) was `createSettingsV2()` stamping fresh
defaults with `ts = now`, which outranked the user's saved copy in LWW and,
via the debounced PUT / outbox, destroyed the cloud row. The fix made fresh
defaults carry an **epoch ts** so they lose LWW. The same failure mode was
still reachable through **persist-before-hydration** vectors and was closed in
commit `c90214e8` (2026-08-24): `persist()` drops+logs writes while the
in-memory state is pristine defaults, Settings → Display gates `ensureL2` on
`cloudHydrated`, and mobile's `update*` setters no longer build patches from
stale render closures.

**Diagnostics shipped (2026-08-24):**
- `ab8efbb9` — durable `lp_settings_diag` ring buffer
  (`packages/utils/src/settings-diagnostics.ts`) recording every settings
  event (local load, hydrate apply/skip, persist-skip, PUT/outbox, user-change
  reset, `clearUserData` wipe). Deliberately NOT wiped on logout. Web:
  reload reads `[settings] recent diagnostics:`, or run
  `window.__settingsDiag()` in DevTools. Mobile: boot log via Metro
  (SecureStore-backed).
- `ae5fa87e` (monorepo) + `9080cea` (python server repo) — stable per-install
  device id (`lp_device_id`) sent with every settings write, and server-side
  **write-attribution logging** on both write paths.

### Debug protocol — what to do when the reset happens next

1. **Server logs first (authoritative cross-device view).** Both settings_v2
   write paths now log attribution:
   - web → `PUT /user-settings`: `[user_data_columns] PUT /user-settings ok
     user=… device=… ts=… settings_v2.ts=… dailyNewLimit=… dayStartHour=…`
     (`routes/user_data_columns.py`)
   - mobile → `/sync/push` outbox: `[sync] settings upsert user=… device=…
     ts=… settings_v2.ts=… dailyNewLimit=… dayStartHour=…` (`utils_sync.py`
     `_h_settings`)
   Look for the last few writes before the reset. A **defaults push** shows
   `dailyNewLimit=20 dayStartHour=4` — that line names the `device=` that
   wrote it and the client `ts=` that beat the saved copy in LWW.
2. **Correlate with the client ring buffer** on the affected device: boot log
   `[settings] recent diagnostics:` or `window.__settingsDiag()` (web).
   `hydrate APPLY cloud … review: {dailyNewLimit:20,…}` means the cloud row was
   already defaults when it arrived; `persist SKIPPED` lines mark the
   protected window from `c90214e8`.
3. **If the culprit is still unexplained**, capture: the full
   `[settings]`/`[sync]` console lines around the reset, the server log window,
   and which platform(s)/device(s) were in use. The next agent should read
   this section plus the implemented hooks below.

**Note:** the diagnostics require the updated builds — web/mobile clients
must be rebuilt/redeployed (device id + ring buffer) and the Flask server
restarted (write-attribution logs) for the lines above to appear.

---

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
| `theme`, `playbackSpeed`, `autoPause`, `karaokeMode`, `smoothScroll`, `transcriptMode` | **Global** | Video player behavior is independent of which language you're studying |
| `translation`, `quickGloss`, `definition`, `zoom`, `serifFont` | **Global** | Display preferences are consistent across languages — if you want translations, you want them everywhere |
| `quizMode`, `autoPronounce`, `disableAnnotation` | **Global** | Interaction preferences apply regardless of L2 |
| `phonetics`, `traditional`, `phoneticsOnly`, `phoneticsForHardWordsOnly` | **Per-L2** | Phonetic needs differ by language (pinyin for zh, furigana for ja, none for en). `hardWords`: a word is "hard" if its `levels[].numeric` or `frequencyLevel` ≥ user's level, OR if the entry is cached but has neither — unknown words are treated as hard. Words not yet in cache are NOT shown (wait for async lookup). |
| `voiceURI`, `speechRate` | **Per-L2** | TTS voice and speed are language-specific |
| `tvShowFilter`, `categoryFilter` | **Per-L2** | Content filters are language-scoped |
| `dailyNewLimit` | **Global** | The setting is one global number (set to 50 → 50 for every L2). But the new-card budget is ENFORCED per language — each L2's review deck gets its own `dailyNewLimit` cards/day, computed against that language's cards only. Russian having more cards never reduces Japanese's budget; the budgets don't share a pool |

| App | Per-L2 Keying | Mechanism |
|---|---|---|
| **Classic** | ✅ Most display settings | `state.l2Settings[l2Code]` — nested object inside general settings |
| **GO** | ❌ All flat | Single `SettingsState` object, no per-language nesting |
| **Next.js Web** | ❌ All flat | Individual localStorage keys, no per-language awareness |

**V2 Design:** Moves display/interaction settings to global scope and keeps only truly language-specific settings per-L2. This is a deliberate simplification — Classic's per-L2 model was overly granular (users rarely want different `zoomLevel` per language).

---

## Classic & GO Implementation Reference

> **Classic app settings details** have been moved to `docs/arch/001-classic-app-architecture.md` → "Settings Architecture" section.
> **GO app settings details** have been moved to `docs/arch/002-go-app-architecture.md` → "Settings Architecture" section.
>
> Key differences at a glance:
> - **Classic**: Vuex store, `zthSettings` key, per-L2 via `l2Settings[l2Code]`, synced to Directus `user_data.settings`, server-wins conflict resolution
> - **GO**: `useReducer` in `SettingsContext`, `userSettings` key in `expo-secure-store`, flat/global settings (not per-L2), **not synced** to backend

---

## Current Web App State (Problem Statement)

> **Historical (2026-07, pre-consolidation).** This section described the
> three independent settings mechanisms that the V2 design below replaced.
> As of 2026-08-24 the unified `useSettings()` hook/provider is implemented on
> both web and mobile — see [Current Implementation](#current-implementation-web--mobile-2026-08-24)
> for the as-built state.

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
- **Per-L2:** ❌ Single global value (the new-card budget it controls is still enforced per language)
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

> **Historical.** The migration described here was completed: the unified
> `useSettings()` hook now exists on both platforms (see
> [Current Implementation](#current-implementation-web--mobile-2026-08-24)).

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

## Current Implementation (web + mobile, 2026-08-24)

The V2 design below is implemented and is the as-built architecture. The
details that follow ("V2 Data Structure Design", "Sync Strategy", "Conflict
Resolution", "Storage Layout") describe the design; this section records what
is actually in the tree.

**Storage & sync, per platform:**

| | Web | Mobile |
|---|---|---|
| Local store | `localStorage` key `lp_settings` | SecureStore key `lp_settings` |
| Hook | `apps/web/src/hooks/use-settings.ts` (context: `providers/settings-provider.tsx`) | `apps/mobile/hooks/use-settings.ts` (context: `contexts/SettingsContext.tsx`) |
| Cloud hydrate | `GET /user-settings` → `settings_v2`, ts-based LWW (`cloud.ts > local.ts` applies) | same, plus a pull-merge bridge from the sync engine (`subscribeEntity('settings')`) |
| Cloud write | Debounced 3s `PUT /user-settings` with `settings_v2` + `updatedAt` | Debounced 3s `enqueueSyncOp` (`settings`/`v2` outbox op) → `/sync/push` |
| Server | `routes/user_data_columns.py` `settings_put` | `utils_sync.py` `_h_settings` |
| DB | `user_settings.settings_v2` (jsonb), `updated_at` bigint — server-side LWW: `where excluded.updated_at >= public.user_settings.updated_at` | same |

**Canonical types/factory:** `packages/shared/src/types.ts` — `SettingsV2`,
section defaults (`*_DEFAULTS`), `createSettingsV2()` (stamps an **epoch ts** so
fresh defaults lose LWW — commit `32154e91`), `normalizeSettingsV2()`.

**Anti-reset guards (commit `c90214e8`, 2026-08-24):**
- `persist()` drops (and logs) any write while the in-memory state is still
  pristine defaults (`hydratedFromSource` ref) — a fresh-ts defaults blob would
  otherwise outrank the saved copy in LWW and destroy the cloud row.
- Settings → Display gates `ensureL2` on `cloudHydrated` (both platforms).
- Mobile `update*` setters build patches from the functional updater's `prev`,
  not a stale render closure.

**Diagnostics (2026-08-24):**
- `lp_settings_diag` ring buffer (`packages/utils/src/settings-diagnostics.ts`,
  commit `ab8efbb9`) — every settings event, survives reloads and logout wipes.
  Web: `[settings] recent diagnostics:` boot log or `window.__settingsDiag()`.
- Per-install `lp_device_id` + server write-attribution logs (commit
  `ae5fa87e` + python `9080cea`). See the
  [Known Issue](#known-issue-settings_v2-resets-to-default-debug-in-progress-2026-08-24)
  section at the top for the debug protocol.

**Not implemented (differences from the V2 design below):**
- Per-section `ts` conflict resolution — still a single top-level `ts`.
- Cross-tab `storage`-event propagation is not wired (single-tab per device).
- `darkMode`/`theme` lives in `display.theme` on both apps; the V2 design
  sketched `global.theme` — the shipped `DisplaySettings.theme` is the
  canonical location.

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
│   ├── playback: { speed, autoPause, karaokeMode, smoothScroll, transcriptMode }
│   │   └── NOTE: collapsedVideo exists in the type but is NOT in the settings UI.
│   │       The web player delegates to YouTube's embedded controls, making it
│   │       impractical to collapse the player at this time.
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
| `global.review` | Global (single value, enforced per L2) | **Review** — daily new card limit |
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

`learning` has been folded into `global.review` since `dailyNewLimit` is the only learning parameter. The value is a single global number, but it's applied per language — each L2's deck gets its own `dailyNewLimit` new cards per day, matching the per-language SRS card store.

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

It's the only learning parameter. Nesting it under `global.review` keeps the top-level keys to two (`global` + `l2`) and maps directly to the Review tab in the settings page. The value is a single number, but the daily budget it controls is applied per language — each L2's review deck gets its own `dailyNewLimit` new cards per day, matching the per-language SRS card store. If genuinely per-language limit *values* are needed later, it can move into `L2Settings` without breaking the schema.

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
│       → POST /user-data/sync { settings_v2: JSON.stringify() } │
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

> **Updated 2026-08-24:** settings live in Supabase `public.user_settings`
> (via the Flask row API), not Directus `user_data`.

| What | Where | Key / Field |
|---|---|---|
| **Settings (v2)** | web: `localStorage` / mobile: SecureStore | `lp_settings` |
| **Settings (v2)** | Supabase `user_settings` | `settings_v2` (jsonb) + `updated_at` (ms, server LWW) |
| **Settings (Classic)** | Supabase `user_settings` | `settings_classic` (jsonb — unchanged, Classic-only) |
| **SRS Cards** | web: `localStorage` / mobile: SecureStore | `zthSrsProgress` |
| **SRS Cards** | Supabase | `srs_progress` (unchanged) |
| **Saved Words** | web: `localStorage` / mobile: SecureStore | `zthSavedWords` |
| **Saved Words** | Supabase | `saved_words` (unchanged) |
| **Settings diagnostics** | web: `localStorage` / mobile: SecureStore | `lp_settings_diag` (ring buffer, never wiped) |
| **Device id** | web: `localStorage` / mobile: SecureStore | `lp_device_id` (write attribution, never wiped) |
| **Old keys (deprecated)** | `localStorage` | `lp_show_translation`, `lp_use_traditional`, `lp_show_phonetics`, `zthSpeechSettings` |

### Backward Compatibility with Classic (Production)

**Classic is still live in production** and reads/writes `user_data.settings` with a flat format (`{ skin, mode, l2Settings: { zh: {...} } }`). V2 writes a nested-by-category format (`{ v: 2, ts, global: {...}, l2: {...} }`). These are **not compatible** — writing V2 to the Classic column would corrupt Classic's data on next sync.

**Solution: separate Directus column — `settings_v2`.**

```
Directus user_data
├── settings      ← Classic only (flat blob)
├── settings_v2   ← GO + Next.js Web (V2 nested blob)
├── srs_progress  ← Shared (all apps)
└── saved_words   ← Shared (all apps)
```

When Classic is eventually retired, the `settings` column is dropped and `settings_v2` becomes the single canonical store. The `v` version field in the blob ensures future migrations are safe without another column rename.

**Flask API changes needed:**

| Step | What |
|---|---|
| 1 | Add nullable `settings_v2` column to `user_data` table |
| 2 | `GET /user-data` — return `settings_v2` alongside existing fields |
| 3 | `POST /user-data/sync` — accept `settings_v2` in the sync payload |
| 4 | No changes to Classic's `settings` field — it continues to work as before |

### File Layout

> **Implemented (2026-08-24).** The tree below matches the shipped layout; the
> `NEW`/`REMOVE`/`SIMPLIFY` annotations are the original migration plan and are
> now done (web) or mirrored in mobile.

```
packages/shared/src/
├── types.ts           ← GlobalSettings, L2Settings, SettingsV2,
│                         all _DEFAULTS constants, createSettingsV2() [CANONICAL]
├── settings.test.ts   ← LWW epoch-ts + normalize tests

packages/utils/src/
├── settings-diagnostics.ts  ← lp_settings_diag ring buffer + getOrCreateDeviceId
│                              (commit ab8efbb9 / ae5fa87e)

packages/api-client/src/
├── user-data-columns.ts     ← getUserSettings / putUserSettings (settings_v2 row API)

apps/web/src/
├── hooks/
│   └── use-settings.ts     ← unified settings hook (implemented)
├── lib/
│   ├── settings.ts         ← REMOVED (replaced by use-settings.ts)
│   └── user-data-wipe.ts   ← logout wipe; records a diag event (keeps lp_settings_diag)
├── providers/
│   └── settings-provider.tsx  ← wraps useSettings() in React context (implemented)
└── app/[l1]/[l2]/
    └── layout.tsx          ← <SettingsProvider> in provider tree (implemented)

apps/mobile/
├── hooks/use-settings.ts       ← mobile twin of the web hook (SecureStore + outbox)
├── contexts/SettingsContext.tsx ← SettingsProvider / useSettingsContext
└── lib/user-data-wipe.ts       ← logout wipe (keeps lp_settings_diag / lp_device_id)
```

---

## Future Considerations

- **Settings import/export** — Allow users to export settings as JSON for backup or transfer
- **Per-setting sync granularity** — Instead of syncing the entire blob, sync individual settings to reduce conflict surface
- **Setting validation** — Classic validates against default keys; this pattern should be preserved
- **Setting migration** — When settings schema changes, provide migration functions (like the SRS store's `createSrsStore()`)
- **Cross-tab sync** — The `onSettingChange` utility in Web exists but is unused; wire it up for multi-tab consistency
