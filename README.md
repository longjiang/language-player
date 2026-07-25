# Language Player — Monorepo

A monorepo for the Language Player platform: web (Next.js), mobile (React Native/Expo), and backend (Python/Flask).

## Project Overview

Language Player helps users learn 60+ languages through authentic video content with interactive dual subtitles, built-in dictionary, and smart difficulty tracking.

### Three Legacy Codebases (being consolidated)

| Name | Tech | Status |
|------|------|--------|
| `zerotohero-nuxt` | Vue 2 / Nuxt 2 | **Classic** — full-featured, production. Being phased out. |
| `language-player-3` | React Native / Expo 51 | **GO** — original mobile app. Archived at `apps/mobile-go-legacy/`. Superseded by fresh port. |
| `zerotohero-python` | Flask | **Backend** — payments, LLM, lemmatization, YouTube data. Active. |

### Monorepo Structure

```
language-player/
├── apps/
│   ├── web/                  ← Next.js 14 (App Router) — replaces Classic
│   ├── mobile/               ← React Native/Expo 57 — fresh port from Next.js (ADR-0010)
│   └── mobile-go-legacy/     ← language-player-3 (archived GO app)
├── packages/
│   ├── shared/       ← @langplayer/shared — TypeScript types & constants
│   ├── api-client/   ← @langplayer/api-client — typed Axios API client
│   └── utils/        ← @langplayer/utils — shared utility functions
├── docs/             ← specs, ADRs, architecture docs (see docs/README.md)
├── turbo.json        ← Turborepo build pipeline
└── package.json      ← npm workspaces root
```

### Tech Stack

- **Web**: Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui, next-themes
- **Mobile**: React Native, Expo 57, Expo Router, NativeWind
- **Backend**: Python, Flask, Directus 8 (headless CMS — upgrade planned)
- **Database**: MySQL via Directus
- **Shared**: TypeScript, Axios, Turborepo, npm workspaces
- **Auth**: NextAuth.js v5 (web), existing JWT (backend)

## Getting Started

```bash
# Use Node 22+
nvm use 22

# Install all dependencies
npm install

# Start the Next.js dev server
npx turbo dev --filter=@langplayer/web

# Build everything
npx turbo build

# Run tests
npx turbo test

# Type checking
npx turbo typecheck
```

## Key Conventions

### Language Codes
- **L1** = user's native language (UI language) — e.g., `en`, `zh-Hans`
- **L2** = target language being learned — e.g., `zh`, `ja`, `ko`
- URL pattern: `/:l1/:l2/page` (e.g., `/en/zh/explore`)
- ISO 639-1 when available, else ISO 639-3

### Naming
- `@langplayer/*` — npm workspace scope for internal packages
- Components: PascalCase files, `useXxx` for hooks, `XxxProvider` for contexts
- Files: kebab-case for pages/routes, PascalCase for components

### Shared vs. App-Specific
- **Shared packages** (`@langplayer/*`): types, API client, pure utilities — NO React/RN/Next.js imports
- **App code**: imports from `@langplayer/*` packages, never the reverse
- UI components: NOT shared between web and mobile (different rendering models)

### State Management
- **Web (Next.js)**: React Context + URL search params for language state
- **Mobile (Expo)**: React Context + AsyncStorage (existing pattern)
- **Both**: `@langplayer/api-client` for server state

## URL Structure (Next.js App)

Following the Classic Nuxt pattern:

```
/                          ← Landing page
/[l1]/[l2]/explore         ← Explore media for language pair
/[l1]/[l2]/watch/[videoId] ← Video player
/[l1]/[l2]/dictionary      ← Dictionary lookup
/[l1]/[l2]/reader          ← Reader / books
/[l1]/[l2]/phrasebooks     ← Phrasebooks
/[l1]/[l2]/live-tv         ← Live TV channels
/[l1]/[l2]/settings        ← User settings
/login                     ← Auth (no language context)
/register                  ← Auth (no language context)
```

## Git Strategy

Single repository, all apps and packages versioned together.
- `apps/web`, `apps/mobile`, `apps/api` — deployable applications
- `packages/*` — shared libraries, versioned with apps
- CI/CD: use Turborepo's `--filter` to build/test/deploy only what changed

## Related Documentation

- `docs/adr/` — Architecture Decision Records
- `specs/` — Feature specifications
- `AGENTS.md` — Instructions for AI coding agents
- `ROADMAP.md` — Project plan and to-do list
