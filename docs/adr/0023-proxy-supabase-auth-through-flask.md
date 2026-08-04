# ADR-0023: Proxy Supabase Auth (GoTrue) Through Flask

**Date**: 2026-08-03
**Status**: accepted
**See also**: [SPEC-034 (Full Database Migration)](../specs/034-full-database-migration-supabase.md), [SPEC-024 (Consolidate Directus Calls)](../specs/024-consolidate-directus-calls.md), [ADR-0021 (Video Content to Supabase)](0021-migrate-video-content-to-supabase.md), [ADR-0004 (Directus User Data Token Strategy)](0004-directus-user-data-token-strategy.md), [ARCH-014 (Saved Words Data Flow)](../arch/014-saved-words-data-flow.md)

## Context

Directus is being sunset 30 days after the full migration is transferred and
thoroughly tested (SPEC-034: T-complete + 30 days), which means auth must leave
Directus before that decommission. Today:

- **Web** (NextAuth) and **mobile** (AuthContext) already log in through Flask's
  `/auth/login`, which proxies Directus and returns `{ token, user }` with a
  Directus JWT.
- **Classic** authenticates directly against Directus via nuxt-auth's `local`
  strategy (`nuxt.config.js` → `auth/authenticate`, `auth/refresh`).
- Flask currently **base64-decodes the Directus JWT without verifying its
  signature** (`routes/user_data.py`, `routes/auth.py`, `routes/user_notes.py`).
  This is safe only because Directus validates the token on the downstream call;
  it must not survive a migration where Flask issues or accepts tokens it owns.
- The monorepo rule (and SPEC-024) is that clients never construct vendor URLs —
  Flask is the single API gateway, and tests mock one target.

The auth migration must complete before the sunset window begins (the window is
a post-migration observation period, not deadline pressure), support all three
apps, and not orphan the user ids used by `user_saved_words` and the other
migrating user-data tables.

## Decision

**Use Supabase Auth (GoTrue) as the identity store, and proxy it through Flask.**
GoTrue handles credentials, refresh rotation, email flows, and password hashing;
Flask remains the only endpoint any client calls.

1. **Login/refresh/logout**: Flask forwards to GoTrue REST
   (`/auth/v1/token` password and refresh grants) and returns the Supabase JWT
   pair to the client in the existing `{ token, user }` shape. NextAuth,
   AuthContext, and Classic's nuxt-auth keep their current response contract.
2. **Account lifecycle**: register, password request/reset, verify-email, and
   delete-account continue through Flask and proxy to GoTrue (or call the
   admin API with the service-role key where GoTrue requires it).
3. **JWT verification**: Flask verifies the Supabase JWT signature and `exp` on
   every authenticated request (PyJWT, HS256, `SUPABASE_JWT_SECRET`). The
   decode-without-verify shortcut is removed everywhere.
4. **No client SDKs**: clients do not import `supabase-js`, construct GoTrue
   URLs, or touch PostgREST during the transition. The only planned exception is
   a future OAuth social-login flow, which may redirect the browser to GoTrue's
   hosted authorize endpoint (PKCE) while password flows and all data stay
   proxied.
5. **Data access**: Flask continues to access Supabase via the service-role key
   (psycopg2/Postgres), not via PostgREST + RLS. RLS may be added later as
   defense-in-depth, but it is not part of this decision.
6. **User identity**: `auth.users.id` (the JWT `sub` claim) becomes the canonical
   user id. A `directus_user_id` mapping is kept through the transition so
   `user_saved_words.user_id` and other migrated user data remap without
   orphaned rows.
7. **Legacy hashes**: Directus users are imported into `auth.users` with their
   existing bcrypt hashes where GoTrue can verify them (`$2y$` compatibility is
   tested first); users with incompatible hashes get a forced password reset.

## Consequences

### Gained

- The single-gateway architecture survives: no vendor URLs or SDKs in clients,
   one mock target for tests (SPEC-024's success criterion), and central rate
   limiting/logging in Flask.
- Minimal client diffs: web/mobile already call Flask; Classic retargets its
   nuxt-auth endpoints from Directus to Flask. The saved-words plan in SPEC-034
   is unchanged.
- Managed auth: GoTrue owns password hashing, refresh rotation, email flows,
   and (later) OAuth/MFA without bespoke security code in our stack.
- Provider-swap flexibility: because the client contract stays Flask-shaped,
   moving off GoTrue later (Keycloak, Auth0, self-hosted GoTrue) is mostly a
   Flask-internal change.

### Accepted

- Flask gains real security surface: JWT signature verification, refresh
   forwarding, and token-expiry handling must be implemented correctly (new
   PyJWT dependency and tests; the current decode-without-verify pattern is
   removed).
- Refresh tokens remain client-managed (NextAuth cookie / SecureStore), not in
   a Flask session store; revocation behavior follows GoTrue.
- An extra network hop (client → Flask → GoTrue) on auth calls — milliseconds,
   and auth calls are rare relative to data calls.
- OAuth social login is less native through a proxy and will need the carve-out
   (or a follow-up ADR) when it lands.

## Alternatives considered

1. **Full-on GoTrue (SDK + PostgREST/RLS)**: clients own sessions via
   `supabase-js` and user data moves to PostgREST with RLS. Rejected: it
   recreates the multi-vendor-client problem SPEC-024 exists to prevent,
   requires three SDK migrations inside the 30-day window, adds RLS policy
   maintenance, and would rewrite SPEC-034's Flask row-CRUD design.
2. **Flask-issued tokens (custom auth)**: a plain `users` table + self-minted
   JWTs. Rejected for now: we would own password hashing, refresh rotation,
   revocation, and email flows — significant security code for a 30-day
   migration — and lose the OAuth/MFA path. Revisit only if the product decides
   to leave Supabase entirely.
3. **Keep Directus auth**: rejected — Directus is sunset at T-complete + 30 days.

## References

- SPEC-034 Phase 5, sub-phases 5.1 (auth investigation) and 5.7 (auth cutover),
  and the sunset readiness checklist
- SPEC-024 (all vendor calls through Flask; single mock target)
- Supabase Auth (GoTrue) REST API — `/auth/v1/token`, admin user APIs
- Directus 8 `directus_users` schema (bcrypt hashes for import)
