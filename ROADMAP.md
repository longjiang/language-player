# ROADMAP.md — Project Plan

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

## Phase 7: Mobile Integration

- ⬜ Move `language-player-3` into `apps/mobile`
- ⬜ Wire `apps/mobile` to use `@langplayer/*` packages
- ⬜ Replace direct API calls with shared client
- ⬜ Feature parity audit vs Classic

## Phase 8: Backend + Infrastructure

- ⬜ Move `zerotohero-python` into `apps/api`
- ⬜ Directus 8 → Directus 11 migration plan
- ⬜ CI/CD pipeline (GitHub Actions)
- ⬜ Testing infrastructure (unit + E2E)
- ⬜ Monitoring + error tracking

## Phase 9: Sunset Classic

- ⬜ Full feature parity audit
- ⬜ Redirect strategy from classic URLs
- ⬜ Data migration verification
- ⬜ Archive `zerotohero-nuxt`

---

## Currently Working On
- Auth + Core Navigation (Phase 2)

## Up Next
- Explore + Video Player (Phase 3)
