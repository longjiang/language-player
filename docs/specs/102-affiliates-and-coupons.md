# SPEC-102: Affiliates and Coupon Codes

> **Status: draft — decisions required.** This document is a proposal only; no
> schema, API, or UI has been implemented. Several items below conflict with
> current architecture and are called out explicitly in
> [Conflicts and required amendments](#conflicts-and-required-amendments).

## Metadata

- **Spec ID**: SPEC-102
- **Feature**: Affiliate program (referral attribution, commissions, monthly
  statements, PayPal payouts) and coupon codes (percentage/amount, limited
  uses, expiry)
- **Status**: draft — decisions required (2026-10-17)
- **Created**: 2026-10-17
- **ROADMAP Phase**: Phase 10: Admin Console + cross-cutting payment work
- **See also**:
  - [ADR-0032 — Admin Console as a Separate Next.js App](../adr/0032-admin-console-app.md)
  - [SPEC-060 — Admin Console: User Management](060-admin-console-user-management.md)
  - [SPEC-014 — Subscription & Payment System](014-subscription-payment-system.md)
  - [SPEC-097 — Payment Endpoint User Binding](097-payment-user-binding.md)
  - [SPEC-101 — Admin Transactions](101-admin-transactions.md) — the current
    subscription/price model this spec must replace with a payment ledger
  - [SPEC-039 — Full Database Migration](039-full-database-migration-supabase.md)
  - [ARCH-015 — Payment Methods & Renewal Strategy](../arch/015-payment-methods-plan-support.md)
  - [ARCH-022 — Payment, Subscription & MailerLite](../arch/022-payment-subscription-mailerlite.md)
  - [ADR-0048 — Sale windows and sale amounts](../adr/0048-client-side-sale-window-gating.md)
  - `packages/shared/src/sale.ts`, `zerotohero-python-server/data/prices.csv`
  - `apps/web/src/app/[l1]/[l2]/go-pro/page.tsx`,
    `apps/web/src/proxy.ts`
  - `apps/admin/src/auth.ts`, `apps/admin/src/proxy.ts`
  - `zerotohero-python-server/routes/auth.py`, `routes/payments.py`,
    `app_stripe_checkout.py`, `app_paypal_checkout.py`,
    `utils_subscription.py`

## Summary

Add a Teachable-style affiliate program and an independent coupon-code system
to Language Player.

- **Affiliates** are ordinary `auth.users` accounts with an additional
  affiliate profile (code, commission rate, PayPal email, onboarding state).
  An admin promotes an existing user from the user-management screen.
- Affiliate links carry a code; clicking one sets a signed, first-party
  attribution cookie. Purchases within the attribution window credit the
  affiliate. Attribution is **last-touch** (matching the FAQ text supplied by
  the product owner), not first-touch.
- Affiliates earn a percentage of each successful payment, including
  subscription renewals, on **USD web purchases** in v1. Refunds reverse the
  commission. Amounts are recorded in a new payment ledger.
- Affiliates sign in to the same Next.js console and get a separate affiliate
  area: welcome, payout setup, dashboard, links, FAQ, their own transactions,
  and monthly statements. Their transaction endpoint is server-filtered to
  their own affiliate id; they can never see another affiliate's or the
  school-wide transaction list.
- Payouts are **PayPal only** and are processed manually by an admin against a
  monthly statement. Statements are `pending` until the admin marks them
  `paid` with a PayPal reference.
- **Coupons** are independent of affiliates. They have a code, internal name,
  percentage or amount discount, a maximum number of uses, and an expiry
  date/time. **Proposed v1 scope: lifetime Pro purchases in USD only**, using
  Stripe Checkout or PayPal. Coupons do not apply to Apple IAP, Google Play
  Billing, or the CNY Stripe Payment Links, because those paths cannot accept a
  server-computed discount.

### Out of scope (v1)

Affiliate application forms, product-specific commission restrictions,
promotional-material uploads, automated PayPal Payouts, tax-form collection,
mobile deferred deep links, subscription (monthly/annual) coupons, CNY/IAP
commissions, and Classic/Nuxt integration. Some are listed in the later phases
and open questions; none should block the v1 build.

## What Teachable Actually Does (research notes)

These notes are the reference behavior, not a promise to copy every detail.
Sources are linked at the end of this section.

### Affiliates

- Admins create affiliates manually or promote an existing student. Commission
  is a percentage (1–100%) and can be changed later; **changes apply only to
  future transactions**.
- Affiliate links append a unique affiliate code. A cookie is set when someone
  arrives through the link. The attribution window is configurable (1–365 days;
  Teachable examples use 30–60 days).
- Teachable's current affiliate docs say the **first** affiliate link clicked
  is credited by default, while the supplied product FAQ (and older Teachable
  docs) say **last touch**. This spec follows the product owner's FAQ:
  **last touch**.
- Commission is calculated on transaction amount **after tax**, and recurring
  subscriptions pay commission on **each recurring payment**, not just the
  first. Refunds reverse the commission.
- Affiliates can be restricted to specific products. That is **not** in v1
  here because Language Player sells one Pro product family.
- Affiliates have their own dashboard: Dashboard, Sales/Transactions, Links &
  Resources, Resources (promotional materials), Statements, Settings.
  Statements are monthly; the supplied screenshots show `Pending` / `Paid`
  status and a one-month payout delay.
- Verified Teachable behavior says payouts are currently **manual** for
  school owners; automated payouts are "coming soon". This spec uses manual
  PayPal payouts.

### Coupons

- A coupon has a code, an internal name, a discount (percentage or amount), an
  expiry date/time, and a number available. The number decrements with each
  use.
- A coupon is used **once per purchase**; multiple coupons cannot be stacked.
- Coupon codes are letters and numbers only (no special characters), and the
  code is case-insensitive in practice.
- Teachable distinguishes school-wide coupons (percentage only) from
  product/pricing-plan coupons (percentage or amount). It can apply a
  percentage coupon to **all payments** or **first payment only** for a
  subscription; an amount coupon applies to the first payment only.
- Editing a code or discount is not supported: the admin archives the coupon
  and creates a new one.
- The "Display coupon expiration or availability on sales pages and at
  checkout" option is **not needed** in this spec.
- Affiliates and coupons are independent, but a URL can carry both
  `affcode=...` and `coupon_code=...`; the affiliate commission is calculated
  on the discounted amount.

### Research sources

- [Add and Manage Students and Affiliates](https://support.teachable.com/en/articles/11682527-add-and-manage-students-and-affiliates-in-your-school)
- [School Affiliates Overview](https://support.teachable.com/en/articles/11682544-school-affiliates-overview)
- [Affiliate Links and Resources](https://support.teachable.com/en/articles/11682546-affiliate-links-and-resources)
- [Manage affiliate and author earnings](https://support.teachable.com/en/articles/15628287-manage-affiliate-and-author-earnings)
- [Coupons](https://support.teachable.com/en/articles/11682479-coupons) (the
  article currently returns a login wall to unauthenticated fetchers)
- [Schoolwide coupons changelog](https://changelog.teachable.com/now-available-schoolwide-coupons-17242)
- [Earnings statements changelog](https://changelog.teachable.com/earnings-statements-71564)

## Current Architecture (as built)

Relevant facts before designing this:

1. **`apps/admin` is admin-only at the source.** `auth.ts` rejects any login
   whose `isAdmin` claim is false; `proxy.ts` protects every route; every Flask
   admin endpoint calls `require_admin()`. There is no affiliate role.
2. **`public.user_subscriptions` has no amount or currency.** It stores one row
   per user with plan metadata and the latest payment reference/date. The
   Transactions screen estimates prices from `data/prices.csv` and historical
   sale windows (SPEC-101); it is not a payment ledger.
3. **There is no refund or chargeback table.** Stripe `charge.refunded` and
   PayPal refunds are not recorded.
4. **Checkout is processor-specific.** Web sends a Stripe `price_id` to
   `/create-stripe-checkout-session`; PayPal accepts only
   `PAYPAL_LIFETIME_AMOUNTS` (`169.00`, `84.50`); CNY uses prebuilt Stripe
   Payment Links; Apple IAP/Play Billing charge console-defined prices and
   cannot accept our coupon.
5. **No coupon model exists.** Sale pricing is in `data/prices.csv` and
   `packages/shared/src/sale.ts`.
6. **`apps/web` has a Next.js proxy** that can set cookies, and GoTrue login is
   proxied through Flask. The Flask API is a different origin, so the checkout
   client must forward the affiliate token in the request body.
7. **`zerotohero-nuxt/` is reference-only** under `AGENTS.md`. It is live, but
   editing it requires an explicit exception (as was done for SPEC-039).

## Conflicts and Required Amendments

These are the points that must be agreed before implementation.

### 1. Affiliate login conflicts with ADR-0032 / SPEC-060

ADR-0032 says the admin app is admin-only at login and every route is guarded.
The request is for affiliates to log in through `apps/admin` and get their own
dashboard. That is a direct contradiction unless the app becomes a
**two-surface console**.

**Recommended:** keep one Next.js app but make it role-aware:

- `/login` accepts admins and active affiliates.
- Admin routes (`/users`, `/analytics`, `/transactions`, `/content/*`) require
  `isAdmin`.
- Affiliate routes (`/affiliate/*`) require `isAffiliate` and an active
  `affiliates` row.
- Flask admin endpoints remain `require_admin()`; new affiliate endpoints use
  a separate `require_affiliate()` that re-checks the database.
- ADR-0032 must be amended; SPEC-060's "admin-only at the source" statement
  becomes "admin-only routes, plus a distinct affiliate surface".

**Alternative:** a separate `apps/affiliate` app. Safer boundary and smaller
public bundle, but duplicates auth/UI scaffolding and deployment. This is an
open decision.

### 2. Classic integration conflicts with AGENTS.md

The request says the work may touch Classic/Nuxt. `AGENTS.md` says
`zerotohero-nuxt/` is reference-only. **This spec treats Classic as out of
scope** until the product owner explicitly lifts that rule for this feature.
Without Classic support, affiliate/coupon traffic on Classic checkout is not
attributed/discounted. The web app remains the supported purchase surface.

### 3. Affiliate commissions require a real payment ledger; SPEC-101 has only estimates

SPEC-101 explicitly says `user_subscriptions` has no charged amount and its
Transactions screen is an estimate. Affiliate commissions and statements
cannot be based on an estimate. **Prerequisite:** add `payment_events` and
record real amounts from each successful payment before any commission is
created. Historical subscription rows get **no retroactive commissions**.

This also improves SPEC-101: the Transactions screen should prefer ledger
amounts for events recorded after launch and keep the heuristic only for
historical rows.

### 4. Processor limitations

| Path | Can apply coupon? | Can record exact amount? | Affiliate commission v1? |
|---|---|---|---|
| Stripe Checkout USD (card) | Yes | Yes (webhook) | Yes |
| PayPal lifetime USD | Yes, server-computed | Yes (capture) | Yes |
| Stripe Payment Link CNY (WeChat/Alipay) | No (prebuilt link) | Yes, via webhook, but currency CNY | **No** |
| Apple IAP | No | Hard to normalize | **No** |
| Google Play Billing | No | Not implemented | **No** |
| Admin/manual grant | No | No actual charge | **No** |

This is why v1 is scoped to USD web purchases. The affiliate FAQ and coupon
UI must say so explicitly.

### 5. Teachable documentation itself disagrees on attribution

Current Teachable docs say first-touch by default; the supplied FAQ and older
docs say last-touch. This spec chooses **last-touch**, because that is the
behavior the product owner described and the FAQ we must reproduce.

## Proposed Decisions (approval required)

| Topic | Proposed decision | Why |
|---|---|---|
| Portal location | Two-surface `apps/admin` (admin + `/affiliate`) | Matches request; reuses auth/design; requires ADR-0032 amendment |
| Attribution model | Last-touch, signed first-party cookie | Matches supplied FAQ |
| Attribution window | 60 days default, admin-configurable 1–365 | Matches screenshot/cookie norms |
| Commission base | Net product revenue after tax and after coupon | Teachable behavior |
| Commission timing | Every successful payment (initial + renewals) | Teachable behavior |
| Currency | USD only in v1 | PayPal payout and pricing are USD-centric; CNY/IAP need conversion/limitations |
| Refunds | Reverse commission; negative adjustment if already paid | Avoid paying on refunded sales |
| Payouts | Manual PayPal on monthly statements | Teachable currently manual; no Payouts API dependency |
| Coupon scope | Lifetime Pro, USD only | Avoids recurring-discount and IAP/CNY gaps |
| Coupon stacking | One coupon; no stacking with sale or another coupon | Predictable, matches Teachable |
| Coupon editing | Code/discount immutable; archive and recreate | Matches Teachable; preserves redemption audit |
| Affiliate portal language | English in v1 (same as admin app) | Existing admin app is English-only; localize later |
| Classic | Out of scope until reference-only rule is lifted | AGENTS.md conflict |

## Data Model

All tables live in `public` (Supabase). Use integer cents for money, never
floats. Add `created_at`/`updated_at` defaults and indexes as noted.

Create in dependency order: `affiliates` → `affiliate_settings` →
`user_affiliate_attributions` → `coupons` → `affiliate_statements` →
`payment_events` → `affiliate_commissions` → `coupon_redemptions` → alter
`user_subscriptions`. The DDL below is grouped by purpose, not execution order.

### `affiliates`

```sql
create table public.affiliates (
  id bigint generated by default as identity primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null,
  commission_bps integer not null default 1500 check (commission_bps between 0 and 10000),
  active boolean not null default true,
  paypal_email text,
  onboarded_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index affiliates_code_lower_key on public.affiliates (lower(code));
```

- `commission_bps`: 1500 = 15.00%. UI edits percentage, API stores bps.
- `code`: 8–40 chars, uppercase letters/digits, no ambiguous `0/O/1/I`;
  immutable once created. Generated from the user's name + random suffix if
  the admin does not supply one.
- `active=false` stops future attribution and future renewal commissions;
  historical commissions/statements remain payable.
- `paypal_email` is required before a statement can be marked paid.

### `affiliate_settings`

```sql
create table public.affiliate_settings (
  id smallint primary key default 1 check (id = 1),
  link_attribution_days integer not null default 60 check (link_attribution_days between 1 and 365),
  default_commission_bps integer not null default 1500 check (default_commission_bps between 0 and 10000),
  updated_at timestamptz not null default now()
);
```

### `user_affiliate_attributions`

Persists the last-touch attribution for a logged-in user, so a cleared cookie
does not lose a still-valid referral.

```sql
create table public.user_affiliate_attributions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  affiliate_id bigint not null references public.affiliates(id) on delete cascade,
  attributed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  source text not null default 'cookie' check (source in ('cookie','signup','manual')),
  updated_at timestamptz not null default now()
);
```

### `payment_events`

The ledger that affiliate commissions and (later) exact transaction amounts
are built from.

```sql
create table public.payment_events (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id bigint references public.user_subscriptions(id) on delete set null,
  processor text not null check (processor in ('stripe','paypal','app-store','play','manual')),
  processor_event_id text not null,
  kind text not null check (kind in ('payment','refund','chargeback','adjustment')),
  amount_cents integer not null,             -- amount actually collected
  tax_cents integer not null default 0,
  discount_cents integer not null default 0, -- coupon portion
  commission_base_cents integer not null,    -- amount - tax (after discount)
  currency text not null default 'usd',
  coupon_id bigint references public.coupons(id),
  affiliate_id bigint references public.affiliates(id),
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (processor, processor_event_id, kind)
);
```

- `processor_event_id`: Stripe session/invoice/charge id, PayPal capture id, or
  a generated id for a manual adjustment.
- Refund rows use `kind='refund'` and a `metadata.original_payment_event_id`;
  they are never counted as sales.
- `commission_base_cents` is the source of truth for commission math; it is
  after coupon and excludes tax.

### `affiliate_commissions`

```sql
create table public.affiliate_commissions (
  id bigint generated by default as identity primary key,
  payment_event_id bigint not null unique references public.payment_events(id) on delete cascade,
  affiliate_id bigint not null references public.affiliates(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id bigint references public.user_subscriptions(id) on delete set null,
  rate_bps integer not null,
  base_cents integer not null,
  commission_cents integer not null,
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending','paid','reversed')),
  statement_id bigint references public.affiliate_statements(id),
  reversal_of_commission_id bigint references public.affiliate_commissions(id),
  created_at timestamptz not null default now()
);
```

- One commission per payment event. `rate_bps` is a snapshot of the affiliate
  rate at that payment; a later rate change does not alter old rows.
- Refund/chargeback: mark the original commission `reversed` and insert a
  negative `commission_cents` adjustment for the next statement. If the
  original statement is still `pending`, simply reduce it; if it is already
  `paid`, the negative row goes into the next statement.
- Rounding: `round(base_cents * rate_bps / 10000)` to the nearest cent.

### `affiliate_statements`

```sql
create table public.affiliate_statements (
  id bigint generated by default as identity primary key,
  affiliate_id bigint not null references public.affiliates(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  statement_number text not null unique,
  status text not null default 'pending' check (status in ('pending','paid','void')),
  currency text not null default 'usd',
  total_commission_cents integer not null,
  paypal_email text,
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  payment_reference text,
  notes text,
  created_at timestamptz not null default now(),
  unique (affiliate_id, period_start, period_end)
);
```

- One statement per affiliate per month (USD only in v1).
- `statement_number` format `AFF-YYYY-MM-<zero-padded id>`; generated at
  creation.
- `paypal_email` is snapshotted when the statement is marked paid.
- Statement total = sum of pending commissions for the period; `void` is for
  admin mistakes only.

### `coupons`

```sql
create table public.coupons (
  id bigint generated by default as identity primary key,
  code text not null,
  internal_name text not null,
  discount_type text not null check (discount_type in ('percent','amount')),
  percent_off numeric(5,2),
  amount_off_cents integer,
  currency text not null default 'usd',
  applies_to text not null default 'lifetime' check (applies_to in ('lifetime','monthly','annual','all')),
  duration text not null default 'once' check (duration in ('once','forever')),
  max_redemptions integer not null default 10000 check (max_redemptions between 1 and 10000),
  expires_at timestamptz,
  active boolean not null default true,
  stripe_coupon_id_live text,
  stripe_coupon_id_test text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index coupons_code_lower_key on public.coupons (lower(code));
```

v1 constraints enforced by the API:

- `applies_to = 'lifetime'`, `duration = 'once'`, `currency = 'usd'`.
- code: 1–40 chars, letters/digits only, case-insensitive uniqueness.
- `internal_name`: required, 1–120 chars.
- percent: `0 < percent_off <= 100`; amount: `0 < amount_off_cents <= lifetime
  price` (checked at validation/redemption, since prices can change).
- `max_redemptions`: 1–10,000 (Teachable's maximum).
- `expires_at`: UTC in the database; admin enters local time in
  `America/Vancouver` by default and the UI sends `tz`.
- code/discount fields are immutable after creation; internal name, expiry and
  max redemptions are editable. Archive instead of deleting.

### `coupon_redemptions`

```sql
create table public.coupon_redemptions (
  id bigint generated by default as identity primary key,
  coupon_id bigint not null references public.coupons(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'reserved' check (status in ('reserved','confirmed','released')),
  reserved_until timestamptz,
  payment_event_id bigint references public.payment_events(id) on delete set null,
  discount_cents integer not null default 0,
  currency text not null default 'usd',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (coupon_id, user_id)
);
create index coupon_redemptions_active_idx on public.coupon_redemptions (coupon_id, status);
```

- A user may redeem a given coupon at most once, even if it is multi-use.
- Checkout creates a `reserved` row (30-minute hold). Payment success flips it
  to `confirmed`; expiry/cancellation flips it to `released`.
- Available uses = `max_redemptions − confirmed − active reservations`, checked
  under a row lock on `coupons` (or an advisory lock keyed by coupon id).
- A background sweep (script or admin endpoint) releases expired reservations.

### Alter `user_subscriptions`

```sql
alter table public.user_subscriptions
  add column if not exists affiliate_id bigint references public.affiliates(id),
  add column if not exists affiliate_attributed_at timestamptz;
```

Because the current model is one row per user, setting these on the row is
enough for renewal commissions. If the product later supports multiple
concurrent subscriptions per user, move the attribution to a
`subscription_affiliates` table.

## Attribution Design

### Link format and cookie

- Primary link: `https://languageplayer.io/?affcode=CODE`
- Signup link: `https://languageplayer.io/register?affcode=CODE`
- Any internal page may carry `?affcode=CODE`; external URLs are rejected by
  the link generator in v1.
- `apps/web/src/proxy.ts` reads `affcode` on GET/HEAD, validates shape
  (`^[A-Z0-9]{8,40}$`), and sets:

  ```text
  name:     lp_aff
  value:    v1.<CODE>.<issued_at_unix>.<hmac_sha256>
  maxAge:   365 days (storage cap; the server enforces the configured
            1–365-day attribution window from issued_at)
  path:     /
  domain:   .languageplayer.io in production (share with Classic if approved);
            host-only locally
  sameSite: lax
  secure:   production only
  httpOnly: false   // the checkout client must forward the token to Flask
  ```

- The HMAC uses a dedicated `AFFILIATE_COOKIE_SECRET`, not `AUTH_SECRET`.
- The token is signed, not encrypted. The code is public; the signature stops a
  client from extending an expired timestamp or inventing a code.
- Last touch: every valid `affcode` click overwrites `lp_aff`.
- The same middleware may accept `coupon_code` but **must not** set a coupon
  cookie; coupon codes are applied at checkout only.

### Persistence for logged-in users

- On page load / login / signup, the web app posts the token to
  `POST /affiliate/attribute` (authenticated) or includes `affiliate_token` in
  `/auth/register`.
- The server verifies the token, resolves an active affiliate, and upserts
  `user_affiliate_attributions` with `expires_at = now + link_attribution_days`.
- If the token is invalid/expired, the stored attribution is not extended.

### Resolving attribution at checkout

Precedence:

1. Valid, unexpired `affiliate_token` in the checkout body (current browser,
   last touch) → use it and upsert the stored attribution.
2. Valid, unexpired `user_affiliate_attributions` row for the authenticated
   user → use it.
3. Otherwise no affiliate.

Additional guards:

- If `purchaser_user_id == affiliate.user_id`, no commission (self-referral).
- If the affiliate is inactive, no commission.
- The server sets `user_subscriptions.affiliate_id` and
  `affiliate_attributed_at` on the purchase; renewals use that id.
- Attribution is never retroactive: a purchase already recorded cannot be
  reassigned.

### Limitations to document in the affiliate FAQ

- Cookie/token attribution is per browser/device. A purchase on another device
  after clearing cookies is not attributed unless the stored attribution is
  still valid for the logged-in user.
- Ad blockers, private windows, cookie consent refusal, and browser storage
  clearing can lose attribution.
- A user can spoof a public affiliate code; the guard is self-referral plus
  server-side validation. This is the same trust model as a public referral
  link.
- Mobile IAP purchases cannot be attributed in v1. Affiliate links should open
  the web purchase page. Deferred deep links are a later phase.

## Commission and Payment Ledger

### When a payment event is created

| Trigger | Processor | Event |
|---|---|---|
| Stripe `checkout.session.completed` (mode=payment) | stripe | `payment` with session amount/subtotal/tax |
| Stripe `invoice.paid` | stripe | `payment` for the renewal |
| Stripe `charge.refunded` / dispute | stripe | `refund` / `chargeback`; reverse commission |
| PayPal capture success | paypal | `payment`; commission if USD |
| Admin manual grant | manual | **no payment event**; no commission |
| Apple/Google purchase | app-store/play | optional ledger event later; **no affiliate commission in v1** |

Requirements:

- Idempotency: unique `(processor, processor_event_id, kind)`; webhook replays
  must not double-pay commissions.
- **Stripe subscription dedup:** for `mode=subscription`,
  `checkout.session.completed` creates/links the subscription but must **not**
  create a payment event; `invoice.paid` is the authoritative payment event.
  For `mode=payment` (lifetime), `checkout.session.completed` creates the one
  payment event. This avoids double commission on the first invoice.
- Amounts come from the processor object, never from the client. For Stripe,
  use `amount_subtotal` / `total_details.amount_tax` (or the invoice
  equivalent); for PayPal, the capture amount.
- Currency: v1 commissions only when `currency == 'usd'`. Other currencies are
  recorded in the ledger but produce no commission and are visible in the
  affiliate FAQ as unsupported.
- `commission_base_cents = amount_cents - tax_cents` (coupon discount is
  already reflected in `amount_cents`; also store `discount_cents` for
  reporting).
- `commission_cents = round(base_cents * rate_bps / 10000)`.
- Rate source: the affiliate's current `commission_bps` at payment time. Store
  it on the commission row.
- Renewals: look up `user_subscriptions.affiliate_id`; if null/inactive, no
  commission.
- Refunds: mark the original commission `reversed`; if the statement is
  pending, reduce its total; if paid, insert a negative adjustment for the next
  statement. Partial refunds reverse the same proportion of the commission.
- Chargebacks and manual adjustments use the same negative-adjustment path.
- No commission on taxes, shipping (none), or the affiliate's own purchase.

### Worked examples

- Lifetime $169, 15%: base $169.00 → **$25.35**.
- Lifetime sale $84.50, 15%: **$12.68** (rounded).
- Lifetime $169 with 20% coupon: customer pays $135.20 → **$20.28** at 15%.
- Monthly $10, 15%: **$1.50 per successful monthly payment**, not just the
  first.
- Refund of the $135.20 purchase before payout: commission reversed; statement
  excludes it.

## Statements and Payouts

### Statement lifecycle

1. **Collect** pending commissions whose `occurred_at` falls in the statement
   month (UTC month; display in the affiliate's timezone).
2. **Generate** a statement for each affiliate with a positive net total. The
   statement number is `AFF-YYYY-MM-<id>`; status `pending`. If the net is zero
   or negative (for example, a post-payout refund adjustment), do not emit a
   statement; carry the balance into the next period.
3. **Review/pay**: admin opens the statements queue, checks the PayPal email,
   sends the PayPal payment, and marks the statement `paid` with the PayPal
   transaction id and optional notes.
4. **Affiliate view**: sees period, statement ID, status (`pending`/`paid`),
   and earnings; can open a detail view listing the underlying commissions.

Timing (proposed, matching the supplied screenshot/FAQ):

- Earnings for March 1–31 are collected into the March statement.
- The statement is generated/available in April (Teachable says ~20 days after
  month end); it remains `pending`.
- Payout is made on the **first business day of May** (one-month delay to allow
  refunds).
- If a refund lands after the statement was paid, a negative adjustment appears
  in the next statement. Statements are never edited retroactively after
  `paid`.

Generation can be a Flask admin endpoint and/or a script:
`POST /admin/affiliates/statements/generate?period=YYYY-MM` plus
`scripts/generate_affiliate_statements.py` for cron. There is no scheduler in
the repo today; the spec should not assume one.

### Payout rules

- PayPal only. No Stripe Connect, bank transfer, or store credit in v1.
- Admin must set `affiliates.paypal_email` before marking paid; validate with a
  basic email format check.
- Manual payout only; record `payment_reference` for audit. An optional PayPal
  Payouts API integration is future work.
- No minimum payout threshold in v1 (open question; a threshold avoids tiny
  PayPal fees).
- Tax forms (W-9/W-8BEN/1099) are out of scope; the admin is responsible for
  compliance. Document this in the affiliate FAQ/terms.

## Admin UI

### User management

Add an **Affiliate** card to `/users/[id]` Overview:

- If not an affiliate: “Make affiliate” button → modal with commission
  percentage (default from settings) → creates profile, generates code, sets
  `active=true`.
- If an affiliate: code, commission %, active toggle, PayPal email,
  onboarding status, lifetime sales, lifetime commission, pending statement
  total; “Edit commission” and “Deactivate affiliate” actions.
- Deactivation does not delete the user or historical commissions. Reactivation
  re-uses the same code.
- Preserve the existing admin privilege control and subscription manager.

Search results should show an `Affiliate` badge.

### Affiliates list

Route `/affiliates` (Users group), admin-only:

- Summary cards (from screenshot): Sales by affiliates, Total affiliate
  earnings, Average affiliate sales, plus number of active affiliates.
- Search by name/email/code; filters active/inactive; pagination; Export CSV.
- Table: Name, Email, Code, Commission %, Sales, Earnings, Pending, Status,
  Last activity, Actions (View user, Edit commission, Deactivate).
- Tabs: **Affiliates**, **Statements**, **Settings**.
- Statements tab: period, affiliate, statement ID, status, total, PayPal email,
  actions (Mark paid, View detail, Export CSV).
- Settings: link attribution window (1–365 days), default commission %, payout
  note.

### Coupons

Route `/coupons` (Insights group or a future Commerce group), admin-only:

- Header: “Your Coupons”, “Create and manage coupons to provide discounts.”
- Add New Coupon button.
- Summary/table columns: Type (`Lifetime Pro`), Internal name, Coupon code,
  Discount (`25% off` / `$50 off`), Expires, Used / Available, Status, Actions.
- Search by code/name; pagination; no “School Coupons / Product Coupons” tabs
  because Language Player has one product family.
- Create modal fields:
  - Coupon applies to: `Lifetime Pro` (read-only in v1)
  - Type of coupon: Percentage / Amount
  - Discount value (% or USD)
  - Coupon code (max 40, letters/digits)
  - Internal name
  - Expires date + time (default `America/Vancouver`; show timezone)
  - Number available (1–10,000)
  - No “display coupon expiration” toggle
- Edit modal:
  - Internal name, expiry, number available (cannot go below used count)
  - Code, type, and discount are read-only with the note: “Need to change the
    code or discount? Archive this coupon and create a new one.”
- Archive instead of delete; archived coupons cannot be redeemed but remain in
  history.
- Statuses: active, expired, exhausted, archived.

### Admin API surface

All routes admin-gated with `require_admin()`:

| Method | Route | Purpose |
|---|---|---|
| GET | `/admin/affiliates` | List/filter/summary |
| GET | `/admin/affiliates/export` | CSV |
| GET | `/admin/users/<id>/affiliate` | Profile + metrics |
| POST | `/admin/users/<id>/affiliate` | Make affiliate |
| PATCH | `/admin/users/<id>/affiliate` | Commission/active/PayPal |
| GET | `/admin/affiliates/statements` | Statement queue |
| POST | `/admin/affiliates/statements/generate` | Generate a period |
| POST | `/admin/affiliates/statements/<id>/pay` | Mark paid + reference |
| POST | `/admin/affiliates/commissions/<id>/reverse` | Manual refund/chargeback adjustment |
| GET | `/admin/affiliates/commissions` | Audit ledger (optional) |
| GET | `/admin/coupons` | List/search |
| POST | `/admin/coupons` | Create |
| PATCH | `/admin/coupons/<id>` | Edit allowed fields / archive |
| GET | `/admin/coupons/<id>/redemptions` | Redemption audit |

## Affiliate Portal (in `apps/admin`)

### Routing and shell

- `/affiliate` — Dashboard
- `/affiliate/welcome` — “Let's get started”
- `/affiliate/payouts` — PayPal email setup/edit
- `/affiliate/links` — Links & Resources
- `/affiliate/faq` — FAQ
- `/affiliate/transactions` — own attributed transactions
- `/affiliate/statements` — own statements
- `/affiliate/statements/[id]` — statement detail

Use a dedicated `AffiliateShell` (not the admin nav) with: Dashboard, Links &
Resources, Transactions, Statements, Payouts, FAQ. The affiliate area is
English in v1, matching the admin app, but all strings still go through
`useT()` so it can be localized later.

### Onboarding

1. First login with no `affiliates.onboarded_at` → `/affiliate/welcome`.
2. Welcome screen: “Let's get started”, copy explaining commission on purchases
   through affiliate links, “Continue”.
3. Payout setup: “Set up your payouts”, PayPal email input, Save, “Complete this
   step later”.
4. Saving the email sets `paypal_email`; Continue/Skip sets `onboarded_at` and
   sends the affiliate to `/affiliate`.
5. The dashboard shows a “Finish payout setup” card if `paypal_email` is null.

### Screens

**Dashboard**

- Commission rate, affiliate code, link attribution window.
- Lifetime earnings, last 7 days, last 30 days.
- Lifetime revenue generated, last 7/30 days.
- Products table: Pro plans; each row has an affiliate link/copy action.
- Quick links: primary link, signup link, link generator.

**Links & Resources**

- Primary link (homepage) and signup link, both with copy buttons.
- “Generate a link using a URL” input. Internal URLs only in v1; append
  `affcode` preserving existing query params. Show a validation error for
  external hosts.
- No promotional materials/uploads in v1.

**FAQ**

Render the supplied FAQ content:

- How attribution works (cookie, 60-day window, same browser/device).
- When payouts happen (monthly, one-month delay, PayPal, first business day).
- First-touch vs last-touch: **last touch**; a new affiliate link overrides the
  previous cookie. (Note the Teachable doc conflict in a footnote.)
- Recurring plans: commission on each monthly/annual payment while active.
- Refunds: commission reversed.
- Supported purchases: USD web purchases in v1; App Store, Play, and CNY web
  checkouts are not commissionable.
- Tax forms: not handled by the platform in v1.

**Transactions**

- Do **not** reuse `/admin/transactions`; that screen remains admin-only and
  returns school-wide rows. Affiliates use `/affiliate/transactions`, whose
  query is permanently scoped to the caller's affiliate id.
- Server-filtered to the signed-in affiliate; no affiliate id query parameter
  is accepted from the client.
- Columns: Date, Product, Sale amount, Commission rate, Commission, Status.
- No student name/email/PII. (Admin can see more in the admin affiliate
  detail.)
- Filters: date range, product, status; pagination; Export CSV optional.
- A caller with affiliate A’s token must get zero rows for B’s data even if it
  tampers with request parameters. Add an explicit regression test.

**Statements**

- Columns: Period, Statement ID, Status (`Pending`/`Paid`), Earnings.
- Detail: commission line items, payment reference if paid, payout email.
- No statement editing by affiliates.

**Payouts**

- Show and edit PayPal email.
- Explain monthly one-month-delay payout schedule.
- Changing the email affects future payouts; a pending statement uses the email
  at the time it is marked paid. Keep an audit trail.

## Coupons: Lifecycle and Checkout

### Lifecycle

1. Admin creates a coupon (code, internal name, type/value, max uses, expiry).
2. A customer enters the code at checkout (or arrives with `coupon_code` in the
   URL).
3. The server validates the coupon against the plan/currency and reserves a
   redemption.
4. Checkout is created with the discount applied by the processor (Stripe
   coupon; PayPal amount). The displayed final amount must be server-derived.
5. On successful payment, the reservation is confirmed and linked to the
   payment event.
6. On failure/cancellation/expiry, the reservation is released.
7. An admin can archive the coupon; history remains.

### Validation rules

- Code exists, is active, and has not expired.
- `applies_to` includes the selected plan; v1 only `lifetime`.
- `currency == 'usd'` for amount coupons; percentage coupons are currency-safe
  but v1 still restricts to USD lifetime.
- Available uses > 0 (confirmed + active reservations < max).
- The user has not already redeemed this coupon.
- Discount does not exceed the current regular price. If a sale is active, the
  coupon is rejected (`sale_active`) and the UI shows the sale price; no
  stacking.
- The final amount must be ≥ $0.50 (or the processor minimum); otherwise reject
  with a clear error.

### Checkout integration

- **Web go-pro:** add a coupon input for lifetime; “Apply” calls
  `POST /coupons/validate`; show discount and final price; include
  `coupon_code`, `affiliate_token` in the checkout request.
- **Stripe Checkout:** server creates/uses a Stripe Coupon with
  `duration='once'`, `percent_off` or `amount_off` + currency, and passes
  `discounts: [{ coupon: stripe_coupon_id }]` to the Checkout Session.
  Store `stripe_coupon_id_live/test` on the local coupon; create lazily when
  first used. Pass `metadata: { user_id, coupon_id, affiliate_id }`.
- **PayPal:** server validates/reserves the coupon, computes the discounted
  USD amount, and creates the PayPal order with that amount. Remove the
  client-supplied amount/`PAYPAL_LIFETIME_AMOUNTS` trust path; validate against
  the server-computed price. Pass coupon/affiliate ids in `custom_id` or
  metadata.
- **Apple IAP / Play / CNY Payment Links:** no coupon field and no coupon
  discount. The UI must say “Coupons are available on web card/PayPal
  purchases only.”
- **Sale interaction:** no stacking. If a lifetime sale is active, coupons are
  disabled for that purchase; show the sale price. Document in admin UI.
- **Affiliate interaction:** a purchase may have both an affiliate and a
  coupon; commission is on the discounted net amount.

### Coupon API surface

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/coupons/validate` | user JWT | Preview code, discount, final amount, expiry, remaining |
| POST | `/coupons/reserve` | user JWT | Reserved internally by checkout; not public |
| POST | `/create-stripe-checkout-session` | user JWT | Accepts `coupon_code`, `affiliate_token` |
| POST | `/create-paypal-order` | user JWT (flag-dependent today) | Accepts `coupon_code`, `affiliate_token` |

`/coupons/validate` must be rate-limited (e.g. 10 attempts/minute/user/IP) to
prevent code brute-forcing.

## Auth, Roles, and Security

### Roles

- `is_admin` remains the GoTrue `app_metadata.is_admin` claim and the existing
  `require_admin()` guard.
- Affiliate status is **not** an `app_metadata` claim. It is the
  `affiliates.active` row; this avoids stale JWTs and lets deactivation take
  effect immediately on the server.
- Add `require_affiliate()` in Flask: verify the JWT, look up
  `affiliates.user_id = sub and active`, return 401/403 otherwise.
- Add `isAffiliate`/`affiliate` to the `/auth/login` client payload for
  NextAuth routing. The server still re-checks the table on every affiliate
  request.
- NextAuth admin app:
  - authorize accepts admin or active affiliate; rejects neither.
  - session/JWT carries `isAdmin`, `isAffiliate`.
  - `proxy.ts` route guards: admin paths require admin; `/affiliate/*`
    requires affiliate; login redirects based on role.
  - Demotion/deactivation leaves a stale UI until re-login but APIs fail
    immediately.
- If an account is both admin and affiliate: default to the admin shell, with a
  link to the affiliate dashboard; or default to affiliate? **Proposed:** admin
  default, explicit “View affiliate dashboard” link.

### Server-side guards

- All `/affiliate/*` endpoints derive the affiliate from the JWT; **never**
  trust an `affiliate_id` request parameter.
- `/affiliate/transactions` query includes
  `where affiliate_commissions.affiliate_id = :caller`.
- `/affiliate/statements` filters by caller.
- Admin endpoints for an affiliate accept the target id, but only admins.
- Tests must attempt IDOR: affiliate A requests B’s statement/transactions with
  forged ids/query params and gets 403/404, not data.
- Coupon validation/redemption is server-side; the client cannot dictate the
  discount amount.
- Payment amounts are always processor/server-derived, never client-supplied.
- Cookie token is HMAC-signed and timestamp-checked.
- PayPal email is validated and only self-editable.
- Audit log every admin affiliate/commission/statement mutation.

### Privacy

- Affiliate transaction rows must not expose student names/emails/payment ids.
- Admin affiliate screens may show purchaser email only if needed; default to
  not showing PII in the affiliate surface.
- Marketing cookie consent: confirm the existing cookie policy/consent banner
  covers an affiliate attribution cookie; if not, add consent gating before
  setting `lp_aff` (open question).

## Apps and Files Impacted

### Supabase

- New tables: `affiliates`, `affiliate_settings`,
  `user_affiliate_attributions`, `payment_events`, `affiliate_commissions`,
  `affiliate_statements`, `coupons`, `coupon_redemptions`.
- Alter `user_subscriptions` (`affiliate_id`, `affiliate_attributed_at`).
- Indexes/uniques listed above; RLS is not used by Flask (service role), but
  policies should at least deny anon access.

### Flask (`zerotohero-python-server`)

- New modules: `routes/affiliates.py` (admin), `routes/affiliate_portal.py`
  (self-service), `routes/coupons.py`, `utils_affiliate.py`.
- `routes/auth.py` / `utils_auth.py`: enrich login user with affiliate status;
  `require_affiliate`.
- `routes/payments.py` / `app_stripe_checkout.py`: coupon/affiliate params,
  ledger writes, refund webhook, Stripe coupon creation.
- `app_paypal_checkout.py`: server-computed coupon amount, ledger writes,
  affiliate metadata.
- `utils_subscription.py`: set affiliate columns on grant/renewal; avoid
  circular imports with ledger helpers.
- `utils_payment_events.py` or `utils_affiliate.py`: idempotent event creation,
  commission math, statement generation.
- `scripts/generate_affiliate_statements.py` (cron/admin).
- Tests: access control/IDOR, attribution, coupons, commissions, statements,
  refunds, idempotency.

### `apps/admin`

- `auth.ts` / `proxy.ts`: allow affiliates, role-based routing.
- `components/layout/affiliate-shell.tsx`, affiliate nav.
- `app/affiliate/*` screens.
- `app/affiliates/page.tsx` admin list/statements/settings.
- `app/coupons/page.tsx` admin coupon list/create/edit.
- `app/users/[id]/page.tsx`: affiliate card.
- `types/affiliate.ts`, `types/coupon.ts`, API clients.
- i18n keys via `translations.csv` + all 18 locales.
- Tests/typecheck/build checks.

### `apps/web`

- `src/proxy.ts`: `affcode` cookie handling.
- `src/app/register/page.tsx`: forward `affiliate_token` on signup.
- `src/app/[l1]/[l2]/go-pro/page.tsx`: coupon input, affiliate token,
  discounted amount preview, processor availability.
- `src/app/login` / session bootstrap: persist attribution for logged-in users.
- `src/lib/prices.ts`: coupon-aware final price helper (or server-only).
- Tests: cookie set/overwrite/expiry, signup attribution, checkout body.

### `apps/mobile`

- v1: **no coupon/affiliate support for IAP**; hide/disable UI and explain web
  purchase. If affiliate deep links are desired later, add deferred deep link /
  referral code capture. No changes strictly required for the first release.
- If web checkout remains available inside mobile, it can carry the token; but
  store policy forbids external purchase links for digital goods, so do not add
  one.

### Classic (`zerotohero-nuxt`)

- Out of scope until the reference-only rule is lifted. If approved later:
  same cookie/params, checkout forwards token/coupon, and the Classic
  subscription flow writes the same ledger/commission rows. Treat as a separate
  repo commit.

### Shared packages

- Add shared types for affiliate/coupon previews only if web/mobile need them.
- Keep money/commission math server-side; do not duplicate commission rules in
  clients.

## Phased Implementation Plan

### Phase 0 — Ledger and schema prerequisite

- Add tables/migrations and `user_subscriptions` columns.
- Add `payment_events` writes for Stripe checkout, Stripe renewals, and PayPal
  captures; add Stripe refund/dispute webhooks.
- Backfill: **no historical payment events** (or mark estimates separately).
- Update SPEC-101 Transactions to prefer ledger amounts where present.
- Tests: idempotency, amounts, refund events, currency.

### Phase 1 — Admin affiliate and coupon management

- Affiliate profile creation/edit/deactivate from user detail.
- Affiliates list/summary/settings.
- Coupon CRUD/archive/list.
- Auth `isAffiliate` login payload; no portal yet.
- Tests: admin-only, commission validation, coupon constraints.

### Phase 2 — Attribution and checkout

- `lp_aff` cookie/middleware, signup/login persistence.
- Checkout bodies accept `affiliate_token`/`coupon_code`.
- Stripe coupon creation + discounts; PayPal server-computed amount.
- Coupon reservation/confirmation/release; rate limiting.
- Ledger writes set affiliate/coupon; commission rows.
- Tests: last touch, expiry, self-referral, no stacking, race for last
  redemption, amount match.

### Phase 3 — Affiliate portal

- Two-surface auth/routing; AffiliateShell.
- Welcome → payouts → dashboard; links; FAQ; transactions (server-filtered);
  statements; payout email.
- Tests: route guards, IDOR, onboarding state, PII absence.

### Phase 4 — Statements and payouts

- Statement generation, admin queue, mark-paid, PayPal email snapshot,
  negative adjustments.
- Tests: period math, pending/paid, refund after payout, one statement per
  affiliate/month, audit.

### Phase 5 — Deferred

- Classic integration (requires approval).
- Mobile deferred deep links/referral capture.
- CNY/IAP commissions (requires FX/processor ledger decisions).
- Affiliate application forms, product restrictions, promotional materials,
  automated PayPal Payouts, tax forms.

## Migration and Rollout

- Additive migrations only; no existing rows are changed except adding nullable
  columns to `user_subscriptions`.
- No historical affiliate attribution or commissions. Existing subscriptions
  remain Pro; no one is retroactively owed money.
- Feature flags:
  - `AFFILIATES_ENABLED` (Flask) — reject affiliate endpoints cleanly when off.
  - `COUPONS_ENABLED` — hide coupon UI and reject redemptions when off.
  - Admin app can gate nav/route visibility, but server must enforce.
- Deploy order: schema → Flask ledger → Flask affiliate/coupon admin →
  web attribution/checkout → affiliate portal → statements.
- Rollback: disable flags; new tables remain (no destructive rollback). If a
  live coupon has issued discounts, do not delete it; archive it.
- Monitoring: log attribution resolution (affiliate id, source, window),
  coupon reservation/confirmation/release, commission creation/reversal, and
  statement generation. Never log PayPal emails or full payment ids at info
  level.

## Testing / Acceptance Criteria

### Unit

- HMAC token sign/verify, expiry, malformed tokens, last-touch overwrite.
- Attribution precedence: token > stored > none; expired token ignored.
- Self-referral rejected; inactive affiliate rejected.
- Commission rounding, rate changes, tax/coupon base, refund reversal.
- Coupon: percent/amount, max uses, expiry boundary, one per user, archive,
  amount > price, sale-active rejection, reservation expiry.
- Statement: month boundaries, pending/paid transitions, negative adjustment,
  idempotent generation.
- Auth: `require_affiliate` accepts active, rejects inactive/non-affiliate;
  admin endpoints still reject affiliates.

### Integration / security

- Affiliate A cannot fetch B’s transactions/statements by changing ids or query
  params; response is 403/404 and no rows.
- A non-admin cannot call `/admin/affiliates/*` or `/admin/coupons/*`.
- An affiliate cannot call admin endpoints; an admin without affiliate status
  cannot call `/affiliate/*` unless also an affiliate.
- Webhook replay does not duplicate payment events/commissions.
- Concurrent use of the last coupon redemption yields one confirmed and one
  rejected reservation.
- Stripe test checkout with coupon/affiliate produces the expected event and
  commission; PayPal sandbox lifetime does the same.
- Refund before/after payout produces the documented adjustment.
- Payout mark-paid requires PayPal email and records reference.

### Manual QA

- Admin makes an existing user an affiliate, changes commission, deactivates
  and reactivates.
- Affiliate logs into `apps/admin`, sees onboarding, saves PayPal email, lands
  on dashboard.
- Link generator produces links; clicking sets cookie; signup and purchase
  attribute; last-touch overwrite works.
- Affiliate transactions show only their own commissions, no PII.
- Statements show pending/paid and are payable in PayPal.
- Coupon create/apply/redeem/expire/exhaust/archive; no stacking with sale.
- Mobile hides coupons/IAP attribution and explains web purchase.

## Risks and Limitations

- **Admin app boundary**: allowing affiliates into the admin app increases
  attack surface; server-side route guards are mandatory. Separate app remains
  the safer alternative.
- **Attribution is best-effort**: cookies, ad blockers, cross-device, consent,
  and client clocks can lose or spoof attribution. Document; do not promise
  perfect attribution.
- **No historical commissions**: existing subscriptions cannot be attributed
  retroactively.
- **Ledger accuracy**: Apple/Google amounts and CNY are not normalized in v1;
  commissions are USD web-only. Refund coverage for PayPal/IAP is manual or
  absent.
- **Statement timing**: one-month delay and manual PayPal payout; no automated
  tax handling. The admin bears payout/tax compliance.
- **Coupon scope**: lifetime-only means no subscription discounts. If product
  wants subscription coupons later, add `applies_to`/`duration` handling and
  first-payment vs all-payments rules.
- **Classic**: no attribution/discount on Classic until the reference-only rule
  is lifted.
- **Teachable behavior drift**: the docs disagree on first/last touch; this spec
  fixes last touch for our product.

## Open Questions

1. **Portal location**: approve two-surface `apps/admin`, or build a separate
   `apps/affiliate`? (Recommendation: two-surface, with ADR-0032 amendment.)
2. **Coupon scope**: approve lifetime-only v1, or also monthly/annual? If
   subscriptions, should a percentage coupon apply to first payment only or all
   payments? (Recommendation: lifetime-only v1.)
3. **Attribution model**: confirm last-touch (per supplied FAQ) despite current
   Teachable docs saying first-touch.
4. **Attribution window**: 60 days default? Should it be configurable by the
   admin (1–365)?
5. **Commission currency**: confirm USD web-only v1; CNY/IAP deferred.
6. **Payout timing**: one-month delay with statements available ~20 days after
   month end, paid on the first business day of the following month?
7. **Manual PayPal vs PayPal Payouts API**: manual mark-paid v1?
8. **Minimum payout threshold**: none, or e.g. $50 to limit PayPal fees?
9. **Tax forms**: confirm out of scope and admin responsibility.
10. **Classic exception**: should the reference-only rule be lifted for this
    feature? If not, Classic purchases are not attributed/discounted.
11. **Affiliate email notifications**: should making someone an affiliate send
    an email (Teachable does)? Not required by the request.
12. **Admin access to affiliate data**: should admins see the full purchaser
    email/payment id in an affiliate's transaction detail? (Recommendation:
    no PII in the affiliate surface; admins can use the existing transactions
    screen.)
13. **Cookie consent**: does the existing cookie policy/consent cover a
    marketing attribution cookie, or must `lp_aff` wait for consent?
