# ROADMAP.md — Project Plan

> **Canonical phase numbering.** All specs and ADRs reference phases defined here.
> See `specs/002-repo-migration.md` for when legacy repos get merged into this monorepo.

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
- ✅ Documentation (AGENTS.md, README, ROADMAP, specs/, docs/adr/)

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

> 📋 **Spec**: `specs/005-phase2.5-i18n.md`

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

## Phase 5: Content Features

- ✅ TV Shows page
- ⬜ Live TV page
- ⬜ Reader / Books
- ⬜ Phrasebooks
- ⬜ Music page
- ⬜ Learning path / Level system

## Phase 6: User Features

- ⬜ User dashboard
- ✅ Watch history
- ⬜ Progress tracking
- ⬜ Content preferences
- ⬜ Saved words/phrases management
- ✅ Go Pro / Subscription management

## Phase 7: Backend Consolidation

> 🗄️ **Repo merge**: `zerotohero-python` → `apps/api/` (see specs/002)

- ⬜ Merge Python backend into monorepo with full Git history
- ⬜ Wire `apps/api/` into Turborepo pipeline (`npx turbo dev` starts backend too)
- ⬜ Directus 8 → Directus 11 migration plan
- ⬜ CI/CD pipeline (GitHub Actions)
- ⬜ Testing infrastructure (unit + E2E)
- ⬜ Monitoring + error tracking

## Phase 8: Mobile Integration

> 🗄️ **Repo merge**: `language-player-3` → `apps/mobile/` (see specs/002)

- ⬜ Merge React Native app into monorepo with full Git history
- ⬜ Wire `apps/mobile` to use `@langplayer/*` packages
- ⬜ Replace direct API calls with shared `@langplayer/api-client`
- ⬜ Feature parity audit vs Classic

## Phase 9: Sunset Classic

> 🗄️ **Repo merge**: `zerotohero-nuxt` → `apps/classic/` for archival (see specs/002)

- ⬜ Full feature parity audit (web + mobile vs Classic)
- ⬜ Redirect strategy from classic URLs (`languageplayer.io/en/zh/...` → new URLs)
- ⬜ Data migration verification
- ⬜ Merge Nuxt code into monorepo for historical reference
- ⬜ Archive `zerotohero-nuxt` GitHub repo (read-only)
- ⬜ Shut down Classic deployment

---

## Currently Working On
- Phase 4: Dictionary

## Up Next
- Phase 5: Content Features
