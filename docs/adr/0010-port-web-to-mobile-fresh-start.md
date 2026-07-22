# ADR-0010: Port Next.js Web App to React Native — Fresh Start

**Date**: 2026-07-22
**Status**: proposed
**See also**: [ADR-0003 (no shared UI, amended)](./0003-no-shared-ui.md), [ADR-0008 (GO dictionary architecture)](./0008-go-dictionary-architecture.md), [ADR-0009 (i18n migration — shared locale directory)](./0009-go-i18n-migration-react-intl.md), [ADR-0011 (shared design tokens)](./0011-shared-design-tokens.md)

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
- Components styled via NativeWind `className` — same Tailwind syntax as the web app. Where the web app uses `<div className="bg-primary text-sm px-4">`, the mobile app uses `<View className="bg-primary text-sm px-4">`.
- For complex interactive components that exceed NativeWind's supported Tailwind subset (~90% — no `hover:`, `focus:`, CSS grid, arbitrary selectors), fall back to `StyleSheet.create()` fed by shared tokens from ADR-0011.
- Port video components: `YouTubePlayer`, `VideoControlBar`, `SubtitleDisplay`, `TokenizedText`, `VideoCard`, `VideoGrid` (FlatList)
- Port dictionary components: `DictionaryPopup` (bottom sheet), `DictionaryEntryCard`, `WordList`, `SearchBar`
- Port layout: Tab bar (3 tabs: Media, Reading, Vocab — matching web sidebar)

### Phase 4: Feature Pages
- Tab 1 (Media): Explore (FlatList + infinite scroll), Watch (player + synced transcript), Music, Live TV, TV Shows, Watch History, Local Media, Search, Channels
- Tab 2 (Reading): Reader (tokenized text, translation, text action menu)
- Tab 3 (Vocab): Dictionary Search, Word Detail (definitions, SubsSearch, inflection table, AI explanation), Saved Words, SRS Review
- Additional: Reader, SRS Review, Live TV, Music, Channels

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

### Navigation: Expo Router Tabs

**Decision**: Three bottom tabs — **Media**, **Reading**, **Vocab** — matching the Next.js sidebar's three dropdown groups exactly. This is a full port of the web app's information architecture; the GO app's legacy tab structure (Media, Dictionary, Me) is discarded entirely. Expo Router provides file-based routing with stack pushes for detail screens and modals for auth/onboarding.

**Route tree** — every route maps directly to a Next.js web page:

```
app/
├── _layout.tsx              ← Root: providers (Language → Intl → Auth → Stack)
├── index.tsx                ← Splash → redirect to (tabs) or login
│
├── (auth)/                  ← Modal-presented auth + onboarding (no tabs)
│   ├── login.tsx            ← /login
│   ├── register.tsx         ← /register
│   ├── forgot-password.tsx  ← /forgot-password
│   ├── select-l1.tsx        ← /language-select
│   ├── select-l2.tsx        ← /language-select (step 2)
│   └── select-level.tsx     ← Set CEFR/HSK/JLPT level
│
├── go-pro.tsx               ← Modal: /[l1]/[l2]/go-pro
├── settings.tsx             ← Modal: /[l1]/[l2]/settings
│
└── (tabs)/                  ← 3-tab layout (authenticated users)
    ├── _layout.tsx
    │
    ├── (media)/             ← TAB 1: Media  (matches web sidebar "Media" group)
    │   ├── _layout.tsx
    │   ├── index.tsx         ← /[l1]/[l2]/explore
    │   ├── music.tsx         ← /[l1]/[l2]/music
    │   ├── live-tv.tsx       ← /[l1]/[l2]/live-tv
    │   ├── tv-shows.tsx      ← /[l1]/[l2]/tv-shows
    │   ├── watch-history.tsx ← /[l1]/[l2]/watch-history
    │   ├── local-media.tsx   ← /[l1]/[l2]/local-media
    │   ├── search.tsx        ← /[l1]/[l2]/search (YouTube + URL paste)
    │   ├── channel/
    │   │   └── [channelId].tsx ← /[l1]/[l2]/channel/[id]
    │   └── watch/
    │       └── [videoId].tsx ← /[l1]/[l2]/watch/[videoId]
    │
    ├── (reading)/           ← TAB 2: Reading  (matches web sidebar "Reading" group)
    │   ├── _layout.tsx
    │   └── index.tsx         ← /[l1]/[l2]/reader
    │
    └── (vocab)/             ← TAB 3: Vocab  (matches web sidebar "Vocab" group)
        ├── _layout.tsx
        ├── index.tsx         ← /[l1]/[l2]/dictionary (search + result list)
        ├── saved-words.tsx   ← /[l1]/[l2]/saved-words
        ├── review.tsx        ← /[l1]/[l2]/review (SRS flashcards)
        └── word/
            └── [entryId].tsx ← /[l1]/[l2]/dictionary/word/[id]
```

**Next.js sidebar → mobile tab mapping**. The tabs mirror the web sidebar groups 1:1:

| Web Sidebar | Web Page (key) | Web Route | Mobile Tab | Mobile Route |
|---|---|---|---|---|
| **Media** | `title.explore` | `/explore` | Media | `(media)/index.tsx` |
| | `title.music_and_entertainment` | `/music` | Media | `(media)/music.tsx` |
| | `title.live_tv` | `/live-tv` | Media | `(media)/live-tv.tsx` |
| | `title.tv_shows` | `/tv-shows` | Media | `(media)/tv-shows.tsx` |
| | `title.watch_history` | `/watch-history` | Media | `(media)/watch-history.tsx` |
| | `title.local_media` | `/local-media` | Media | `(media)/local-media.tsx` |
| **Reading** | `title.notes_reader` | `/reader` | Reading | `(reading)/index.tsx` |
| | `title.web_reader` | `/web-reader` | — | (desktop-only, dropped) |
| | `title.epub_reader` | `/epub` | — | (desktop-only, dropped) |
| **Vocab** | `title.dictionary` | `/dictionary` | Vocab | `(vocab)/index.tsx` |
| | `title.saved_words` | `/saved-words` | Vocab | `(vocab)/saved-words.tsx` |
| | `title.review` | `/review` | Vocab | `(vocab)/review.tsx` |

**Additional mobile routes** (not in web sidebar, but in web app):
- `search.tsx` — YouTube search + URL paste. On web this is accessed via the header search bar; on mobile it gets a dedicated screen in the Media stack.
- `channel/[channelId].tsx` — YouTube channel detail. On web this is nested under the Media sidebar group but not listed as a top-level link.
- `watch/[videoId].tsx` — Video player with transcript. The web app's primary surface; lives in the Media stack because users arrive here from content discovery.
- `settings.tsx` — Presented as a modal (not a tab). Matches the web app's settings page at `/[l1]/[l2]/settings`.
- `go-pro.tsx` — Subscription upgrade, presented as a modal.

**Pages dropped** (web-only, no mobile equivalent):
- `epub`, `web-reader` — desktop reading formats. Mobile uses the unified Reader in the Reading tab.
- `tokenizer` — developer tool.
- `docs` — documentation hub (could be a WebView link later).
- `about`, `og` — landing/marketing pages for unauthenticated web visitors.

### i18n: Shared locale directory (per ADR-0009)
**Decision**: Both apps consume translations from the same `packages/shared/locales/*.json` files (31 locales, nested JSON, ICU MessageFormat), generated from a single `translations.csv`. The mobile app uses `react-intl` with a `resolveNested()` bridge in `useT()`; the web app uses `next-intl`. The `useT()` hook has identical call signature on both platforms. No per-app translation copies, no separate CSVs, no translation drift. See ADR-0009 for the full migration architecture.

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
