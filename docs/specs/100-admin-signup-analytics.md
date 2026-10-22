# SPEC-100: Admin Console — Analytics (New Signups & Revenue)

> **Amendment 2026-10-17:** the screen is now named **Analytics** and toggles
> between **New Signups** and **Revenue**. The original single-metric behavior
> is described below; see [Amendment 2026-10-17](#amendment-2026-10-17--analytics-metric-toggle).

> **Amendment 2026-10-22:** **Analytics is the console's home.** `/` now
> redirects to `/analytics` (was `/users`), and the Insights nav group
> (Analytics, Transactions) is the first group in the sidebar. The proxy's
> post-login and wrong-surface redirects land on `/analytics` for admins.

## Metadata

- **Spec ID**: SPEC-100
- **Feature**: Daily analytics chart in the admin console, with last 7 days /
  this month / this year / last 30 days / all time ranges, toggling between
  new signups and estimated revenue
- **Status**: complete (2026-10-17)
- **Created**: 2026-10-17
- **Updated**: 2026-10-22 — `/` and post-login land on `/analytics`; Insights
  is the first nav group
- **Implemented**: 2026-10-17.
  `zerotohero-python-server` — `e1ba33f` (signup endpoint + tests),
  `207c1df` (generic metric endpoint + revenue series).
  `apps/admin` — `dac11a34` (i18n), `d54c56d5` (screen + chart),
  `19a95c52` (chart narrow-screen fix), `bc13da8e` (metric-toggle i18n),
  `13c737d8` (screen + chart toggle).
- **ROADMAP Phase**: Phase 10: Admin Console
- **See also**:
  - [ADR-0032 — Admin Console as a Separate Next.js App](../adr/0032-admin-console-app.md)
  - [SPEC-060 — Admin Console: User Management](060-admin-console-user-management.md) — app, auth, token mirror, CORS, i18n conventions
  - [SPEC-099 — Admin Content Management](099-admin-content-management.md) — the Users / Content nav shell this extends
  - [SPEC-101 — Admin Transactions](101-admin-transactions.md) — the inclusion rules and price heuristic the Revenue metric reuses
  - [SPEC-039 — Full Database Migration](039-full-database-migration-supabase.md) § 5.1 / 5.7 — the Directus → Supabase auth import and cutover
  - [ARCH-003 — Python Backend Architecture](../arch/003-python-backend-architecture.md) — blueprint/route map

## Overview

The admin console could find and inspect individual users, but it had no
aggregate view of **how many accounts are being created**. This spec adds an
`/analytics` screen with a Teachable-style range picker and an area chart of
new signups per day.

The metric is deliberately scoped to the Supabase auth era. The 2026-08-04
Directus import copied 75,177 legacy accounts into `auth.users` and stamped
`created_at` with the **import time**, not the original signup date. Counting
`auth.users` naively would therefore show a single fake 75k-signup spike on
import day and hide every real trend. Imported accounts are identified by
`public.user_id_map` and excluded, so “all time” means *every genuinely
post-cutover signup*.

## User Stories

- As an admin, I want to see how many new accounts were created each day, so I
  can tell whether growth is up or down without writing SQL.
- As an admin, I want to switch between the last 7 days, this month, this
  year, last 30 days, and all time, so I can zoom out without losing context.
- As an admin, I want the chart to use my local day boundaries, so a signup
  late at night is counted on the day I experienced it.
- As an admin, I want to see the total, daily average, and best day for the
  selected range, so I can summarize the chart in one sentence.
- As an admin, I want to know that legacy imported accounts are excluded, so
  the numbers are not mistaken for a drop in growth.

## Metric Semantics

### Source

`auth.users`, restricted to rows with `deleted_at is null`. Unverified
accounts count: a GoTrue signup creates the row before email confirmation, and
the question this screen answers is “how many people signed up”, not “how many
confirmed their email”.

### Why imported accounts are excluded

`zerotohero-python-server/tmp/supabase-auth-import.py` inserts every legacy
Directus account with:

```python
now = datetime.now(timezone.utc)
# ...
user_rows.append((..., now, now))  # created_at, updated_at
```

It also inserts one `public.user_id_map` row per imported account. Post-cutover
GoTrue signups never get a `user_id_map` row. The endpoint therefore uses:

```sql
from auth.users u
where u.deleted_at is null
  and not exists (
    select 1 from public.user_id_map m where m.auth_user_id = u.id
  )
```

This is the only reliable “post-cutover” marker. A hardcoded cutoff date would
also work today, but would silently break if the import were ever re-run.

### Ranges (inclusive, in the caller's timezone)

| `range` | Window |
|---|---|
| `last_7_days` | today − 6 days → today |
| `this_month` | first day of the current month → today |
| `this_year` | 1 January of the current year → today |
| `last_30_days` | today − 29 days → today |
| `all_time` | first post-cutover signup day → today (today if there are none) |

“Today” is today in the requested IANA timezone, not UTC. Day buckets are
computed with `(created_at at time zone tz)::date`, so an 11:30pm signup in
Vancouver stays on that Vancouver day. The admin app sends
`Intl.DateTimeFormat().resolvedOptions().timeZone`; an unknown zone is rejected
with `400` rather than silently falling back to UTC.

Every day in the window is returned, including zero-signup days, so the chart
has a continuous x-axis. The response also includes `total`,
`averagePerDay` (one decimal), and `bestDay` (null when the total is zero).

## Backend API

`GET /admin/analytics/signups?range=<range>&tz=<IANA>`

| Query | Required | Default | Notes |
|---|---|---|---|
| `range` | no | `last_7_days` | One of the five keys above; anything else is `400`. |
| `tz` | no | `UTC` | IANA name (`America/Vancouver`); invalid is `400`. |

Response:

```json
{
  "range": "last_7_days",
  "timezone": "America/Vancouver",
  "start": "2026-10-11",
  "end": "2026-10-17",
  "days": [
    { "date": "2026-10-11", "count": 3 },
    { "date": "2026-10-12", "count": 0 }
  ],
  "total": 3,
  "averagePerDay": 0.4,
  "bestDay": { "date": "2026-10-11", "count": 3 },
  "excludesImportedUsers": true
}
```

Implementation: `zerotohero-python-server/routes/admin_analytics.py`, a new
`admin_analytics_bp` registered in `routes/__init__.py`. The blueprint uses a
`before_request` hook calling `require_admin()`, mirroring `admin_bp`: every
route added to it is admin-only by construction. CORS preflight (`OPTIONS`) is
exempt. The existing dynamic test in `test_app.py` that enumerates every
`/admin/*` URL therefore covers this route too.

No schema change and no new index are required: `public.user_id_map.auth_user_id`
is unique, so the anti-join can use it, and `auth.users` is only ~75k rows.

## Admin App

- Route `/analytics`, added to the new **Insights** nav group in
  `components/layout/nav-items.ts`. The existing Users and Content groups are
  unchanged.
- `app/analytics/page.tsx` — client page. Waits for `useAuthReady()` (the
  session token mirror), fetches on range change with an `AbortController`,
  and keeps the previous chart dimmed while the next range loads.
- `lib/analytics-api.ts` — typed `fetchSignupAnalytics(range, timezone)`
  through `authenticatedFetch`; `browserTimeZone()` supplies the IANA zone.
- `types/analytics.ts` — response types and the ordered range list.
- `components/analytics/signup-chart.tsx` — hand-rolled SVG area chart. No
  chart dependency was added; colors come from semantic tokens
  (`stroke-primary`, `fill-muted-foreground`, `stroke-border`), and the fill is
  a gradient of `hsl(var(--primary))`. The curve uses monotone cubic
  interpolation so a non-negative series can never dip below zero between
  points.
- Header: range picker. KPI cards: total signups, daily average, best day.
  Chart card: new signups per day with y-axis ticks and up to seven x-axis
  labels; pointer hover shows the exact date and count. Below the card:
  “imported Directus accounts are excluded” and the timezone used.
- States: loading spinner, inline error with Retry, empty range (zero line plus
  “No new signups in this range.”).

Logging uses `log()` / `logerr()` from `lib/logger.ts`, so every line carries
the `[LP Admin]` prefix and respects `NEXT_PUBLIC_LOG_LEVEL`.

## i18n

15 keys were added through `scripts/add-translation-key.mjs` and
`scripts/sync-translations.mjs csv-to-json`, in all 18 locales:

`title.insights`, `title.signup_analytics`, `msg.signup_analytics_hint`,
`label.new_signups`, `range.last_7_days`, `range.this_month`, `range.this_year`,
`range.last_30_days`, `range.all_time`, `label.total_signups`,
`label.daily_average`, `label.best_day`, `msg.no_signups_range`,
`msg.signups_exclude_imported`, `msg.signups_timezone`.

`msg.signups_timezone` uses the `{timezone}` placeholder. No existing range
keys existed, so all five were added.

## Verification

- `python3.10 -m pytest test_admin_analytics.py -q` — 10 passed.
- `python3.10 -m pytest test_app.py -q -k "admin_url or admin_endpoints"` —
  4 passed (the new route returns 401 without a token and 403 for a non-admin).
- `apps/admin`: `tsc --noEmit` clean, `eslint .` clean, and
  `npm run build:check -w apps/admin` compiled `/analytics` successfully.
- Not exercised against production data from this environment (that needs a
  running Flask server and an admin session). The queries were verified against
  fake connections; the shape and exclusion filter are covered by the tests.

## Limitations / Follow-ups

- Daily buckets only. The screenshot’s Daily / Weekly / Monthly toggle is not
  implemented; ranges already provide the zoom-out. If “all time” grows past a
  couple of years, add weekly/monthly aggregation rather than sending 1,000+
  points.
- Unverified signups are included by design. A “confirmed only” series would
  need `email_confirmed_at` and is a separate metric.
- No acquisition-source breakdown. `public.user_acquisition` (SPEC-042) could
  power a stacked chart later.
- No caching. The query is small and the screen is admin-only.
- Accounts with `deleted_at` set are excluded, matching the admin user search.
  Deleting an account therefore removes its historical signup from these
  counts. If signup history must be immutable, count deleted rows and flag them
  separately instead.

---

## Amendment 2026-10-17 — Analytics metric toggle

The screen was renamed **Analytics** (nav item and page title) and gained a
metric picker before the range picker:

- **New Signups** — the original cutover-aware daily signup series.
- **Revenue** — estimated USD revenue per day from the **same rows the
  Transactions screen lists** (SPEC-101).

### API

The generic route is:

```text
GET /admin/analytics?metric=signups|revenue&range=<range>&tz=<IANA>
```

`metric` defaults to `signups`; an unknown metric is `400`. The response uses a
common `{date, value, count}` day shape so the chart does not care which metric
it is rendering:

```json
{
  "metric": "revenue",
  "range": "last_7_days",
  "timezone": "America/Vancouver",
  "start": "2026-10-11",
  "end": "2026-10-17",
  "days": [
    { "date": "2026-10-11", "value": 30.0, "count": 3 }
  ],
  "total": 150.0,
  "averagePerDay": 21.43,
  "bestDay": { "date": "2026-10-13", "value": 50.0, "count": 5 }
}
```

`/admin/analytics/signups` remains as a compatibility alias returning the
original `{date, count}` shape.

### Revenue semantics

Revenue deliberately calls `routes.admin_transactions.query_transactions()`
rather than re-implementing the rules. That guarantees:

- non-trial subscription rows only,
- rows with a `payment_id` or payment processor only (backfilled legacy
  lifetime accounts excluded),
- prices from `data/prices.csv` plus historical lifetime sale windows in
  `data/sale_windows.csv`,
- monthly/annual rows contribute their latest payment, not every renewal.

**Range difference:** signup “all time” starts at the first post-cutover
Supabase account, while revenue “all time” starts at the first included
transaction row (2023-04 in the current data). Revenue also includes legacy
paid subscriptions; the backfilled no-payment accounts remain excluded.

### Chart / UI

`components/analytics/signup-chart.tsx` became `metric-chart.tsx`:

- y-axis and tooltip format as counts for New Signups and USD for Revenue;
- revenue axis uses compact money (`$380`, `$1.5k`), while the tooltip shows
  the exact two-decimal amount;
- both metrics share the same monotone SVG area chart, range picker,
  total/average/best-day cards, and timezone note;
- revenue has its own estimate note and empty state.

Eight i18n keys were added in all 18 locales: `title.analytics`, `label.metric`,
`label.range`, `label.revenue`, `label.total_revenue`, `msg.revenue_hint`,
`msg.revenue_note`, `msg.no_revenue_range`.

### Amendment verification

- `test_admin_analytics.py` — **17 passed** (10 original + 7 metric/revenue
  cases, including local-day grouping and all-time start).
- `test_admin_transactions.py` — **15 passed**.
- `test_app.py -k "admin_url or admin_endpoints"` — **4 passed**; the generic
  route is covered by the dynamic `/admin/*` gate test.
- Read-only production check: last 7 days returned **239 signups** and
  **US$150.00** estimated revenue; all-time revenue started **2023-04-07** with
  a total of **US$183,377.10**.
- `apps/admin`: `tsc --noEmit` clean, `eslint .` clean, and
  `npm run build:check -w apps/admin` compiled `/analytics`.
