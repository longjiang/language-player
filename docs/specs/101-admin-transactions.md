# SPEC-101: Admin Console — Transactions

## Metadata

- **Spec ID**: SPEC-101
- **Feature**: Transactions screen in `apps/admin`, with estimated prices
  because Supabase stores subscription metadata but not charged amounts
- **Status**: complete (2026-10-17)
- **Created**: 2026-10-17
- **Implemented**: 2026-10-17.
  `zerotohero-python-server` — `78195d0` (API + tests + sale-window data).
  `apps/admin` — `b2e21188` (i18n), `9d97d600` (screen + client),
  `8f0855ca` (export guard).
- **ROADMAP Phase**: Phase 10: Admin Console
- **See also**:
  - [ADR-0032 — Admin Console as a Separate Next.js App](../adr/0032-admin-console-app.md)
  - [SPEC-060 — Admin Console: User Management](060-admin-console-user-management.md)
  - [SPEC-099 — Admin Content Management](099-admin-content-management.md) — the Users / Insights / Content nav shell
  - [SPEC-014 — Subscription & Payment System](014-subscription-payment-system.md)
  - [ARCH-015 — Payment Methods & Renewal Strategy](../arch/015-payment-methods-plan-support.md)
  - [ARCH-022 — Payment, Subscription & MailerLite](../arch/022-payment-subscription-mailerlite.md)
  - [ADR-0048 — Sale windows and sale amounts](../adr/0048-client-side-sale-window-gating.md)
  - [SPEC-039 — Full Database Migration](039-full-database-migration-supabase.md) — `user_subscriptions`

## Overview

The console could inspect one user's subscription and signups over time, but
there was no list of sales. This spec adds `/transactions`, modelled on the
Teachable Transactions screen: a summary row, filters, a paginated table, and
CSV export.

The requested column exclusions are respected: **offer type, coupon,
affiliate, and earnings are not shown**. The remaining columns are **Date,
Purchaser, Product, and Price**, plus payment-processor context under Product.

The critical finding: **Supabase has no financial amount data.**

`public.user_subscriptions` (31,929 rows on 2026-10-17) contains:

```
id, status, user_id, created_on, expires_on, type,
payment_processor, payment_method, payment_email, payment_id,
payment_date, notes, payment_customer_id
```

There is no `amount`, `currency`, `coupon`, `affiliate`, `refund`, or
`chargeback` column, and there are no `payments`, `orders`, or `transactions`
tables. Most rows are free trials (29,503) or backfilled legacy lifetime
accounts with no payment metadata.

The screen therefore follows the requested fallback: **current price table +
historical sale discounts**, clearly labelled as an estimate.

## What Counts as a Transaction

A row must satisfy all of:

1. `type in ('monthly', 'annual', 'lifetime')` — trials are not sales.
2. `status != 'deleted'`.
3. It has a `payment_id` **or** a non-empty `payment_processor`.

Rule 3 is what excludes the ~620 legacy rows whose notes say *"The user already
had a lifetime Pro account before the implementation of the subscriptions
feature."* Those are account backfills, not sales.

`payment_processor = 'other'` is kept: those are manual/offline payments
(bitcoin, WeChat transfer, Interac, PayPal transfer), which are still
transactions. Four rows have a `payment_id` but no processor and are kept for
the same reason.

Refunded purchases that were downgraded to `type = 'trial'` are **not** shown,
because the row no longer describes a sale and there is no refund table to
reconstruct it.

At implementation time this produced **1,799 transactions**:
1,287 lifetime, 451 monthly, 61 annual. Stripe 1,201, PayPal 377, App Store
192, manual/other 25, unknown 4.

## Price Heuristic

### Regular price

`data/prices.csv` is the same catalogue Stripe checkout uses. The API reads the
`status=current`, `type=regular`, `currency=usd` rows:

| Plan | USD |
|---|---|
| Monthly | 10 |
| Annual | 90 |
| Lifetime | 169 |

Fallback constants in the module mirror those values if the CSV cannot be read.
The CNY rows are not used because the subscription record does not store which
currency was charged; **every displayed price is a USD estimate**.

### Historical sale windows

`data/sale_windows.csv` holds 15 windows recovered from Classic's
`SALE_START_DATE` / `SALE_END_DATE` / `SALE_DISCOUNT` history:

| Window | Dates | Multiplier |
|---|---|---|
| Dragon Boat Festival | 2024-06-10 → 2024-06-12 | 0.80 |
| Summer Vacation | 2024-07-15 → 2024-07-21 | 0.75 |
| Back to School | 2024-08-24 → 2024-08-31 | 0.55 |
| Mid-Autumn Festival | 2024-09-17 → 2024-09-20 | 0.65 |
| Chongyang Festival | 2024-10-11 → 2024-10-14 | 0.65 |
| Black Friday | 2024-11-24 → 2024-12-03 | 0.50 |
| New Year | 2025-01-01 → 2025-01-05 | 0.50 |
| Chinese New Year | 2025-01-25 → 2025-01-31 | 0.50 |
| Spring | 2025-04-15 → 2025-04-20 | 0.50 |
| Back to School | 2025-08-25 → 2025-08-31 | 0.50 |
| Mid-Autumn Festival | 2025-10-01 → 2025-10-07 | 0.50 |
| Singles Day | 2025-11-11 → 2025-11-14 | 0.50 |
| Black Friday | 2025-11-24 → 2025-12-01 | 0.50 |
| Chinese New Year | 2026-02-09 → 2026-02-20 | 0.50 |
| Mid-Autumn Festival | 2026-09-21 → 2026-09-27 | 0.50 |

Rules:

- Sale discount applies to **lifetime only**, matching Classic's sale UI.
- Calendar days are inclusive.
- The purchase date is taken from `coalesce(payment_date, created_on)` in
  **UTC**; a late-night local purchase may land in the adjacent UTC day.
- `priceSource` is `sale`, `regular`, or `unknown`.
- The amount is rounded to two decimals (`169 × 0.5 = 84.50`).

At implementation time 548 of the 1,799 transaction rows fell inside a
historical sale window.

## Backend API

### `GET /admin/transactions`

| Query | Default | Notes |
|---|---|---|
| `q` | empty | Case-insensitive substring over purchaser email/name, payment email, payment ID, or exact subscription id. |
| `plan` | all | `monthly` / `annual` / `lifetime`; anything else is 400. |
| `from`, `to` | unbounded | `YYYY-MM-DD`, inclusive, interpreted in `tz`. `from > to` is 400. |
| `tz` | `UTC` | IANA timezone for date filtering. |
| `sort` | `date_desc` | `date_desc`, `date_asc`, `price_desc`, `price_asc`. |
| `limit` | 25 | 1–100. |
| `offset` | 0 | |

Response:

```json
{
  "transactions": [
    {
      "id": 1459,
      "date": "2026-10-17T03:30:49+00:00",
      "purchaserName": "Mary Tester",
      "purchaserEmail": "mary@example.com",
      "product": "monthly",
      "price": 10.0,
      "priceSource": "regular",
      "currency": "USD",
      "paymentProcessor": "stripe",
      "paymentMethod": null,
      "paymentId": "cs_live_…",
      "status": "active"
    }
  ],
  "total": 1799,
  "limit": 25,
  "offset": 0,
  "summary": {
    "count": 1799,
    "totalSales": 183377.1,
    "averageSale": 101.93,
    "currency": "USD"
  },
  "pricing": {
    "currency": "USD",
    "estimated": true,
    "regular": { "monthly": 10, "annual": 90, "lifetime": 169 },
    "saleWindowCount": 15
  }
}
```

The full filtered set is fetched and priced in Python. At ~1.8k rows this is
cheaper than encoding two CSV catalogues into SQL, and it guarantees the list
and the CSV export use identical filters, ordering, and prices.

### `GET /admin/transactions/export`

Same filters, no pagination. Returns `text/csv` with:

`Date, Purchaser, Email, Product, Price (USD), Price source, Payment processor,
Payment method, Payment ID, Status`

Capped at 100,000 rows.

### Security

`routes/admin_transactions.py` is a new `admin_transactions_bp` with a
blueprint-level `before_request` hook calling `require_admin()`, matching
`admin_bp` / `admin_analytics_bp`. CORS `OPTIONS` is exempt. The dynamic
`/admin/*` gate test in `test_app.py` covers both routes.

## Admin App

- Route `/transactions`, added to the **Insights** group next to Signup
  Analytics.
- `app/transactions/page.tsx` — client page with summary metrics, plan/date/
  search filters, sortable Date and Price columns, pagination, sale badges, and
  Export CSV.
- `lib/transactions-api.ts` — typed list + CSV clients through
  `authenticatedFetch`.
- `types/transactions.ts` — response and filter types.
- `lib/timezone.ts` — `browserTimeZone()`, now shared with the analytics
  screen (previously local to `analytics-api.ts`).
- All user-facing strings use `useT()`; 16 keys were added in 18 locales.

The screen deliberately labels money as **estimated**:

- “Total sales (est.)” and “Price (est.)”.
- A note explains that only metadata is stored, prices come from the current
  USD price list and historical sale discounts, and monthly/annual rows show
  their latest payment rather than every renewal.
- A second note reports how many historical sale windows are in use.

## Verification

- `python3.10 -m pytest test_admin_transactions.py -q` — 13 passed.
- `test_admin_analytics.py` + `test_admin_transactions.py` — 23 passed.
- `test_app.py -k "admin_url or admin_endpoints"` — 4 passed, confirming both
  new routes reject anonymous and non-admin callers.
- Read-only production check (2026-10-17): 1,799 transactions, 1,287 lifetime /
  451 monthly / 61 annual, estimated total **US$183,377.10**, average
  **US$101.93**, 548 sale-priced rows. No user emails were printed.
- `apps/admin`: `tsc --noEmit` clean, `eslint .` clean,
  `npm run build:check -w apps/admin` compiled `/transactions`.

## Limitations / Follow-ups

- **No charged amount or currency is stored.** Every price is an estimate.
  The real fix is to persist `amount`, `currency`, and the provider's price id
  when a payment is granted, then replace this heuristic.
- **One row per subscription, not per payment.** Monthly/annual rows are
  updated on renewal, so the table shows the latest payment only. Recurring
  revenue is therefore understated; a true ledger needs one row per invoice.
- **Refunds and chargebacks are not represented.** Purchases later downgraded
  to `type='trial'` disappear from the list. The screenshot's refunds and
  chargebacks metrics are intentionally omitted.
- **Sale history starts in 2024.** 2023 sales (including the Black Friday sale
  mentioned in notes) are not in the recovered window list, so those lifetime
  purchases use the regular price. Add rows to `data/sale_windows.csv` when
  another historical window is confirmed.
- **Price increases are not modelled.** Older $6/month and $59/year prices in
  `prices.csv` are `legacy`; this screen uses the current regular prices for all
  years.
- **Manual/comped rows are included** when they carry a processor. An admin can
  see the processor under Product, but there is no separate "comp" flag.
- **CSV export is capped at 100,000 rows**; far above the current count.
