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
2. Auth is admin-only at the source: the NextAuth credentials provider calls
   Flask `POST /auth/login` and rejects any user without `isAdmin === true`;
   `src/proxy.ts` protects all routes; every Flask admin endpoint
   independently calls `require_admin()` on the Supabase JWT claim.
3. Add new gated Flask endpoints in `routes/admin_users.py` rather than
   reusing Classic's ungated subscription endpoints.
4. The app listens on port 3100 locally and is covered by Turbo typecheck
   and `build:check`.

## Consequences

- Admin code never ships inside the public web bundle.
- A non-admin can never complete login, and a demoted admin's stale session
  still gets 403s from every Flask admin endpoint.
- Some shared setup is duplicated (login page, auth tokens, UI primitives),
   but UI components are intentionally not shared across apps (ADR-0003).
- **Follow-up**: the legacy `/admin/update_or_add_subscription` and
  `/admin/check_user_subscription` endpoints in
  `zerotohero-python-server/routes/subscriptions.py` remain ungated for
  Classic compatibility. They should be gated with `require_admin()` or
  removed when Classic is archived (Phase 8).
