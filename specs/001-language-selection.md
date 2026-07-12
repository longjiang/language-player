# SPEC-001: Language Selection & Routing

## Metadata
- **Spec ID**: SPEC-001
- **Feature**: Language Selection & URL Routing
- **Status**: draft
- **Created**: 2026-07-12
- **Phase**: Phase 2 — Auth + Core Navigation

## Overview
Users select their native language (L1) and target language (L2). These choices are reflected in the URL as `/[l1]/[l2]/...` and persisted across sessions. The UI language (i18n) follows L1.

## User Stories
- As a new user, I want to select my native language and the language I'm learning so the platform shows relevant content.
- As a returning user, I want my language choices remembered so I don't have to re-select them.
- As a user, I want to share a URL like `/en/zh/explore` and have it work for anyone.

## How It Works in Classic (Nuxt)

### URL Structure
```
/:l1/:l2/page
```
- `pages/_l1/_l2/` — Nuxt dynamic nested routes
- `zerotohero-nuxt/middleware/language-switch.js` — reads `params.l1` and `params.l2`, resolves language objects via `app.$languages.getSmart()`, dispatches to Vuex store `settings/setL1L2`
- `zerotohero-nuxt/store/settings.js` — holds `l1` and `l2` language objects, persists to localStorage
- nuxt-i18n uses `strategy: "no_prefix"` — the L1/L2 in URL are custom params, NOT i18n prefixes
- i18n locale set to L1 code for UI translations

### Language Resolution
- `app.$languages.getSmart(code)` — fuzzy-matches language code against known languages
- Falls back to loading full language list if common list doesn't include the code
- Sets dictionary name based on L1→L2 pair
- Falls back to machine-translated dictionary via Azure if no bilingual dictionary exists

## How It Works in GO (React Native)

- No URL routing — mobile app
- `LanguageContext` provides `l1Lang`, `l2Lang`, `setL1Lang`, `setL2Lang`
- `SettingsContext` persists `l1LangCode` and `l2LangCode` to AsyncStorage
- Language objects loaded from CSV via `Languages` singleton
- UI locale set via `i18n-js` with `i18n.locale = l1Lang.code`

## Implementation Plan (Next.js)

### Routes
```
/[l1]/[l2]/...           ← All language-scoped pages
/language-select          ← Initial language selection (no L1/L2 yet)
```

### Data Flow
1. User visits `/` → redirected to `/language-select` if no L1/L2 set
2. User selects L1 and L2 → stored in cookie + URL
3. Middleware reads `params.l1` and `params.l2` from URL
4. `LanguageProvider` resolves language objects from `@langplayer/shared` constants
5. All child components access L1/L2 via `useLanguage()` hook
6. UI translations loaded based on L1 (using next-intl or similar)

### Components
- `LanguageSelectPage` — dual picker (L1 + L2) with search, used during onboarding
- `LanguageSwitcher` — compact dropdown in header for changing languages
- `LanguageProvider` — React Context providing `{ l1, l2, setL1, setL2 }`
- `LanguageGuard` — middleware wrapper that redirects if L1/L2 not set

### States
- **Loading**: Skeleton while language list loads
- **No selection**: Show `LanguageSelectPage`
- **Invalid L1/L2**: 404 page
- **Edge case**: L1 === L2 (learning from same language) — hide translation, show monolingual dictionary

### API Endpoints
- Language data is static (from `@langplayer/shared`), no API needed
- User preferences for L1/L2 saved via `PUT /auth/preferences`

## Dependencies
- `@langplayer/shared` (SUPPORTED_L1S, SUPPORTED_L2S constants)
- `@langplayer/utils` (languageNameFromCode)
- Phase 2 Auth (for persisting preferences)

## Open Questions
- Use `next-intl` or custom i18n? (Leaning next-intl for App Router compatibility)
- Cookie vs URL params for persistence? (Use URL as source of truth, cookie as fallback)
- How to handle L1/L2 that aren't in SUPPORTED_L1S/SUPPORTED_L2S but have content?
