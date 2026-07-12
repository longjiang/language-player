# SPEC-003: Phase 2 — Auth + Core Navigation

## Metadata
- **Spec ID**: SPEC-003
- **Feature**: Authentication, language selection, and URL-based navigation
- **Status**: draft
- **Created**: 2026-07-12
- **ROADMAP Phase**: Phase 2 — Auth + Core Navigation

## Overview

Implement the foundational UX layer: user authentication (login, register, email verification, password reset) and language-pair routing (`/[l1]/[l2]/...`). After this phase, a user can create an account, log in, select their languages, and navigate language-scoped pages.

---

## Research Summary

### How Auth Works Today

Both Classic and GO authenticate against **Directus 8** (not the Python backend). Directus is the user database + auth provider.

```
┌──────────────┐     POST /auth/authenticate     ┌──────────────┐
│  Client App  │ ───────────────────────────────→ │  Directus 8  │
│  (Nuxt/RN)   │ ←─────────────────────────────── │  (CMS/Auth)  │
└──────────────┘     { data: { token } }          └──────────────┘
        │
        │  Token stored in:
        │  • Classic: cookies (nuxt-auth)
        │  • GO: AsyncStorage (mobile)
        │
        ▼
┌──────────────┐     GET /users/me (Bearer token)  ┌──────────────┐
│  Validate    │ ───────────────────────────────→  │  Directus 8  │
│  Token       │ ←───────────────────────────────  │              │
└──────────────┘     { data: { id, email, ... } }  └──────────────┘
```

**Classic (Nuxt)**: Uses `@nuxtjs/auth-next` with `local` strategy + `refresh` scheme:
- Login: `POST {DIRECTUS_URL}/auth/authenticate` → `{ data: { token } }`
- Refresh: `POST {DIRECTUS_URL}/auth/refresh` → `{ data: { token } }`
- Logout: `POST {DIRECTUS_URL}/auth/logout`
- Token stored in cookies, 30-day expiry
- No auto-fetch user (fetched separately)

**GO (React Native)**: Direct fetch, no library:
- Login: `POST {DIRECTUS_URL}/auth/authenticate` → `{ data: { token } }`
- Token check: `GET {DIRECTUS_URL}/users/me` with Bearer header
- Registration: direct to Directus (via `apiRegisterUser`)
- Email verification: via Python backend (`POST /verification_email`, `POST /verification_email/verify`)
- Token stored in AsyncStorage via `storageManager`

**Python Backend**: Not involved in auth. Handles:
- Email verification: `/verification_email` (send code), `/verification_email/verify` (validate code)
- User data: `/user-likes`, `/user-watch-history`
- No auth routes — auth is Directus-only

### How Language Routing Works Today

**Classic (Nuxt)**:
- URL pattern: `/:l1/:l2/page` → pages live at `pages/_l1/_l2/`
- Middleware `language-switch.js` reads `params.l1`/`params.l2`, resolves language objects via `app.$languages.getSmart()`, dispatches to Vuex `settings/setL1L2`
- `nuxt-i18n` with `strategy: "no_prefix"` — L1/L2 are custom params, not i18n prefixes
- i18n locale set to L1 code for UI translations
- Dictionary auto-selected based on L1→L2 pair (falls back to Azure machine translation)

**GO (React Native)**:
- No URL routing (mobile app)
- `LanguageContext` provides `{ l1Lang, l2Lang, setL1Lang, setL2Lang }`
- `SettingsContext` persists `l1LangCode`/`l2LangCode` to AsyncStorage
- Language data loaded from CSV via `Languages` singleton
- i18n via `i18n-js` with JSON files per language

---

## Implementation Plan

### Part A: Authentication (Directus via NextAuth.js v5)

Use **NextAuth.js v5** (Auth.js) with a custom credentials provider that wraps Directus 8 auth.

#### Why NextAuth.js v5
- First-class App Router support (Server Components, middleware, Route Handlers)
- Edge-compatible (auth checks in middleware)
- Built-in session management, CSRF protection, callback hooks
- We can wrap Directus as a custom provider

#### Auth Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js App                               │
│                                                                  │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ Login    │ →  │ Auth.js      │ →  │ Directus 8           │  │
│  │ Form     │    │ Route Handler│    │ POST /auth/authenticate│  │
│  │ (Client) │    │ (Server)     │ ←  │ { data: { token } }  │  │
│  └──────────┘    └──────┬───────┘    └──────────────────────┘  │
│                         │                                       │
│                         │ JWT stored in HTTP-only cookie        │
│                         │ (managed by Auth.js)                  │
│                         ▼                                       │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ Middle-  │ →  │ Auth.js      │ →  │ Directus 8           │  │
│  │ ware     │    │ JWT callback │    │ GET /users/me         │  │
│  │ (Edge)   │ ←  │ (validates)  │ ←  │ { data: { user } }   │  │
│  └──────────┘    └──────────────┘    └──────────────────────┘  │
│                                                                  │
│  Python Backend (email verification only):                      │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ Register │ →  │ Python       │ →  │ python.zerotohero.ca  │  │
│  │ Flow     │    │ API Client   │    │ POST /verification_   │  │
│  │          │    │              │    │        email          │  │
│  └──────────┘    └──────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### Tasks

1. **Configure Auth.js** (`apps/web/src/auth.ts`)
   - Custom credentials provider wrapping Directus `POST /auth/authenticate`
   - JWT callback: store Directus token in the Auth.js JWT
   - Session callback: expose user data to client components
   - Refresh token support (Directus `/auth/refresh`)

2. **Auth middleware** (`apps/web/src/middleware.ts`)
   - Protect `/[l1]/[l2]/dashboard` and other authenticated routes
   - Redirect unauthenticated users to `/login`
   - Must be Edge-compatible (no Directus calls in middleware — only check Auth.js session cookie)

3. **Login page** (`apps/web/src/app/login/page.tsx`)
   - Update existing stub with real form + error handling
   - Email + password → `signIn("credentials", {...})`
   - Redirect to dashboard on success

4. **Register page** (`apps/web/src/app/register/page.tsx`)
   - Update existing stub
   - Step 1: email + password → create Directus user
   - Step 2: send verification email → Python `/verification_email`
   - Step 3: enter verification code → Python `/verification_email/verify`
   - Step 4: auto-login after verification

5. **Password reset flow**
   - Forgot password page → Directus password reset
   - Reset password page (token from email link)

6. **Logout**
   - Clear Auth.js session
   - Call Directus `/auth/logout`
   - Redirect to `/`

7. **Add auth hooks to `@langplayer/api-client`**
   - `getAccessToken()` reads from Auth.js session (server) or cookie (client)
   - All API calls automatically include Bearer token

#### Directus Endpoints Used

| Action | Method | URL | Request Body | Response |
|--------|--------|-----|-------------|----------|
| Login | POST | `{DIRECTUS_URL}/auth/authenticate` | `{ email, password }` | `{ data: { token } }` |
| Refresh | POST | `{DIRECTUS_URL}/auth/refresh` | `{ token }` | `{ data: { token } }` |
| Logout | POST | `{DIRECTUS_URL}/auth/logout` | `{ token }` | `{}` |
| Get user | GET | `{DIRECTUS_URL}/users/me` | — (Bearer) | `{ data: { id, email, ... } }` |
| Register | POST | `{DIRECTUS_URL}/users` | `{ email, password, ... }` | `{ data: { id, ... } }` |

#### Python Endpoints Used

| Action | Method | URL | Purpose |
|--------|--------|-----|---------|
| Send code | POST | `{PYTHON_URL}/verification_email` | Send 6-digit code to email |
| Verify code | POST | `{PYTHON_URL}/verification_email/verify` | Validate code |

#### States & Edge Cases

- **Loading**: Skeleton/spinner while Auth.js session is being checked (SessionProvider handles this)
- **Unauthenticated**: Middleware redirects to `/login` with `callbackUrl` param
- **Expired token**: Auth.js JWT callback detects 401 from Directus, attempts refresh, re-issues session
- **Invalid credentials**: Show inline error message, don't redirect
- **Email not verified**: Allow login but show banner prompting verification
- **Rate limiting**: Directus handles this server-side; show generic error to user

---

### Part B: Language Selection & Routing

Replicate Classic's `/[l1]/[l2]/...` URL pattern using Next.js App Router conventions.

#### Route Structure

```
apps/web/src/app/
├── (auth)/                     ← Route group (no language context)
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── forgot-password/page.tsx
├── [l1]/[l2]/                  ← Language-scoped routes (all authenticated pages)
│   ├── layout.tsx              ← LanguageProvider + requires L1/L2 params
│   ├── page.tsx                ← Dashboard / home for this language pair
│   ├── explore/page.tsx
│   ├── watch/[videoId]/page.tsx
│   ├── dictionary/page.tsx
│   ├── settings/page.tsx
│   └── ...                     ← future pages
├── language-select/page.tsx    ← Initial language selection (no L1/L2 yet)
├── layout.tsx                  ← Root layout (ThemeProvider, SessionProvider)
└── page.tsx                    ← Landing page
```

#### Language Resolution Flow

```
1. User visits /en/zh/explore
         │
2. Middleware reads params.l1="en", params.l2="zh"
         │
3. Validates against SUPPORTED_L1S / SUPPORTED_L2S from @langplayer/shared
   ├── Valid → proceed
   └── Invalid → 404
         │
4. [l1]/[l2]/layout.tsx renders <LanguageProvider l1="en" l2="zh">
         │
5. LanguageProvider resolves full language objects:
   • l1 = { code: "en", name: "English", direction: "ltr", ... }
   • l2 = { code: "zh", name: "Chinese", direction: "ltr", han: true, ... }
         │
6. Sets i18n locale to l1.code (UI language)
         │
7. All children access via useLanguage() → { l1, l2, t }
```

#### Tasks

1. **`apps/web/src/middleware.ts`** (Edge)
   - Read `l1`/`l2` from URL pathname
   - Validate against `@langplayer/shared` constants
   - If unauthenticated and accessing `/[l1]/[l2]/...`, redirect to `/login?callbackUrl=...`
   - If visiting `/` without L1/L2 set, redirect to `/language-select`

2. **`apps/web/src/providers/language-provider.tsx`** (Client Component)
   - React Context: `{ l1: Language, l2: Language, setL1, setL2, t }`
   - Resolves language objects from `@langplayer/shared` + extended metadata
   - Sets i18n locale based on L1
   - Persists L1/L2 codes to cookie (for middleware to read on next request)

3. **Language data file** — `packages/shared/src/language-data.ts`
   - Extended language metadata beyond just codes (name, vernacular name, direction, scripts, capabilities)
   - Ported from `language-player-3/src/languages.ts` (CSV → TypeScript)
   - Static data — no API needed

4. **`apps/web/src/app/language-select/page.tsx`**
   - Dual-column picker: left = "I speak..." (L1), right = "I'm learning..." (L2)
   - Search/filter by language name
   - Popular languages at top
   - On confirm → navigate to `/${l1}/${l2}`

5. **`apps/web/src/app/[l1]/[l2]/layout.tsx`**
   - Wraps children in `<LanguageProvider>`
   - Header with language switcher (compact dropdown)
   - Sidebar navigation (or bottom nav on mobile)

6. **i18n setup** — `next-intl`
   - Configure `next-intl` for App Router
   - Port translation JSON files from Classic (`zerotohero-nuxt/static/locales/`) or GO (`language-player-3/assets/localizations/`)
   - Start with `en`, `zh-Hans`, `zh-Hant`, `ja`, `ko`, `es`, `fr`, `de` (most used)
   - `t()` function available via `useLanguage()`

7. **Cookie strategy**
   - L1/L2 codes stored in cookie (for middleware access)
   - Auth token managed by Auth.js (httpOnly, secure)
   - User preferences in DB (fetched after login)

#### States & Edge Cases

- **First visit (no L1/L2)**: `/` → show landing page. "Get Started" → `/language-select`
- **Returning user**: Cookie has L1/L2 → redirect `/` → `/${l1}/${l2}`
- **Invalid L1/L2**: `notFound()` → custom 404 with language suggestions
- **L1 === L2** (learning from same language): Allowed — hide translation features, show monolingual dictionary
- **RTL languages** (ar, he, fa): `dir="rtl"` on `<html>`, layout mirrors
- **Unsupported L1/L2 with content**: Show the content but warn "limited support for this language"

---

### Part C: Header & Navigation Shell

1. **Header** (`apps/web/src/components/layout/header.tsx`)
   - Logo + app name
   - Language switcher (L1 ↔ L2 dropdowns)
   - Navigation links (Explore, Dictionary, Reader — disabled until built)
   - User menu (profile, settings, logout)
   - Mobile hamburger menu

2. **Sidebar** (collapsible, desktop only)
   - Saved words count
   - Watch history
   - Settings quick-access

---

## Component Tree (after Phase 2)

```
RootLayout (layout.tsx)
├── ThemeProvider (next-themes)
├── SessionProvider (NextAuth.js)
│   ├── (auth) group
│   │   ├── LoginPage
│   │   ├── RegisterPage
│   │   └── ForgotPasswordPage
│   ├── LanguageSelectPage
│   └── [l1]/[l2]/Layout
│       ├── LanguageProvider (Context: l1, l2, t)
│       ├── Header
│       │   ├── LanguageSwitcher
│       │   └── UserMenu
│       ├── Sidebar (desktop)
│       └── Page Content
│           ├── Dashboard
│           ├── Explore (stub)
│           └── Settings (stub)
└── Toaster (sonner)
```

## Dependencies to Install

```json
{
  "next-auth": "5.0.0-beta",
  "next-intl": "^3.15.0",
  "@langplayer/shared": "*",
  "@langplayer/utils": "*",
  "@langplayer/api-client": "*"
}
```

## Files to Create / Modify

### New Files
| File | Purpose |
|------|---------|
| `apps/web/src/auth.ts` | Auth.js configuration (Directus provider) |
| `apps/web/src/auth.config.ts` | Edge-compatible auth config for middleware |
| `apps/web/src/middleware.ts` | Auth guard + language validation |
| `apps/web/src/app/api/auth/[...nextauth]/route.ts` | Auth.js Route Handler |
| `apps/web/src/providers/language-provider.tsx` | Language context |
| `apps/web/src/providers/session-provider.tsx` | Auth session wrapper |
| `apps/web/src/app/language-select/page.tsx` | Language picker |
| `apps/web/src/app/[l1]/[l2]/layout.tsx` | Language-scoped layout |
| `apps/web/src/app/[l1]/[l2]/page.tsx` | Dashboard stub |
| `apps/web/src/app/forgot-password/page.tsx` | Password reset |
| `apps/web/src/components/layout/header.tsx` | App header |
| `apps/web/src/components/layout/language-switcher.tsx` | L1/L2 dropdown |
| `apps/web/src/components/layout/user-menu.tsx` | Profile dropdown |
| `apps/web/src/hooks/use-language.ts` | useLanguage() hook |
| `apps/web/src/lib/directus.ts` | Directus API helper |
| `apps/web/src/i18n.ts` | next-intl config |
| `apps/web/messages/en.json` | English translations |
| `packages/shared/src/language-data.ts` | Extended language metadata |

### Modified Files
| File | Change |
|------|--------|
| `apps/web/src/app/layout.tsx` | Add SessionProvider, restructure for auth/language groups |
| `apps/web/src/app/login/page.tsx` | Replace stub with real form |
| `apps/web/src/app/register/page.tsx` | Replace stub with full flow |
| `apps/web/src/app/page.tsx` | Add redirect logic for authenticated users |
| `apps/web/next.config.js` | Add next-intl plugin, image domains |
| `apps/web/src/app/globals.css` | RTL support, header/sidebar styles |
| `package.json` | Add i18n scripts |

## Verification Checklist

- [ ] `npx turbo build` passes
- [ ] Can register a new account (email → verify code → auto-login)
- [ ] Can login with existing credentials
- [ ] Can logout (session cleared, redirected to /)
- [ ] Protected routes redirect to /login when unauthenticated
- [ ] `/en/zh/explore` loads (even if page is a stub)
- [ ] `/invalid/zz/explore` returns 404
- [ ] Language switcher in header changes URL from `/en/zh/...` to `/es/fr/...`
- [ ] Returning user with cookie is redirected to their last L1/L2 pair
- [ ] RTL language (ar) correctly sets `dir="rtl"` and mirrors layout
- [ ] Auth token automatically attaches to `@langplayer/api-client` requests
