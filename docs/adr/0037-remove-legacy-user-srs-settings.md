# ADR-0037 — Remove legacy `user_srs_settings` table and `/srs/settings` API

**Status:** Accepted (2026-08-13)

## Context

The daily review limit (`dailyNewLimit`) has been stored in two places:

1. `public.user_srs_settings.daily_new_limit` — the legacy SRS settings row,
   exposed through `GET /srs` → `settings.dailyNewLimit` and
   `PUT /srs/settings`.
2. `settings_v2.review.dailyNewLimit` — the current settings blob synced
   through `GET/PUT /user-settings` and the SPEC-053 sync engine.

SPEC-066 Phase 6 moved web and mobile to `settings_v2` and deprecated the
legacy row, but kept it "for old installed clients". That compatibility no
longer has any users:

- The archived GO app (`apps/mobile-go-legacy/`) and Classic do not call
  `PUT /srs/settings` or consume the legacy `GET /srs` settings field.
- Web/mobile SRS hooks still merged `res.settings` into `store.settings`, but
  no feature reads that field — the review pages and settings pages use
  `SettingsContext` (`settings_v2`) exclusively.
- The production table has only 2 rows, no foreign keys, and no indexes beyond
  the primary key.

Keeping the dead path is actively harmful: the two stores disagree (the
legacy row still said 20 for a user whose `settings_v2` said 30), and anyone
debugging "the daily review limit" has to know which one is real.

## Decision

**Remove the legacy SRS settings path entirely**:

1. Drop `public.user_srs_settings`.
2. Remove `PUT /srs/settings` and the `settings` field from `GET /srs` —
   `GET /srs` now returns cards only.
3. Remove the `srs_settings` sync entity, its handler, and its payload schema.
4. Remove `dailyNewLimit` from the admin user-detail response.
5. Remove `settings` from `SrsProgressStore`, `createSrsStore`,
   `migrateSrsStore`, and SRS hydration in both apps.

The web hook's one-time local migration that copies
`zthSrsProgress.settings.dailyNewLimit` into `settings_v2` is retained: it
reads a local storage blob, not the DB table, and it is how old local stores
get their value into the single source of truth.

## Consequences

- `settings_v2.review.dailyNewLimit` is the single source of truth for the
  daily review limit across web, mobile, and the backend.
- Any old client that still pushes `srs_settings` ops will now get an
  "unknown entity" rejection from `/sync/push`. This is acceptable because no
  installed client sends that entity.
- The production table drop is a small, irreversible DDL change:

  ```sql
  drop table if exists public.user_srs_settings;
  ```

  It has no foreign keys or dependent views, so it is safe to run during
  normal operation.

## References

- SPEC-066 — SRS review page (Phase 6: `settings_v2` migration and legacy row
  deprecation)
- ADR-0010 — Fresh React Native port (mobile no longer inherits the GO app's
  sync behavior)
- `zerotohero-python-server/routes/user_data_columns.py` — removed
  `PUT /srs/settings` and the `GET /srs` settings field
- `zerotohero-python-server/utils_user_data.py` — removed
  `upsert_srs_settings`; `get_srs_cards` returns cards only
