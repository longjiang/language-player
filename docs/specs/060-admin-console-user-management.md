# SPEC-060: Admin Console — User Management

## Metadata
- **Spec ID**: SPEC-060
- **Feature**: Admin console web app (`apps/admin`) with user management
- **Status**: complete
- **Created**: 2026-08-09
- **ROADMAP Phase**: Phase 10: Admin Console
- **See also**:
  - `docs/adr/0032-admin-console-app.md` — why a separate admin app
  - `zerotohero-nuxt/pages/admin/manage-subscriptions.vue` — Classic's subscription admin page (reference)
  - `zerotohero-python-server/routes/admin_users.py` — new backend API

## Overview

Language Player previously had no dedicated admin surface in the new stack:
Classic had a small `/admin` area for subscriptions and content, but the
Next.js app had no equivalent, and there was no way to look a user up by
arbitrary information or see their learning data in one place. This spec adds
a standalone admin console at `apps/admin` that is only reachable by
administrators (`app_metadata.is_admin = true` in Supabase Auth). It starts
with user management: search, profile overview, subscriptions, learning
progress, saved words, watch history, likes, playlists, notes, phrases,
bookshelf, SRS, settings, and acquisition source — plus grant / change /
remove actions for subscriptions.

## User Stories

- As an admin, I want to search users by email, name, phone, auth UUID,
  legacy Directus id, payment email/id/customer id, or subscription id, so I
  can find any account without knowing their exact email.
- As an admin, I want to see a user's subscriptions, progress, saved words,
  history, and library data on one page, so I can answer support questions
  quickly.
- As an admin, I want to grant, change, or remove a user's subscription, so I
  can fix billing issues without touching the database.
- As an admin, I want to be the only kind of user who can log in, so the
  admin surface never leaks to regular accounts.

## How It Works in Classic (Nuxt)

Classic's admin tools (`zerotohero-nuxt/pages/admin/*`) are plain pages gated
by a client-side `$adminMode` flag. `manage-subscriptions.vue` calls
`POST /admin/update_or_add_subscription` and
`GET /admin/check_user_subscription?email=…` with the user's own auth token —
those two legacy endpoints are **not** gated by `require_admin()` server-side.
The new admin console does **not** use those endpoints; it uses new routes in
`routes/admin_users.py` that verify the Supabase JWT `app_metadata.is_admin`
claim on every request.

> Security note: the two legacy subscription endpoints in
> `zerotohero-python-server/routes/subscriptions.py` are still unauthenticated
> at the server level for Classic compatibility. Gating them (or retiring
> them once Classic is archived) is tracked as follow-up work in ADR-0032.

## Backend API (`routes/admin_users.py`)

All routes require `Authorization: Bearer <Supabase access token>` with
`app_metadata.is_admin = true`; otherwise Flask returns 401/403.

| Method | Route | Description |
|---|---|---|
| GET | `/admin/users/search?q=&limit=` | Substring search across auth.users (id, email, phone, first/last name), user_id_map (legacy id, email), and user_subscriptions (id, payment email/id/customer id, notes). Returns compact user rows with subscription summary, saved-word count, watch count, and total hours. |
| GET | `/admin/users/<user_id>` | Full profile (auth + legacy ids, admin flag, dates) plus subscriptions, per-L2 progress, saved words (totals, per-L2 counts, recent 50 with contexts), watch history (recent 30), likes, playlists, notes, phrases, bookshelf, history, SRS, settings, and acquisition survey. Accepts a legacy Directus numeric id too. |
| POST | `/admin/users/<user_id>/subscriptions` | Grant a subscription. `type` is required (`monthly` / `annual` / `lifetime` / `trial`); `expires_on` is auto-computed from the plan when omitted; optional `status`, payment fields, and `notes`. |
| PATCH | `/admin/subscriptions/<id>` | Change subscription fields. When `type` changes and `expires_on` is not supplied, the expiry is recomputed from the new plan. |
| DELETE | `/admin/subscriptions/<id>` | Remove a subscription entirely. |

Subscription writes reuse `utils_subscription.add_subscription` /
`update_subscription` / `delete_subscription`, so MailerLite group assignment
and the existing `user_subscriptions` row shape are preserved.

## Admin App (`apps/admin`)

### Stack

- Next.js 16 + Turbopack, React 19, Tailwind v3 with the shared semantic
  design tokens (CSS variables copied from `apps/web`).
- NextAuth v5 (beta.31) with a single Credentials provider. Login calls
  Flask `POST /auth/login`; the authorize step rejects any user whose
  `isAdmin` claim is false (`admin_only` error), so only administrators can
  establish a session.
- `src/proxy.ts` (Next.js 16 proxy, the renamed middleware) protects every
  route and redirects unauthenticated visitors to `/login`.
- `next-intl` with `useT()` for every UI string. Admin-only keys live in
  `translations.csv` (source of truth) and are regenerated into
  `packages/shared/locales/*.json`; the app currently renders English.
- Logging goes through `src/lib/logger.ts` with the `[LP Admin]` prefix and a
  `NEXT_PUBLIC_LOG_LEVEL` switch, matching the project-wide convention.

### Pages

- `/login` — credentials form; shows a specific message when the account is
  valid but not an administrator.
- `/` — user search dashboard. One query box searches all supported fields;
  results show name, email, plan/admin badges, saved-word count, watch count,
  hours, and creation date. Rows link to the user page.
- `/users/[id]` — user detail page with four tabs:
  - **Overview**: profile (email, phone, IDs, dates, acquisition source),
    subscription manager (grant/edit/remove dialogs), SRS summary, settings
    presence.
  - **Learning Progress**: per-L2 table with level, time watched, weekly goal.
  - **Saved Words**: totals, per-L2 breakdown, and the 50 most recent words
    with their saved contexts.
  - **Recent Activity**: watch history, likes, playlists, notes, phrases,
    bookshelf, and history counts/lists.

### Subscription manager

The grant and edit dialogs expose plan, status, payment processor, payment
id, customer id, payment email, expiry date, and notes. Granting with an
empty expiry auto-computes it from the plan; editing recomputes expiry when
the plan changes and the admin does not override the date. Removal requires
an explicit confirm dialog. All mutations re-fetch the user detail so the
summary badges stay correct.

## i18n

69 admin keys were added through `scripts/add-translation-key.mjs` with all
31 locales supplied, then `scripts/sync-translations.mjs csv-to-json`
regenerated `packages/shared/locales/*.json`. Existing keys (`action.search`,
`title.subscription`, `subscription.monthly`, …) are reused where possible.

## Deployment & Run

```bash
cd apps/admin && nvm use 22 && npm run dev   # port 3100
```

Env vars (see `apps/admin/.env.local.example`):

- `NEXT_PUBLIC_API_URL` — Flask backend (local default `http://127.0.0.1:5001`)
- `AUTH_URL` — `http://localhost:3100` locally
- `AUTH_SECRET` — random string ≥ 32 chars in production

The admin app is part of the npm workspace, so `npx turbo dev`,
`npx turbo typecheck`, and `npm run build:check -w apps/admin` work from the
repo root. Only users whose Supabase `app_metadata.is_admin` is `true` can
log in, and every Flask admin endpoint independently re-verifies that claim.

## Open Questions

- Should the legacy `/admin/update_or_add_subscription` and
  `/admin/check_user_subscription` endpoints be gated with `require_admin()`
  now, or after Classic is archived? (Tracked in ADR-0032.)
- Which admin surfaces should come next: content moderation (videos/shows),
  dictionary health, payment logs, or user account actions (delete/reset)?
