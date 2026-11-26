# SPEC-101: Admin Console — Transactions

## Metadata

- **Spec ID**: SPEC-101
- **Feature**: Transactions screen in `apps/admin`, with estimated prices
  because Supabase stores subscription metadata but not charged amounts
- **Status**: complete (2026-10-17); amended 2026-11-26 to price rows from the
  `payment_events` ledger (coupon purchases were showing the list price)
- **Created**: 2026-10-17
- **Implemented**: 2026-10-17.
  `zerotohero-python-server` — `78195d0` (API + tests + sale-window data),
  `2e62d21` (timezone routing fix).
  `apps/admin` — `b2e21188` (i18n), `9d97d600` (screen + client),
  `8f0855ca` (export guard).
- **Amended**: 2026-11-26 — `zerotohero-python-server` `2b62142` prices rows
  from the `payment_events` ledger (`priceSource='ledger'`); `apps/admin`
  labels the exact amount (see § Admin App).
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

The screen therefore follows the requested fallback: **current price table**,
clearly labelled as an estimate. (SPEC-112 removed the historical sale discount
adjustment; see § Historical sale windows.)

### Amendment (2026-11-26): charged amounts come from the payment ledger

SPEC-102's `public.payment_events` ledger has since recorded the amount actually
collected at purchase completion — Stripe checkout/invoice, PayPal capture —
with the coupon discount already applied. [ADR-0054](../adr/0054-sale-window-on-coupon-row.md)
decision 6 requires new purchases to use it, so this screen now prices each row
from its **latest ledger payment** when the currency is USD, and only falls back
to the current price table for rows with no ledger payment. That is what makes a
coupon purchase show what was charged: a `BF50` lifetime row records
`amount_cents = 8450` and displays **$84.50**, not the $169 list price. See
§ Charged amount (ledger).

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

### Charged amount (ledger)

`public.payment_events` (SPEC-102) records, for every completed purchase,
`amount_cents` — the processor's charged total, tax included — plus `currency`,
`discount_cents` and `coupon_id`. The query joins the newest `kind = 'payment'`
event per subscription:

```sql
select distinct on (subscription_id)
       subscription_id, amount_cents, currency, discount_cents, coupon_id
from public.payment_events
where kind = 'payment' and subscription_id is not null
order by subscription_id, occurred_at desc, id desc
```

When that event's currency is `usd`, `price` is `amount_cents / 100` and
`priceSource` is `ledger`. A `cny` event is **not** converted — this screen and
the Revenue chart are USD-only — so those rows use the estimate below.

### Regular price (estimate fallback)

For rows with no USD ledger payment, `data/prices.csv` is the same catalogue
Stripe checkout uses. The API reads the
`status=current`, `type=regular`, `currency=usd` rows:

| Plan | USD |
|---|---|
| Monthly | 10 |
| Annual | 90 |
| Lifetime | 169 |

Fallback constants in the module mirror those values if the CSV cannot be read.
The CNY rows are not used because the estimate is USD-only; **the estimate is a
USD list price, not the amount charged**.

### Historical sale windows (sunset 2026-11-25)

`data/sale_windows.csv` used to adjust lifetime estimates for 15 windows
recovered from Classic's `SALE_START_DATE` / `SALE_END_DATE` / `SALE_DISCOUNT`
history. **SPEC-112 sunset it:** a sale is now a featured coupon
([SPEC-112](112-coupon-driven-sales.md), [ADR-0054](../adr/0054-sale-window-on-coupon-row.md)),
and the `payment_events` ledger records exact amounts for new purchases.

Prices are therefore estimated at the **regular** price for rows with no ledger
payment; pre-ledger purchases made during a historical sale read higher than
they were charged. `priceSource` is `ledger`, `regular` or `unknown` — the old
`sale` value is gone.
At the time the adjustment was removed, 548 of the 1,799 rows had fallen inside
a historical window.

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
    },
    {
      "id": 31917,
      "date": "2026-11-26T13:40:09+00:00",
      "purchaserName": "Mary Tester",
      "purchaserEmail": "mary@example.com",
      "product": "lifetime",
      "price": 84.5,
      "priceSource": "ledger",
      "currency": "USD",
      "paymentProcessor": "stripe",
      "paymentMethod": null,
      "paymentId": "cs_live_…",
      "status": "active"
    }
  ],
  "total": 1810,
  "limit": 25,
  "offset": 0,
  "summary": {
    "count": 1810,
    "totalSales": 228295.75,
    "averageSale": 126.13,
    "currency": "USD"
  },
  "pricing": {
    "currency": "USD",
    "estimated": true,
    "ledgerCount": 77,
    "regular": { "monthly": 10, "annual": 90, "lifetime": 169 }
  }
}
```

`price` is the ledger's exact USD charge when `priceSource = 'ledger'`, otherwise
the regular-price estimate. `pricing.ledgerCount` is how many of the filtered
rows used the ledger; `pricing.estimated` is true whenever at least one row is
still an estimate.

The full filtered set is fetched and priced in Python — one ledger join plus one
CSV catalogue — which keeps the list, the CSV export and the Analytics Revenue
chart on identical filters, ordering, and prices.

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
  USD price list, and monthly/annual rows show their latest payment rather than
  every renewal.

## Verification

- `python3.10 -m pytest test_admin_transactions.py -q` — 15 passed (including
  route-level tests that execute the real `query_transactions()` rather than
  monkeypatching it, which is what caught the `timezone`/`timezone_name`
  mismatch).
- `test_admin_analytics.py` + `test_admin_transactions.py` — 25 passed.
- `test_app.py -k "admin_url or admin_endpoints"` — 4 passed, confirming both
  new routes reject anonymous and non-admin callers.
- Read-only production check (2026-10-17): 1,799 transactions, 1,287 lifetime /
  451 monthly / 61 annual, estimated total **US$183,377.10**, average
  **US$101.93**, 548 sale-priced rows. No user emails were printed.
- Read-only production check (2026-11-26): 1,810 transactions; 77 priced from
  the ledger and the rest estimated; total sales **US$228,295.75** (down from
  US$229,044.00 before the ledger join — the coupon discount that had been
  missing). The five most recent `BF50` lifetime purchases show **$84.50** with
  `priceSource='ledger'`; a grandfathered monthly shows its actual **$6.00**
  instead of the $10 list price. The endpoint's `[admin_transactions] priced …`
  log line reports the ledger/estimate split on every request.
- `apps/admin`: `tsc --noEmit` clean, `eslint .` clean,
  `npm run build:check -w apps/admin` compiled `/transactions`.

## Limitations / Follow-ups

- **The subscription row still has no charged amount.** The exact amount comes
  from the `payment_events` ledger (SPEC-102), not `user_subscriptions`. Rows
  with no usable ledger payment — everything before the ledger started
  (2026-10-17), and non-USD charges — are estimated from the current price list.
  Ledger writes never block a grant, so a lost write silently degrades that row
  to an estimate.
- **One row per subscription, not per payment.** Monthly/annual rows are
  updated on renewal, so the table shows the latest payment only. Recurring
  revenue is therefore understated; a true ledger needs one row per invoice.
- **Refunds and chargebacks are not represented.** Purchases later downgraded
  to `type='trial'` disappear from the list. The screenshot's refunds and
  chargebacks metrics are intentionally omitted.
- **Historical sale prices are no longer modelled.** SPEC-112 deleted
  `data/sale_windows.csv`; pre-ledger rows are estimated at the regular price.
  Purchases recorded in the `payment_events` ledger use their exact amount.
- **Price increases are not modelled in the estimate.** Older $6/month and
  $59/year prices in `prices.csv` are `legacy`; rows without a ledger payment
  use the current regular prices for all years. Rows with one show the price
  that was actually charged (e.g. the grandfathered $6.00).
- **Manual/comped rows are included** when they carry a processor. An admin can
  see the processor under Product, but there is no separate "comp" flag.
- **CSV export is capped at 100,000 rows**; far above the current count.
