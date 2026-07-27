# SPEC-024: Consolidate Directus Calls to Python Backend

## Metadata
- **Spec ID**: SPEC-024
- **Feature**: Move remaining client-side Directus calls to the Flask backend
- **Status**: Draft
- **Created**: 2026-07-27

## Overview

Per the architecture rule in `AGENTS.md`:

> *"Directus 8 is the headless CMS — but treat it as a black box accessed via the Flask API. The reason is that we want to abstract the Directus layer away from the web and mobile apps, so we can migrate to Directus 11 or another backend in the future without changing the clients."*

Currently, both the web app (`apps/web/`) and mobile app (`apps/mobile/`) make **direct HTTP calls to Directus** (`directusvps.zerotohero.ca` or the production Directus URL) from client-side or Next.js API route code. This violates the abstraction layer and creates two concrete problems:

1. **Migration blocker**: Moving to Directus 11 or an alternative backend would require changing every client app (web + mobile) simultaneously.
2. **E2E testing blocker**: Tests against a production Directus instance are fragile and non-deterministic. A mock network layer would need to intercept two separate URLs (Flask + Directus) instead of one.
3. **Directus URL exposure**: The production Directus URL is hardcoded with fallback defaults in both apps — a leak surface if the frontend code is inspected.

## Audit: All Direct Client-to-Directus Calls

### Mobile App (`apps/mobile/`)

| # | File | Directus Endpoint | Method | Purpose |
|---|---|---|---|---|
| M1 | `contexts/AuthContext.tsx` | `/auth/authenticate` | POST | Login — authenticate credentials, receive token |
| M2 | `contexts/AuthContext.tsx` | `/users` | POST | Register — create new user account |
| M3 | `app/forgot-password.tsx` | `/auth/password/request` | POST | Request password reset email |
| M4 | `app/password-reset.tsx` | `/auth/password/reset` | POST | Submit new password with reset token |
| M5 | `app/verify-email.tsx` | `/auth/verify-email` | POST | Verify email address from deep-link token |
| M6 | `app/delete-account.tsx` | `/users/{id}` | DELETE | Delete user account |
| M7 | `app/(tabs)/(media)/watch-history.tsx` | `/items/user_watch_history/{id}` | DELETE | Delete individual watch history entry |

### Web App (`apps/web/`)

| # | File | Directus Endpoint | Method | Purpose |
|---|---|---|---|---|
| W1 | `src/auth.ts` | `/auth/authenticate` | POST | Server-side login (NextAuth `authorize()`) |
| W2 | `src/auth.ts` | `/users/me` | GET | Fetch user profile after login |
| W3 | `src/app/register/page.tsx` | `/zerotohero/users` | POST | Register — create new user account |
| W4 | `src/app/forgot-password/page.tsx` | `/zerotohero/auth/password/request` | POST | Request password reset email |
| W5 | `src/app/api/videos/[videoId]/route.ts` | `/items/youtube_videos{suffix}` | GET | Video metadata + subtitles |
| W6 | `src/app/api/videos/[videoId]/subtitles/route.ts` | `/items/youtube_videos{suffix}` | GET | Subtitles only |
| W7 | `src/app/api/channels/[channelId]/route.ts` | `/items/youtube_videos{suffix}` | GET | Channel video listing (paginated) |

### Already Proxied (no change needed)

The following already go through the Flask backend:

- Dictionary lookups → Flask `/dictionary/*`
- Lemmatization → Flask `/lemmatize-normalized` / `/lemmatize-normalized/batch`
- Settings sync → Flask `/user-data/sync`
- Saved words CRUD → Flask `/dictionary/save-word` / `/dictionary/delete-word`
- SRS data sync → Flask `/user-data/sync`
- Subscription state → Flask `/user-subscription`
- Stripe/IAP payments → Flask `/stripe-checkout` / `/verify-iap-receipt`
- Translation → Flask `/translate` / `/translate_array`
- Video search → Flask `/videos` / `/subs-search`
- TV Shows → Flask `/tv-shows`
- Live TV → Flask `/live-tv`
- Channel info → Flask `/channel-info`
- EPUB parsing → Flask `/epub-parse`
- AI Explain → Flask `/chatgpt/stream`
- Watch history recording → Flask `/watch-history`

## Design

### Principle

All Directus calls are **server-side only**, happening inside the Flask Python backend. Neither the web nor mobile app ever constructs a Directus URL or imports `DIRECTUS_URL`. The Flask backend exposes a unified API surface that both clients consume.

### New Flask Endpoints Required

#### Auth Endpoints

| Endpoint | Method | Proxy Target | Purpose |
|---|---|---|---|
| `/auth/login` | POST | `POST /auth/authenticate` + `POST /users/me` | Authenticate, return token + user profile |
| `/auth/register` | POST | `POST /users` | Create user account |
| `/auth/password-request` | POST | `POST /auth/password/request` | Request password reset email |
| `/auth/password-reset` | POST | `POST /auth/password/reset` | Submit new password |
| `/auth/verify-email` | POST | `POST /auth/verify-email` | Verify email address |
| `/auth/delete-account` | DELETE | `DELETE /users/{id}` | Delete user account |

#### Data Endpoints (already partly proxied)

| Endpoint | Method | Proxy Target | Purpose |
|---|---|---|---|
| `/videos/single` | GET | `GET /items/youtube_videos{suffix}` — **already exists** at `/videos` | Single video metadata + subs |
| `/videos/subtitles` | GET | `GET /items/youtube_videos{suffix}` | Subtitles only (fall back to YouTube) |
| `/channels/{id}/videos` | GET | `GET /items/youtube_videos{suffix}` | Paginated channel video listing |
| `/watch-history/delete` | DELETE | `DELETE /items/user_watch_history/{id}` | Delete a watch history entry |

### Token Propagation

Currently the Directus auth token flows through the app as follows:

**Mobile**: Directus token → stored in `expo-secure-store` → injected into `apiClient` Axios interceptor → sent **to Flask** as `Authorization: Bearer <token>`. Flask uses this token to authenticate Directus queries on behalf of the user.

**Web**: Directus token → stored in NextAuth JWT → exposed via `session.user.directusToken` → injected into `apiClient` via `api-client-provider.tsx` → sent **to Flask** as `Authorization: Bearer <token>`.

This token propagation is **already correct** — both apps already pass the Directus token through to Flask. The problem is that a handful of calls bypass Flask entirely and hit Directus directly.

Under SPEC-024, the auth endpoints on Flask would:

1. **Authenticate** against Directus directly (Flask server has `DIRECTUS_ADMIN_TOKEN` for admin-privileged operations like user creation)
2. **Return** the user's Directus token + user profile to the client
3. The client stores the token and passes it back as `Authorization` on subsequent Flask requests — **exactly as it does today**

For the **login** flow specifically, the token is created by Directus during `POST /auth/authenticate`. Flask can't create this token — it must come from Directus. So Flask proxies the login and returns the Directus-issued token to the client. No change to the client's token handling.

### Migration: Web vs Mobile

For the web app, the Next.js API routes (`/api/videos/[videoId]/route.ts`, `/api/videos/[videoId]/subtitles/route.ts`, `/api/channels/[channelId]/route.ts`) are server-side code running on Next.js. They query Directus from the server, not from the browser. This means:

- They **don't expose Directus URL to the browser** (it's server-side `process.env`)
- They already function as a proxy layer
- However, they still couple the web app to Directus schema and would need changes during a Directus migration

For SPEC-024, the web Next.js API routes can either:
- **(A)** Keep their server-side Directus queries (no Directus URL exposed to clients, but still coupled)
- **(B)** Call the Flask backend instead (fully decoupled — Flask becomes the single Directus proxy)

**Recommendation**: Option B — route web API calls through Flask. This gives a single migration target (Flask) and matches the mobile architecture. The web API routes become thin pass-through wrappers that add Next.js caching (`next: { revalidate }`) on top of Flask responses.

## Implementation Phases

### Phase 1: Auth Proxy on Flask (Effort: M)

Migrate all auth-related Directus calls (M1–M6, W1–W4) to Flask.

**Flask changes:**
1. Create `routes/auth.py` with endpoints:
   - `POST /auth/login` — proxies `POST /auth/authenticate` + `GET /users/me`
   - `POST /auth/register` — proxies `POST /users` (needs Directus admin token for role assignment)
   - `POST /auth/password-request` — proxies `POST /auth/password/request`
   - `POST /auth/password-reset` — proxies `POST /auth/password/reset`
   - `POST /auth/verify-email` — proxies `POST /auth/verify-email`
   - `DELETE /auth/delete-account` — proxies `DELETE /users/{id}`
2. Register the blueprint in `app.py`
3. Add `DIRECTUS_ADMIN_TOKEN` to Flask `.env` — needed for user creation and deletion

**Mobile changes:**
1. `contexts/AuthContext.tsx` — replace `directusAuth()` / `directusRegister()` with `fetch(PYTHON_API_URL + '/auth/login')` and `fetch(PYTHON_API_URL + '/auth/register')`
2. `app/forgot-password.tsx` — replace Directus `fetch` with `fetch(PYTHON_API_URL + '/auth/password-request')`
3. `app/password-reset.tsx` — replace Directus `fetch` with `fetch(PYTHON_API_URL + '/auth/password-reset')`
4. `app/verify-email.tsx` — replace Directus `fetch` with `fetch(PYTHON_API_URL + '/auth/verify-email')`
5. `app/delete-account.tsx` — replace Directus `fetch` with `fetch(PYTHON_API_URL + '/auth/delete-account')`
6. Remove `DIRECTUS_URL` import from all auth screens

**Web changes:**
1. `src/auth.ts` — replace Directus `fetch` in `authorize()` with `fetch(PYTHON_API_URL + '/auth/login')`
2. `src/app/register/page.tsx` — replace `fetch(DIRECTUS_URL + '/zerotohero/users')` with `fetch(PYTHON_API_URL + '/auth/register')`
3. `src/app/forgot-password/page.tsx` — replace `fetch(DIRECTUS_URL + '/zerotohero/auth/password/request')` with `fetch(PYTHON_API_URL + '/auth/password-request')`

**Token flow impact**: None. The Directus token is still issued by Directus — Flask just proxies the auth exchange. The client stores and sends the token identically.

### Phase 2: Watch History on Flask (Effort: S)

**Flask changes:**
1. Add `DELETE /watch-history/delete` to existing `routes/user_data.py` — proxies `DELETE /items/user_watch_history/{id}`, authenticates via the user's Directus token (passed as `Authorization` header from client)

**Mobile changes:**
1. `app/(tabs)/(media)/watch-history.tsx` — replace `fetch(DIRECTUS_URL + '/items/user_watch_history/...')` with `fetch(PYTHON_API_URL + '/watch-history/delete')`

### Phase 3: Video/Subtitle/Channel Endpoints on Flask (Effort: L)

**Note**: The Flask backend already has `/videos` in `routes/video.py` but it uses a different response shape than the web app's Next.js API routes. This phase aligns them.

**Flask changes:**
1. Add `GET /videos/subtitles` — fetch subs_l2 CSV + parse → return `{ lines: SyncedLine[] }`
2. Add `GET /channels/{channelId}/videos` — paginated channel video listing (mirrors web `/api/channels/[channelId]/route.ts`)
3. Verify `/videos` (existing) matches the response shape expected by web's watch page

**Web changes (Next.js API routes):**
1. `src/app/api/videos/[videoId]/route.ts` — replace `fetch(DIRECTUS_URL + ...)` with `fetch(PYTHON_API_URL + '/videos?youtube_id=...&l2=...')`
2. `src/app/api/videos/[videoId]/subtitles/route.ts` — replace `fetch(DIRECTUS_URL + ...)` with `fetch(PYTHON_API_URL + '/videos/subtitles?youtube_id=...&l2=...')`
3. `src/app/api/channels/[channelId]/route.ts` — replace `fetch(DIRECTUS_URL + ...)` with `fetch(PYTHON_API_URL + '/channels/' + channelId + '/videos?...')`
4. Keep Next.js caching layer (`next: { revalidate }`) on top of Flask responses

### Phase 4: Clean Up (Effort: S)

1. Remove `DIRECTUS_URL` constant and all related imports from mobile app
2. Remove `DIRECTUS_URL` / `NEXT_PUBLIC_DIRECTUS_URL` from web app's client-facing code (keep in `auth.ts` only if Phase 1 done)
3. Remove `TABLE_SUFFIX` maps from web API routes (now lives only in Flask `utils_directus.py`)
4. Update `apps/mobile/lib/api-url.ts` to remove `DIRECTUS_URL` export
5. Remove test accounts `e2e.*@zerotohero.ca` creation from Directus API directly — all account lifecycle goes through Flask
6. Verify no remaining `directusvps` references in `apps/` source (excluding docs, comments, and `.expo/` logs)

## Data Flow Diagrams

### Before SPEC-024 (Current)

```
┌──────────┐     ┌──────────────┐     ┌──────────┐
│  Mobile   │────▶│   Flask API  │────▶│ Directus │
│  App      │     │  (most data) │     │    8     │
└──────────┘     └──────────────┘     └──────────┘
      │                                    │
      └────▶ Directus (auth, watch) ───────┘

┌──────────┐     ┌──────────────┐     ┌──────────┐
│   Web     │────▶│  Next.js API  │────▶│ Directus │
│  Browser  │     │   Routes      │     │    8     │
└──────────┘     └──────────────┘     └──────────┘
      │                                    │
      ├────▶ Flask API (search, dict) ─────┘
      └────▶ Directus (auth, register) ────┘
```

### After SPEC-024 (Target)

```
┌──────────┐     ┌──────────────┐     ┌──────────┐
│  Mobile   │────▶│   Flask API  │────▶│ Directus │
│  App      │     │   (ALL)      │     │    8     │
└──────────┘     └──────────────┘     └──────────┘

┌──────────┐     ┌──────────────┐     ┌──────────┐
│   Web     │────▶│  Next.js API  │────▶│ Flask API│──▶│ Directus │
│  Browser  │     │   Routes      │     │          │
└──────────┘     └──────────────┘     └──────────┘
```

The web retains Next.js API routes as a thin caching layer, but these routes call Flask instead of Directus. Directus is accessed **only** by the Flask backend.

## Success Criteria

1. No `DIRECTUS_URL` or `NEXT_PUBLIC_DIRECTUS_URL` imports in any `apps/` source file
2. No `fetch()` calls to `directusvps.zerotohero.ca` or any Directus URL from mobile or web source code
3. All auth flows (login, register, password reset, email verify, delete account) work through Flask
4. All watch history operations go through Flask
5. Video metadata, subtitles, and channel listings serve through Flask (web via Next.js API routes → Flask)
6. Mobile E2E smoke tests (login → tabs → logout) pass with a single mock target (Flask only)
7. `TABLE_SUFFIX` map exists only in `zerotohero-python-server/utils_directus.py`
8. `apps/mobile/lib/api-url.ts` exports only `PYTHON_API_URL`, not `DIRECTUS_URL`

## Open Questions

1. **Directus admin token**: For user creation (register) and deletion (delete account), Flask needs a `DIRECTUS_ADMIN_TOKEN` with privileges to manage users. This already exists in the Flask server's `.env` pattern (see `build-commands.md` note about secrets migration). Verify it's present.

2. **Email verification flow**: The web app currently calls Flask's `/verification_email` (send) and `/verification_email/verify` (verify email code). The mobile app calls Directus `/auth/verify-email` (token-based). These are different flows. SPEC-024 should consolidate both under Flask: `/auth/verify-email/send` and `/auth/verify-email/verify`.

3. **Web auth.ts NextAuth integration**: `src/auth.ts` is a Next.js server file (never shipped to browser). Moving its Directus call to Flask introduces a new HTTP hop. Since this runs during login only, the latency is negligible (~10ms), but worth confirming the Flask server is accessible from the Vercel/Netlify deployment (it is — it's the same Flask server used for all other data).

4. **Rate limiting**: Directus 8 has its own rate limiting. After migration, Flask's rate limiter (`@limiter.limit`) would be the sole throttle. Ensure auth endpoints have appropriate limits (e.g., 5 login attempts/minute).

5. **Directus URL in docs content**: `packages/shared/src/docs.ts` has 31 locale copies of "The password reset link comes from Directus, our identity provider." After migration, this should say "from our server" or similar — the user doesn't need to know about Directus.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Auth migration breaks existing sessions | Medium | High | Test with existing Mary/Bob credentials. Verify session token is same format (Directus JWT). Rollback = revert `auth.ts` and `AuthContext.tsx`. |
| Flask auth endpoints inconsistent with existing Directus null/error handling | Medium | Medium | Maintain the same error response shape. The mobile app already handles `e.message` from `AuthContext` — ensure Flask returns `{ errors: [{ message: "..." }] }` to match Directus. |
| Web register page uses `DIRECTUS_URL` with `/zerotohero` prefix but mobile uses `DIRECTUS_URL` without it | Low | Low | The `/zerotohero` prefix is already in the `DIRECTUS_URL` constant. Web forgot-password and register use `DIRECTUS_URL + '/zerotohero/...'` which produces double `/zerotohero`. This is a pre-existing inconsistency that SPEC-024 should fix. |
| Web API routes lose Next.js ISR caching when switched to Flask | Medium | Medium | Keep the Next.js API route wrapper but have it call Flask. Apply `next: { revalidate }` to the Flask response. Cache headers from Flask can be forwarded. |
