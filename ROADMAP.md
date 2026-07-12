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

## Phase 2: Auth + Core Navigation 🔄

- ⬜ NextAuth.js v5 integration with Flask JWT backend
- ⬜ Auth middleware (protect routes, redirect to login)
- ⬜ User registration flow (email verification)
- ⬜ Password reset flow
- ⬜ L1/L2 language selector (onboarding + settings)
- ⬜ Header/navbar with language switcher
- ⬜ URL-based language routing (`/[l1]/[l2]/...`)

## Phase 3: Explore + Video Player

- ⬜ `/explore` page — fetch videos from API, lazy load, filters
- ⬜ `/explore/[l2]` — language-specific browse with difficulty levels
- ⬜ Video player page (`/[l1]/[l2]/watch/[videoId]`)
- ⬜ YouTube iframe integration with dual subtitles
- ⬜ Synced transcript view
- ⬜ Playback speed control
- ⬜ Auto-pause after subtitle

## Phase 4: Dictionary

- ⬜ Tap-to-lookup (click a word → dictionary popup)
- ⬜ Dictionary search page
- ⬜ Word saving / vocabulary list
- ⬜ Tokenization + lemmatization display
- ⬜ Pronunciation (TTS)

## Phase 5: Content Features

- ⬜ Live TV page
- ⬜ TV Shows page
- ⬜ Reader / Books
- ⬜ Phrasebooks
- ⬜ Music page
- ⬜ Learning path / Level system

## Phase 6: User Features

- ⬜ User dashboard
- ⬜ Watch history
- ⬜ Progress tracking
- ⬜ Content preferences
- ⬜ Saved words/phrases management
- ⬜ Go Pro / Subscription management

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
- Phase 2: Auth + Core Navigation

## Up Next
- Phase 3: Explore + Video Player
