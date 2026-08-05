# ROADMAP.md — Project Plan

> **Canonical phase numbering.** All specs and ADRs reference phases defined here.
> See `docs/specs/002-repo-migration.md` for when legacy repos get merged into this monorepo.

## Legend
- ⬜ Not started
- 🔄 In progress
- ✅ Complete

---

## Phase 1: Foundation ✅

- ✅ Monorepo setup (Turborepo + npm workspaces)
- ✅ `@langplayer/shared` package (types + constants)
- ✅ `@langplayer/api-client` package (typed API client)
- ✅ `@langplayer/utils` package (formatting, language, difficulty)
- ✅ `apps/web` scaffold (Next.js 14, Tailwind, shadcn/ui)
- ✅ Landing page, Explore page, Login/Register pages
- ✅ Dark mode support (next-themes)
- ✅ Build pipeline verified
- ✅ Documentation (AGENTS.md, README, ROADMAP, docs/specs/, docs/adr/, docs/arch/)

## Phase 2: Auth + Core Navigation ✅

- ✅ NextAuth.js v5 (beta.31) integration with Directus 8 credentials provider
- ✅ Auth middleware (cookie-based session check, protect routes, redirect to login)
- ✅ User registration flow (3-step: form → email verification → auto-login)
- ✅ Password reset flow (Directus)
- ✅ L1/L2 language selector (onboarding dual-picker + search)
- ✅ Header/navbar with language switcher + swap button
- ✅ URL-based language routing (`/[l1]/[l2]/...`)
- ✅ Dashboard stub with feature links
- ✅ Login, Register, Forgot Password, Language Select pages

## Phase 3: Explore + Video Player ✅

- ✅ `/explore` page — fetch videos from API, lazy load, level filter
- ✅ Video cards with thumbnails, difficulty badges, duration, views (grid + list variants)
- ✅ Video player page (`/[l1]/[l2]/watch/[videoId]`)
- ✅ YouTube iframe integration with IFrame API (play/pause/seek/speed)
- ✅ Video control bar (play/pause, prev/next line, rewind, speed 1×/0.75×/0.5×, progress bar)
- ✅ Player queue (recommended/tvShow/search types, prev/next video skip)
- ✅ Up Next sidebar with scrollable queue list, current video highlighted
- ✅ Subtitle display — L2 captions always shown, L1 translation below (DeepSeek LLM)
- ✅ Subtitle improvements — duration prefix stripping, click-to-seek, subtitle-based line nav
- ✅ Live translation via Python /translate_array (5 lines/chunk, progressive)
- ✅ Loading skeletons, error states, empty states
- ✅ Client settings (localStorage) for translation toggle
- ✅ `lib/utils.ts` — `cn()` classname utility

## Phase 2.5: UI Internationalization ✅

> 📋 **Spec**: `docs/specs/005-phase2.5-i18n.md`

- ✅ Wire up `next-intl` with App Router (middleware, provider, request config)
- ✅ Copy 31 locale files from GO (`assets/localizations/` → `apps/web/messages/`)
- ✅ Supported L1 languages: af, ar, ca, de, el, en, es, fi, fr, ga, hi, hr, hu, id, it, ja, ko, nl, no, pl, pt, ro, ru, sr, sv, sw, th, tr, vi, zh-Hans, zh-Hant
- ✅ Replace hardcoded English strings with `t()` in all pages and components (~70 strings across 12 files)
- ✅ Add ~35 missing keys to `en.json` (title, action, msg, placeholder, subtitle categories)
- ✅ L1 cookie → locale passthrough in middleware via `next-intl` middleware

## Phase 4: Dictionary

- ✅ Tap-to-lookup (click a word → dictionary popup)
- ✅ Dictionary search page
- ✅ Word saving / vocabulary list 🔄
- ✅ Tokenization + lemmatization display
- ✅ Pronunciation (TTS) — Web Speech API with per-language voice auto-selection + VoicePicker settings
- ✅ TV Shows page — browse shows with search, sort (views/title/year), locale filter, poster grid
- ✅ Dictionary database rebuild, add classifier for cedict, gender and audio for wiktionary, and add pytohn code to supply inflections via inflectors
- ✅ Shared Radix sidebar primitive (dictionary, reader, EPUB, web-reader) + Radix migration of all web ui primitives (SPEC-030, ADR-0020)

## Phase 5: Content Features

- ✅ TV Shows page
- ✅ Live TV page
- ✅ Reader and Notes
- ✅ Music page
- ✅ Level system
- ✅ Documentation / Help

## Phase 6: User Features

- ✅ Watch history
- ✅ Video likes + playlist management (SPEC-040)
- ✅ Go Pro / Subscription management
- ✅ Delete account (SPEC-041)

## Phase 7: Mobile Integration ✅ (pivoted)

> 🗄️ **Repo merge**: `language-player-3` → `apps/mobile-go-legacy/` (see docs/specs/002)
> 🔄 **Pivot**: ADR-0010 — fresh port from Next.js → React Native at `apps/mobile/` (formerly `apps/mobile-v2/`)

### GO App (Legacy) — preserved at `apps/mobile-go-legacy/`

- ✅ **Step 1: Expo SDK upgrade (51 → 57)** — two-hop strategy
  - ✅ Hop 1: 51 → 54 (Legacy Architecture bridge)
  - ✅ Hop 2: 54 → 57 (modernization leap)
- ✅ **Step 2: Wire shared packages** — refactor to use `@langplayer/shared`, `@langplayer/utils`, and `@langplayer/api-client`
- ✅ **Step 3: Merge** — merge React Native app into monorepo with full Git history at `apps/mobile-go-legacy/`

### Fresh Port (Active) — `apps/mobile/`

- ✅ **Scaffold** — new Expo SDK 57 app, NativeWind, shared packages, i18n pipeline
- ✅ **Porting** — porting all Next.js pages/components to React Native (see AGENTS.md Mobile Porting Rules)
- ⬜ **Interaction primitives** — adopt `@rn-primitives` (Dialog, Select, Switch, Tabs, Drawer) for headless interaction behavior, wrapped with NativeWind + design tokens. See [ADR-0014](./docs/adr/0014-rn-primitives-interaction-primitives.md).
- ⬜ **Feature parity** — validate against Classic for completeness

## Phase 8: Sunset Classic

> 🗄️ **Repo merge**: `zerotohero-nuxt` → `apps/classic/` for archival (see docs/specs/002)

- ⬜ Full feature parity audit (web + mobile vs Classic)
- ⬜ Redirect strategy from classic URLs (`languageplayer.io/en/zh/...` → new URLs)
- ⬜ Data migration verification
- ⬜ Merge Nuxt code into monorepo for historical reference
- ⬜ Archive `zerotohero-nuxt` GitHub repo (read-only)
- ⬜ Shut down Classic deployment

## Phase 9: Backend Consolidation

> 🗄️ **Repo merge**: `zerotohero-python` → `apps/api/` (see docs/specs/002)

- ⬜ Merge Python backend into monorepo with full Git history
- ⬜ Wire `apps/api/` into Turborepo pipeline (`npx turbo dev` starts backend too)
- ⬜ Directus 8 → Directus 11 migration plan
- ⬜ CI/CD pipeline (GitHub Actions)
- ⬜ Testing infrastructure (unit + E2E)
- ⬜ Monitoring + error tracking

---

## Currently Working On
- Phase 7: Mobile Integration — porting all Next.js pages to React Native
