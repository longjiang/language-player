# ADR-0032: Admin Console as a Separate Next.js App

**Date**: 2026-08-09
**Status**: accepted
**See also**:
- [SPEC-060](../specs/060-admin-console-user-management.md) — feature spec
- [ADR-0023](0023-proxy-supabase-auth-through-flask.md) — Flask as the auth proxy
- [SPEC-039](../specs/039-full-database-migration-supabase.md) — Supabase migration, `is_admin` claim

## Context

The project needs an admin surface for operational tasks (starting with user
management and subscription fixes). The options:

1. **Embed admin pages inside `apps/web`** — reuses its auth, i18n, and design
   tokens, but ships admin UI and admin API code in the public bundle, needs
   route guards woven through the public app, and mixes an internal tool into
   the consumer product.
2. **A separate `apps/admin` Next.js app** — a clean boundary: admin-only
   login, its own proxy guard, no public-bundle leakage, and independent
   deployment/release cadence.
3. **Directus/other CMS admin UI** — Directus is treated as a black box
   behind the Flask API (AGENTS.md rule 5), so a Directus-side UI would
   bypass the abstraction and the new stack's patterns.

## Decision

1. Build `apps/admin` as a separate Next.js 16 app in the same workspace,
   mirroring `apps/web`'s stack (Tailwind semantic tokens, next-intl `useT()`,
   NextAuth v5, shadcn-style primitives).
2. Auth is gated at the source: the NextAuth credentials provider calls
   Flask `POST /auth/login` and rejects any user without `isAdmin === true`
   **or** `isAffiliate === true` (the affiliate portal was added by SPEC-102);
   `src/proxy.ts` guards all routes, with a separate `/affiliate/*` guard;
   every Flask admin endpoint independently calls `require_admin()` on the
   Supabase JWT claim.
3. Add new gated Flask endpoints in `routes/admin_users.py` rather than
   reusing Classic's subscription endpoints, which were ungated at the time
   (they were gated later — see the last Consequence).
4. The app listens on port 3100 locally and is covered by Turbo typecheck
   and `build:check`.

## Consequences

- Admin code never ships inside the public web bundle.
- A non-admin can never complete login, and a demoted admin's stale session
  still gets 403s from every Flask admin endpoint.
- Browser API calls depend on two things beyond the NextAuth session: a
  client-side token mirror (`SessionTokenMirror`) so raw fetches carry
  `Authorization`, and Flask's CORS allowlist containing the admin origin
  (`http://localhost:3100` locally; add the deployed origin). Both were
  missing initially and caused 401/CORS failures that looked identical.
- Some shared setup is duplicated (login page, auth tokens, UI primitives),
   but UI components are intentionally not shared across apps (ADR-0003).
- **Follow-up (closed 2026-08-20)**: the legacy
  `/admin/update_or_add_subscription` and `/admin/check_user_subscription`
  endpoints in `zerotohero-python-server/routes/subscriptions.py` were ungated
  when this ADR was written. Commit `73d6bd6` ("security: route backend
  database access through RLS role") added `require_admin()` to both, so they
  now return 401 without a token and 403 for a non-admin; Classic is
  unaffected because it calls them through the authenticated `$axios`
  instance. They sit on `subscriptions_bp`, so the blueprint-level guard in
  `routes/admin.py` does **not** cover them — they are gated per route, and
  `test_app.py::test_subscription_admin_endpoints_reject_non_admins` pins
  that.
