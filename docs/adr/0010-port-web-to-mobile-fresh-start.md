# ADR-0010: Port Next.js Web App to React Native — Fresh Start

**Date**: 2026-07-22
**Status**: proposed
**See also**: [ADR-0003 (no shared UI, amended)](./0003-no-shared-ui.md), [ADR-0008 (GO dictionary architecture)](./0008-go-dictionary-architecture.md), [ADR-0009 (i18n migration — shared locale directory)](./0009-go-i18n-migration-react-intl.md), [ADR-0011 (shared design tokens)](./0011-shared-design-tokens.md), [ADR-0014 (shared i18n pipeline)](./0014-shared-i18n-pipeline.md)

## Context

The current mobile app (`apps/mobile/`, formerly `language-player-3/`) was merged into the monorepo at Phase 8 Step 3. While functional, it has significant architectural gaps compared to the Next.js web app (`apps/web/`):

| Concern | GO Mobile | Next.js Web |
|---|---|---|
| **Settings** | Flat 10-field object, global only, no cloud sync | Structured `SettingsV2` with per-L2 nesting, cloud sync with read-merge-write conflict resolution, versioned (`v: 2`, `ts`) |
| **Dictionary** | Downloads entire SQLite DB from CDN on first launch (~multi-MB), blocks main thread during normalization, English-only definitions, no LLM fallback | ADR-0008 three-tier architecture: online `POST /dictionary/lookup` (L1 translation, LLM fallback) + offline frequency-filtered JSON download (pre-normalized, chunked insert, non-blocking) + local LLM cache for offline availability of rare/AI-generated words |
| **API layer** | Direct `fetch`/`axios` calls scattered across components | Centralized `@langplayer/api-client` with typed hooks (`useDictionary`, `useVideos`, `useUserData`) |
| **Types** | Older, limited types | Rich `@langplayer/shared` types: `LexicalEntry`, `LemmatizedToken`, `SettingsV2`, `ProficiencyLevel<ScaleId>`, `StudyMaterialCoverage` |
| **Providers** | 10 contexts with complex dependency chain | Clean, flat provider tree: Language → Settings → ExploreCache → VideoPlayer |
| **Hooks** | Minimal hooks, logic in components | Rich hooks: `useSettings`, `useSRS`, `useSpeech`, `useSubtitleTranslation`, `useSavedWords`, `useVideoTokenCache` |
| **Feature breadth** | 3 tabs: Media, Dictionary, Me | 3 tabs: Media, Reading, Vocab — matching the web sidebar 1:1. 20+ pages: explore, watch, dictionary, reader, saved words, SRS review, TV shows, live TV, music, local media, epub, web reader, settings, search, channels |
| **Translation** | Basic `TranslationManager` caching | Progressive chunked translation via `POST /translate_array`, token cache to skip repeated lemmatization |
| **i18n** | `i18n-js` with Mustache `{{ }}` syntax, separate CSV (`lp3-trans-*.csv`), no pluralization | Per ADR-0009: `react-intl` with ICU MessageFormat `{key}` syntax, shared `translations.csv` source of truth, same `packages/shared/locales/*.json` as web app, `useT()` hook with identical call signature on both platforms |
| **Styling** | Ad-hoc `StyleSheet.create()` with hardcoded hex colors, no dark mode tokens, no connection to web's Tailwind system | Per ADR-0011 + amended ADR-0003: NativeWind (Tailwind for React Native) with shared design tokens from `packages/shared/tokens.ts`. Same `className` syntax as web (`"bg-primary text-sm px-4"`). Shared Tailwind config generated from tokens. Dark mode via `.dark:` prefix. |
| **Auth** | Manual Directus JWT fetch | NextAuth.js v5 wrapping Directus credentials provider |

The Next.js app has evolved faster and accumulated better architectural patterns. Rather than incrementally patching the GO app to parity, starting afresh with the web app's architecture ported to React Native yields a cleaner, more maintainable result with less total effort.

## Options Considered

### Option A: Incrementally fix `apps/mobile/` (keep GO app base)

- **Pros**: No greenfield risk, existing users keep their app, gradual improvements
- **Cons**: GO's architectural flaws are deep (flat settings, local SQLite, scattered API calls). Fixing them in-place means rewriting most of the app anyway. The 10-context dependency chain makes incremental refactoring fragile. Worse, the two codebases would diverge architecturally, requiring developers to context-switch between the web app's clean patterns and the mobile app's legacy patterns.

### Option B: Port Next.js web app to React Native (fresh start)

    - **Pros**: Single architectural vision across web and mobile. All shared packages (`@langplayer/shared`, `@langplayer/api-client`, `@langplayer/utils`) are already platform-agnostic and require zero changes. The shared i18n pipeline (ADR-0009) is already in place — both apps read from `packages/shared/locales/*.json` generated from a single `translations.csv`. Shared design tokens (ADR-0011) give both platforms a single source of truth for colors, typography, and spacing. NativeWind lets the mobile app use the same Tailwind `className` syntax as the web app — one mental model for styling, dark mode via `.dark:` prefix. The logic layer (providers, hooks, data flow) ports almost 1:1. Settings V2, the three-tier dictionary architecture from ADR-0008, shared i18n from ADR-0009, and typed API client come for free.
- **Cons**: Greenfield risk — building a new app from scratch has upfront cost before it's usable. Need to rebuild all UI components. Existing GO app users would need to migrate. ~4-6 weeks of work.

### Option C: Use the web app as a PWA / Capacitor wrapper

- **Pros**: Write once, deploy everywhere. No separate mobile codebase. Instant feature parity.
- **Cons**: WebView-based apps feel non-native. No access to native APIs (TTS quality, haptics, secure storage). Poor offline support. The web app's desktop-first layouts don't adapt well to mobile viewports. PWA distribution on iOS App Store is limited.

## Decision

**Option B: Port Next.js web app to React Native (fresh start)**

Rationale:

1. **The shared layer is already done.** `packages/shared`, `packages/api-client`, and `packages/utils` work cross-platform today. They contain no React, React Native, Next.js, or Node-specific code — only pure TypeScript and Axios. This is the bulk of the app's business logic, and it ports for free.

2. **The backend needs no changes.** The same Python Flask endpoints serve both apps identically.

3. **The port is a UI translation, not a rewrite.** The app's architecture — providers, hooks, data flow — ports almost 1:1. The styling layer is even closer: both platforms use Tailwind `className` strings (NativeWind on mobile, standard Tailwind on web). The only real translation is JSX: `<div>` → `<View>`, `onClick` → `onPress`. The thinking is already done; the implementation is mechanical.

4. **Architectural coherence.** Having both apps share the same settings architecture (SettingsV2), the same dictionary approach (online lookup with offline download per ADR-0008), the same API client, the same i18n pipeline (ADR-0009), the same design tokens (ADR-0011), and the same styling syntax (Tailwind/NativeWind) means a developer can move between web and mobile code without context-switching. Styling knowledge transfers directly — `className="bg-primary text-sm px-4 rounded-lg"` is the same string on both platforms.

5. **The GO app's architectures are superseded.** ADR-0008 defines the mobile dictionary architecture. ADR-0009 already completed the i18n migration. ADR-0011 defines shared design tokens. The amended ADR-0003 clarifies the boundary: components are separate per platform, but design tokens and styling syntax are shared. This port is the logical continuation of all these decisions: build mobile UI on top of the same logic layer, the same dictionary architecture, the same translation pipeline, the same design tokens, and the same Tailwind styling syntax.

## Implementation Plan

### Phase 1: Scaffold & Foundation
- Create new Expo SDK 57 app at `apps/mobile-v2/`
- Install NativeWind (Metro plugin, Babel plugin, Tailwind config)
- Generate shared `tailwind.config.ts` from `packages/shared/tokens.ts` (ADR-0011) — colors, typography, spacing, border radius flow from tokens to both apps' Tailwind configs
- Wire `@langplayer/shared`, `@langplayer/api-client`, `@langplayer/utils`
- Set up i18n per ADR-0009: install `react-intl`, create `useT()` hook with `resolveNested()` bridge (reads from `packages/shared/locales/*.json`, same nested JSON as web), wrap app root with `IntlProvider`. The `useT()` call signature is identical to the web app — UI components never know which i18n library is underneath.
- Initialize API client with Directus JWT from `expo-secure-store`
- Port `AuthProvider` (Directus JWT flow: login, register, email verification)
- Port `LanguageProvider` (1:1, no Next.js deps)
- Set up Expo Router with file-based routing mirroring the web app's route structure

### Phase 2: Core Providers & Hooks
- Port `SettingsProvider` + `useSettings` (SettingsV2 with cloud sync — `localStorage` → `AsyncStorage`)
- Port `DictionaryProvider` — three-tier per ADR-0008: online `POST /dictionary/lookup` (primary path, shared with web), offline IndexedDB store (frequency-filtered JSON from new `GET /dictionary/download` endpoint, chunked non-blocking insert), and local LLM cache SQLite table for `match_type: 'llm'` entries. See ADR-0008 for full architecture.
- Port `VideoPlayerProvider` + `QueueManager`
- Port `UserDataProvider` + `useSavedWords` + `useSRS` + `useProgress`
- Port `useSubtitleTranslation`, `useVideoTokenCache`, `useSpeech`

### Phase 3: UI Components
- **Navigation chrome**: Header bar with logo, search icon, language switcher, user menu, and hamburger drawer — port of `apps/web/src/components/layout/header.tsx` + `user-menu.tsx` + `language-switcher.tsx`
- Components styled via NativeWind `className` — same Tailwind syntax as the web app
- For complex interactive components that exceed NativeWind's supported Tailwind subset (~90%), fall back to `StyleSheet.create()` fed by shared tokens from ADR-0011
- Port video components: `YouTubePlayer`, `VideoControlBar`, `SubtitleDisplay`, `TokenizedText`, `VideoCard`, `VideoGrid` (FlatList)
- Port dictionary components: `DictionaryPopup` (bottom sheet), `DictionaryEntryCard`, `WordList`, `SearchBar`

### Phase 4: Feature Pages
- Media: Explore (FlatList + infinite scroll), Watch (player + synced transcript), Music, Live TV, TV Shows, Watch History, Local Media, Search, Channels
- Reading: Reader (tokenized text, translation, text action menu)
- Vocab: Dictionary Search, Word Detail (definitions, SubsSearch, inflection table, AI explanation), Saved Words, SRS Review

### Phase 5: Offline & Performance
- Offline dictionary download per ADR-0008: new `GET /dictionary/download` Python endpoint (frequency-filtered, pre-normalized JSON), chunked IndexedDB insert (500 entries/tick, yields to main thread), download UI (language selector, progress bar, delete/update, L1≠en callout, background download with mini-banner)
- Dictionary lookup cache (memory Map for session reuse)
- Video recommendation cache for cold start
- Subtitle token cache persistence
- Image caching via `expo-image`
- Render optimization for TokenizedText

### Phase 6: Testing & Polish
- Feature parity audit against Classic
- Error states, loading skeletons, empty states
- Deep linking (universal links)
- E2E tests

## Key Architectural Decisions

### Dictionary: Three-tier (per ADR-0008)
**Decision**: Adopt ADR-0008's three-tier dictionary architecture:
1. **Online lookup** — `POST /dictionary/lookup` (same as web). All normalization, LLM fallback, and L1 translation happen server-side. Returns `DictionaryEntry[]` up to 5 entries.
2. **Offline download** — New `GET /dictionary/download?l2=ja&l1=en&limit=30000` endpoint. Python server returns pre-normalized, frequency-filtered JSON (~10-15 MB for 20K entries). Chunked non-blocking IndexedDB insert on the client. Definitions are English-only; L1 translations accumulate lazily via online lookups.
3. **LLM cache** — Local SQLite table for `match_type: 'llm'` results. Also stores L1-translated definitions from online lookups so offline mode can serve them.

This eliminates the GO app's main-thread-freezing CSV normalization, provides LLM fallback for rare words, and gives users offline dictionary access without a multi-MB CDN download on first launch. See ADR-0008 for full architecture, download sizing, and UI design.

### Tokenization: Server-side with local cache
**Decision**: Call `POST /lemmatize` for subtitle lines, cache tokens locally via `useVideoTokenCache`. Consider batch-tokenizing all lines for a video in one call when the watch page loads.

### Navigation: Top Bar + Hamburger Drawer (matching Next.js header)

**Decision**: A sticky top bar header with a hamburger drawer — mirroring the Next.js app's `Header` component exactly. No bottom tabs. The web app uses a desktop top bar (logo, dropdown nav groups, search, language switcher, user menu) with a hamburger slide-out drawer on narrow screens. Since mobile screens are always narrow, the nav groups (Media, Reading, Vocab) live in the hamburger drawer. The top bar shows: logo, search icon, language switcher, user avatar, and hamburger.

This is a full port of `apps/web/src/components/layout/header.tsx` — the same NAV_GROUPS constant, the same icons, the same link structure, the same dropdown behavior, the same mobile drawer. The GO app's bottom tab bar is discarded entirely.

**Top bar layout** (port of `Header` component, lines ~140–200):

```
┌──────────────────────────────────────────────────┐
│ [Logo]  [☰]              [🔍] [🌐 L1↔L2] [👤] │
└──────────────────────────────────────────────────┘
```

| Element | Web source | Mobile implementation |
|---|---|---|
| **Logo** | `<Image>` + app name, links to `/explore` | `<Text>` with app name, links to `/(tabs)/(media)` |
| **Hamburger** | `<Menu>` icon, shown `< md` breakpoint | Always visible (mobile is always narrow). Opens a slide-out drawer containing the three nav groups. |
| **Search icon** | `<Search>` icon, navigates to `/search` | Same icon, navigates to `/(tabs)/(media)/search` |
| **Language switcher** | `LanguageSwitcher` — L1/L2 flag buttons with dropdown pickers + swap button | Same component ported to RN. Uses `<Pressable>` instead of `<button>`. |
| **User menu** | `UserMenu` — avatar initial (or user icon if logged out), dropdown with Profile, Settings, Docs, About, Login/Logout | Same component ported to RN. |

**Hamburger drawer** (port of mobile drawer, lines ~215–245):

```
┌─────────────────────────┐
│  MEDIA                  │
│  🧭 Explore             │
│  🎵 Music & Ent.        │
│  📺 Live TV             │
│  🎬 TV Shows            │
│  📜 Watch History       │
│  📤 Local Media         │
│                         │
│  READING                │
│  📄 Notes & Reader      │
│                         │
│  VOCAB                  │
│  📚 Dictionary          │
│  🔖 Saved Words         │
│  🔄 Review              │
└─────────────────────────┘
```

The drawer uses the same `NAV_GROUPS` constant, same icons via `NAV_ICONS`, same link structure, and same i18n keys (`nav.media`, `nav.reading`, `nav.vocab`) as the web header. Each link navigates to the corresponding route in the `(tabs)/` stack.

**User menu dropdown** (port of `UserMenu` component):

- **Logged out**: User icon → dropdown with Login, Docs, About
- **Logged in**: Avatar initial (first letter of name/email) → dropdown with:
  - Header row: name + email
  - Profile (→ `/(tabs)/(vocab)/...` — no dedicated profile page yet, uses saved-words as placeholder)
  - Settings (→ `/settings` modal)
  - Documentation (→ WebView link to docs)
  - About (→ WebView link to about page)
  - Logout (→ clear auth + redirect to login)

**Language switcher** (port of `LanguageSwitcher` component):

- Two pill-shaped buttons showing current L1 and L2 language codes (e.g., `EN` `ZH`)
- Swap button (⇄) between them — only enabled when L2 is also a valid L1
- Tapping a pill opens a searchable dropdown of all supported languages for that slot
- L1 dropdown shows `SUPPORTED_L1S` (31 languages); L2 dropdown shows `SUPPORTED_L2S` (207 languages)
- Popular languages shown first, rest alphabetically

**Route tree** — unchanged from the tab structure; the only change is the navigation chrome (top bar instead of bottom tabs):

```
app/
├── _layout.tsx              ← Root: providers + Header + Stack
├── index.tsx                ← Splash → redirect to (tabs) or login
│
├── (auth)/                  ← Modal-presented auth + onboarding
├── go-pro.tsx               ← Modal: /[l1]/[l2]/go-pro
├── settings.tsx             ← Modal: /[l1]/[l2]/settings
│
└── (tabs)/                  ← Stack-based layout (authenticated users)
    ├── _layout.tsx           ← Header + Stack (no bottom tab bar)
    ├── (media)/             ← Media group
    ├── (reading)/           ← Reading group
    └── (vocab)/             ← Vocab group
```

**Implementation notes**:
- The `(tabs)` directory is an Expo Router layout group (parentheses = no URL segment). Unlike the Next.js app which uses URL-based language routing (`/[l1]/[l2]/explore`), the mobile app stores L1/L2 in React Context (`LanguageProvider`) persisted to `SecureStore`. All components access language state via `useLanguage()` — no URL params needed. The web's URL is the source of truth; the mobile's persisted context is.
- The header is `<Header />` placed above the `<Stack>` in the layout — it persists across all stack screens (same as web's sticky header).
- The hamburger drawer slides in from the right (matching web's mobile drawer at `right-0`).

**Deep linking without `[l1]/[l2]` in the route**:

The web app encodes language pairs in URLs (`languageplayer.io/en/ja/watch/abc123`). The mobile app handles deep links via a different mechanism:

```
Web URL:  https://languageplayer.io/en/ja/watch/abc123
Mobile:   languageplayer://watch/abc123
                    ↑
          No l1/l2 — read from SecureStore
```

When a deep link opens the app:

1. **L1/L2 are set** → The `LanguageProvider` already has `l1Lang`/`l2Lang` from `SecureStore` (set during onboarding, persisted across sessions). The deep link handler directly navigates to the content using the stored language pair. The user never sees a language picker.

2. **L1/L2 are NOT set** (first launch from a deep link) → The app stores the deep link URL, redirects to `/select-l1` → `/select-l2` onboarding, then resumes the deep link to the original destination.

This is how most mobile apps work: Instagram's `instagram://post/123` doesn't include your UI language. Language is user state, not URL state. The `LanguageProvider` + `SecureStore` pattern is the mobile equivalent of the web's `/[l1]/[l2]/` URL prefix — both ensure the language pair is available before any content renders, just through different transport mechanisms.

### i18n: Shared locale directory (per ADR-0009, ADR-0014)
**Decision**: Both apps consume translations from the same `packages/shared/locales/*.json` files (31 locales, nested JSON, ICU MessageFormat), generated from a single `translations.csv`. The mobile app uses `react-intl` with a `resolveNested()` bridge in `useT()`; the web app uses `next-intl`. The `useT()` hook has identical call signature on both platforms. No per-app translation copies, no separate CSVs, no translation drift. See ADR-0009 for the migration architecture and ADR-0014 for the ongoing pipeline documentation.

### Styling: NativeWind + shared tokens (per ADR-0011, amended ADR-0003)
**Decision**: Use NativeWind (Tailwind for React Native) with design tokens shared from `packages/shared/tokens.ts`. Both apps use the same `className` syntax — `"bg-primary text-sm px-4 rounded-lg"` means the same thing on web and mobile. The shared Tailwind config sources its values from `packages/shared/tokens.ts` (colors, spacing, typography, border radius). Dark mode uses `.dark:` prefix on both platforms. For complex styles that exceed NativeWind's ~90% Tailwind subset (no `hover:`, `focus:`, CSS grid, arbitrary selectors), fall back to `StyleSheet.create()` fed by the same shared tokens. Components are never shared (ADR-0003), but the styling language is identical. See ADR-0011 for token architecture and ADR-0003 (amended) for the refined component boundary.

### Video Player: `expo-video` or `react-native-youtube-iframe`
**Decision**: Evaluate during Phase 3. `expo-video` is the modern choice for general video; `react-native-youtube-iframe` may be needed for YouTube-specific features (captions, quality selection).

### Monorepo Metro Configuration
**Decision**: The `apps/mobile-v2/` Metro config requires several additions beyond the default `create-expo-app` output to function in an npm workspace with hoisted `node_modules`:

1. **`resolveRequest` hook** — `expo/AppEntry.js` in the hoisted `node_modules` resolves `../../App` to the monorepo root instead of the app directory. The hook intercepts this and redirects to the correct `App.js`.
2. **`nodeModulesPaths`** — must include both the app's local `node_modules` and the workspace root's `node_modules` so Metro can find all dependencies.
3. **`watchFolders`** — must watch `packages/` for live reload when shared packages change.
4. **`blockList` filtering** — must NOT exclude the `packages/` directory from Metro's transpiler (shared packages ship raw TypeScript).
5. **NativeWind** — `withNativeWind(config, { input: './global.css' })` wraps the config last.

The full annotated config is documented in `specs/008-metro-debugging-process.md` → "Monorepo Metro Configuration".

### Build target: Start from `apps/mobile-v2/`
**Decision**: Build in a new directory to avoid disrupting the existing app. Once feature parity is reached, archive `apps/mobile/` and rename. The legacy `language-player-3/` at the workspace root remains read-only reference (per AGENTS.md).

## Consequences

- **New codebase**: `apps/mobile-v2/` with fresh Expo SDK 57 setup, Expo Router, and shared package dependencies
- **No client-side CSV normalization**: Removes the GO app's main-thread-freezing CSV parsing. All normalization happens on the Python server (both online lookup and offline download endpoints). Offline dictionary is pre-normalized JSON.
- **Offline dictionary support**: Mobile users can download frequency-filtered dictionaries per language (~10-15 MB each). Definitions are English-only offline; L1 translations accumulate lazily. Online lookups use the same `POST /dictionary/lookup` endpoint as the web app.
- **Single settings architecture**: Both apps use `SettingsV2` with cloud sync. Settings roam across devices (same as web).
- **Single API client**: Both apps use `@langplayer/api-client` with typed hooks. No scattered `fetch` calls.
- **Single dictionary approach**: Both apps use `POST /dictionary/lookup` for online lookups. Mobile adds offline download per ADR-0008. Same `DictionaryEntry` types, same normalization, same LLM fallback.
- **Single i18n pipeline**: Both apps read from `packages/shared/locales/*.json` generated from `translations.csv`. Adding a new UI string touches one CSV file; `sync-translations.mjs` regenerates all 31 locale JSONs. Zero translation drift between platforms.
- **Shared Tailwind syntax**: Both apps style components with the same `className` strings (NativeWind on mobile, standard Tailwind on web). A developer who knows Tailwind can style either platform. ~90% of Tailwind utilities work on mobile.
- **Richer feature set on mobile**: Reader, SRS review, live TV, music, channels — features the GO app never had.
- **Migration**: Existing GO app users need to update to the new app. The old app is archived.
- **Timeline**: ~4-6 weeks for a single developer to reach feature parity. Offline dictionary download (Phase 5) adds ~1 week. The new `GET /dictionary/download` Python endpoint is the only backend change needed.
