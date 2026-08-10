# Payment, Subscription & MailerLite — End-to-End Architecture

## Metadata

- **Arch ID**: ARCH-022
- **Feature**: Payment, subscription, free-trial, and MailerLite mailing-list architecture
- **Type**: as-built
- **Status**: draft
- **Created**: 2026-08-09
- **Last Updated**: 2026-08-09
- **ROADMAP Phase**: Cross-cutting (payment infrastructure)
- **Scope**: Python backend (active), Classic Nuxt (legacy), Next.js Web (active), React Native Mobile (active), Admin console (active)
- **Supersedes**: None
- **See also**:
  - [ARCH-015 — Payment Methods & Renewal Strategy](015-payment-methods-plan-support.md)
  - [SPEC-014 — Subscription & Payment System](../specs/014-subscription-payment-system.md)
  - [SPEC-054 — Subscription & Payment Testing](../specs/054-subscription-payment-testing.md)
  - [SPEC-060 — Admin Console User Management](../specs/060-admin-console-user-management.md)
  - [SPEC-039 — Full Database Migration to Supabase](../specs/039-full-database-migration-supabase.md) (WS-6: subscriptions)
  - [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md)
  - [ADR-0032 — Admin Console App](../adr/0032-admin-console-app.md)
  - `zerotohero-python-server/routes/payments.py` — payment routes
  - `zerotohero-python-server/routes/subscriptions.py` — subscription & email-verification routes
  - `zerotohero-python-server/app_stripe_checkout.py` — Stripe checkout, webhooks, renewal
  - `zerotohero-python-server/app_paypal_checkout.py` — PayPal verification
  - `zerotohero-python-server/app_in_app_purchase.py` — Apple receipt validation
  - `zerotohero-python-server/utils_subscription.py` — subscription CRUD + MailerLite group sync
  - `zerotohero-python-server/utils_mailer_lite.py` — MailerLite API helpers
  - `zerotohero-python-server/app_email_verification.py` — free trial + MailerLite subscriber creation
  - `zerotohero-python-server/data/prices.csv` — price definitions

---

## Overview

Language Player sells three Pro plans — monthly ($10), annual ($90), and lifetime ($169) — through Stripe (credit card, WeChat Pay, Alipay), PayPal, and Apple in-app purchase. The Python Flask backend is the single owner of subscription state: every frontend redirects the user to a payment provider, and the backend converts successful payment events into rows in the `user_subscriptions` table that gate Pro features everywhere.

Three ideas matter most for understanding this system:

1. **The backend is the source of truth.** Frontends never grant Pro themselves; they call `/user-subscription` to read state, and the backend writes subscriptions only after a verified payment callback or webhook.
2. **Stripe webhooks are the durable path.** The synchronous success redirect is convenient for UX, but `checkout.session.completed` and `invoice.paid` are what reliably create and renew subscriptions (especially for Payment Links, which have no return redirect).
3. **MailerLite sync is a side effect of subscription writes.** Every add/update/delete of a subscription tries to move the user's MailerLite subscriber into the matching group (`trial`, `monthly`, `annual`, `lifetime`, or `disengaged`), but a MailerLite failure never rolls back the subscription grant.

---

## Context

ARCH-015 documents the payment-method constraints and renewal strategy. SPEC-014 defines the unified implementation plan for web and mobile. This document describes how the system actually works today in `zerotohero-python-server/`, including the parts SPEC-014 leaves as future work (for example, mobile IAP is still not implemented).

Since ARCH-015 was written, SPEC-039 WS-6 moved subscriptions from Directus to Supabase (`public.user_subscriptions`). The utility functions in `utils_subscription.py` keep the same names and response shapes as the Directus era, so payment apps, routes, and the admin console use them unchanged. User ids are Supabase auth UUIDs, with legacy Directus numeric ids resolved through `user_id_map`.

---

## Plans, Prices & Payment Methods

`data/prices.csv` is the single source of truth for prices. `GET /stripe-prices` parses it and returns the live or test ids/links depending on the `test` query flag.

| Plan | USD | CNY | Stripe mode | Auto-renewal |
|---|---|---|---|---|
| Monthly | $10 | ¥73 | `subscription` (USD) / one-time `payment` (CNY) | ✅ Stripe credit card only |
| Annual | $90 | ¥653 | `subscription` (USD) / one-time `payment` (CNY) | ✅ Stripe credit card only |
| Lifetime | $169 | ¥1,227 | `payment` | ❌ one-time |

Payment-method support per ARCH-015:

| Method | Monthly | Annual | Lifetime | Auto-renewal |
|---|---|---|---|---|
| Stripe credit card | ✅ | ✅ | ✅ | ✅ |
| WeChat Pay / Alipay (Stripe Payment Links) | ✅ | ✅ | ✅ | ❌ one-time only |
| PayPal | ❌ | ❌ | ✅ | ❌ |
| Apple IAP | ❌ | ❌ | ✅ | ❌ non-consumable |

---

## Subscription Storage & Status

### Storage

Subscriptions live in Supabase `public.user_subscriptions` (one row per user record; `utils_subscription.update_or_add_subscription` updates the user's first existing row, or inserts one when none exists).

| Field | Description |
|---|---|
| `id` | Surrogate id — `GENERATED BY DEFAULT AS IDENTITY` (converted 2026-08-09; sequence set to `max(id)`) |
| `status` | Defaults to `draft`; not used by the status endpoint today |
| `user_id` | Supabase auth UUID (legacy Directus ids resolved through `user_id_map`) |
| `created_on` / `expires_on` | ISO timestamps; `expires_on` is `null` for lifetime |
| `type` | `monthly`, `annual`, `lifetime`, or `trial` |
| `payment_processor` | `stripe`, `paypal`, or `app-store` |
| `payment_method` | Optional method detail |
| `payment_email` | Email captured from the payment provider |
| `payment_id` | Stripe session id, PayPal pay id, or Apple transaction id |
| `payment_date` | When the payment was recorded |
| `notes` | Human-readable grant note |
| `payment_customer_id` | Stripe customer id (used for renewal lookup and cancellation) |

`payment_id` has a partial unique index (idempotency key; empty strings are
excluded), and `user_id` is a `uuid` FK to `auth.users` with `ON DELETE
CASCADE` so deleting an account removes subscriptions, acquisition rows, and
`user_id_map` entries.

### Status endpoint

`GET /user-subscription` authenticates the caller via Supabase JWT and returns the most recent active subscription — defined as `type == 'lifetime'` or `expires_on` in the future. If there are no active rows it returns the first row anyway; if the user has none at all it returns `{"subscription": null}`.

Web (`use-subscription.ts`, `SubscriptionProvider`) and mobile (`SubscriptionContext`) treat a user as Pro when the row is lifetime or has a future `expires_on`. Auto-renew is derived client-side as `monthly|annual && payment_customer_id != null && active`.

---

## Purchase Flows — How Successful Payments Raise the Subscription

All purchase paths converge on `update_or_add_subscription(payload)`:

- If the user already has a subscription row, the payload **updates** that row (new type, expiry, payment ids, customer id).
- If the user has no row, a new one is **inserted**.
- After either write, the row's owner email is assigned to the matching MailerLite group (see [MailerLite](#mailerlite-mailing-list-integration)).

### Stripe credit card (web, mobile, Classic)

```
Go Pro screen
  │ POST /create-stripe-checkout-session {price_id, user_id, host, mode}
  ▼
Stripe Checkout (hosted page)
  │ user pays
  ├──► redirect → GET /stripe_checkout_success?session_id&user_id&host
  │       • retrieve Checkout Session + line item
  │       • map price id → type (monthly/annual/lifetime)
  │       • expiry = now + 32/367 days (or null for lifetime)
  │       • update_or_add_subscription(...)
  │       • 302 → {host}/go-pro-success
  │           • page polls GET /user-subscription until Pro (up to 10 × 2s)
  └──► webhook → POST /webhook-stripe-checkout-session-completed
          • verify Stripe signature
          • same price→type/expiry mapping
          • update_or_add_subscription(...)
          • acts as idempotent fallback and is the reliable path for
            Payment Links (no return redirect)
```

The backend `stripe_checkout_success` handler is the single success callback for all frontends; the `host` parameter decides which app's `/go-pro-success` page receives the redirect.

### WeChat Pay / Alipay (Stripe Payment Links)

The Go Pro screen opens a pre-built Stripe Payment Link (CNY). After payment, Stripe fires `checkout.session.completed`; the webhook creates or updates the subscription. There is no redirect back to the app, so the user verifies the grant by polling `/user-subscription` (or by the app re-fetching on next launch).

### PayPal (Classic only, lifetime)

```
Classic go-pro → PayPal button (lifetime only)
  → user approves on PayPal
  → GET /paypal_checkout_success?pay_id&user_id&host
  → backend verifies payment state == "approved"
  → update_or_add_subscription({type: "lifetime", processor: "paypal", ...})
  → 302 {host}/go-pro-success (or /go-pro-error)
```

Web and mobile currently link out to Classic's go-pro page for PayPal rather than implementing a direct PayPal button.

### Apple IAP (Classic today; mobile per SPEC-014)

```
PurchaseiOS → Apple payment sheet → receipt
  → POST /in_app_purchase_success {user_id, receipt}
  → backend validates receipt with Apple via inapppy (bundle ca.zerotohero.app)
  → update_or_add_subscription({type: "lifetime", processor: "app-store", ...})
  → {type: "success"} → /go-pro-success
```

IAP is a non-consumable product and always grants lifetime.

### Admin grant

The admin console (`apps/admin`, SPEC-060 / ADR-0032) can grant a subscription directly:

`POST /admin/users/<user_id>/subscriptions` → `add_subscription(...)` with auto-computed expiry (`trial` = +7d, `monthly` = +30d, `annual` = +365d, `lifetime` = none). Because it reuses `utils_subscription`, the MailerLite group assignment is preserved.

---

## Renewal Flow — How Renewal Payments Renew a Subscription

Only Stripe credit card (USD) subscriptions auto-renew. When Stripe charges the card again it fires `invoice.paid`:

```
Stripe charges card
  → POST /webhook-stripe-subscription-invoice-paid
  → verify Stripe signature
  → find price id from invoice line items → type (monthly/annual)
  → find local subscription by payment_customer_id
  → compute new expires_on = now + 32d (monthly) or 367d (annual)
  → update_subscription(...) with new expires_on, payment_date, processor
  → MailerLite group re-assigned to monthly/annual
```

Note: the handler recomputes `expires_on` from the payment time (`now + 32/367 days`) rather than adding days to the previous expiry. Under normal period-end billing that behaves like an extension; an early renewal would reset the window.

---

## Free Trial — Legacy Flow (Not Wired to the GoTrue Path)

The code that grants the trial lives in the legacy email-verification flow,
which active clients no longer call:

```
signup → POST /verification_email {email} → sends code
  → POST /verification_email/verify {email, code, acquisition_source?, acquisition_details?}
  → process_verified_user(email)
      • user status draft → active
      • give_free_trial_if_no_active_subscription_exists(user_id)
          - no active row (lifetime or future expires_on)? → insert
            {type: "trial", expires_on: now + 7 days, notes: "Free trial subscription."}
          - active subscription already exists? → no trial
      • new_mailer_lite_subscriber(email, first_name, last_name,
                                   role=user.role, user_id=user.id,
                                   group_name="trial" if a trial was granted)
```

> ⚠️ **Current gap (SPEC-039 M1/M2):** active clients register and verify
> through GoTrue (`POST /auth/register` → `POST /auth/verify-email`), which
> does **not** call `process_verified_user`. As of the GoTrue cutover, new
> users therefore receive **no** free trial and are **not** added to MailerLite
> through this path. The legacy `/verification_email*` routes still exist, but
> no active web/mobile/Classic client calls them.

The legacy flow, when invoked, grants one 7-day trial only if the user has no
active subscription at that moment.

---

## Subscription Management

### User self-service

Every app's profile/me screen fetches `GET /user-subscription` and shows a subscription card: plan type, expiry (or lifetime), and whether it auto-renews. For monthly/annual Stripe subscriptions the card exposes **Cancel**:

```
Profile → Cancel
  → POST /cancel-subscription-at-end-of-period {customer_id}
  → Stripe: list active subscriptions for the customer
  → Stripe Subscription.modify(cancel_at_period_end=True)
  → update local row: payment_customer_id = null
      • MailerLite: monthly/annual without customer id → "disengaged"
  → frontend clears customer id / re-fetches /user-subscription
```

The Stripe subscription continues until the paid period ends; the local row stops advertising auto-renew (client `willAutoRenew` becomes false once `payment_customer_id` is null).

### Success-page polling

`/go-pro-success` (web and mobile) polls `GET /user-subscription` up to 10 times with a 2-second interval to confirm the webhook/redirect grant landed, then shows success or a "still processing" state.

### Admin management

- **Legacy Classic admin** (`zerotohero-nuxt/pages/admin/manage-subscriptions.vue`) uses the ungated `POST /admin/update_or_add_subscription` and `GET /admin/check_user_subscription?email=` endpoints.
- **New admin console** (`apps/admin`) uses the JWT-gated `routes/admin_users.py` endpoints: grant (`POST /admin/users/<user_id>/subscriptions`), change (`PATCH /admin/subscriptions/<id>`), and remove (`DELETE /admin/subscriptions/<id>`). Remove calls `delete_subscription`, which moves the MailerLite subscriber to `disengaged`.

---

## MailerLite Mailing-List Integration

### API helpers

`utils_mailer_lite.py` wraps the MailerLite API v2 using the `MAILER_LITE_TOKEN` environment variable:

| Helper | What it does |
|---|---|
| `new_mailer_lite_subscriber(...)` | Creates a subscriber with custom fields `role`, `last_name`, `user_id`, then optionally assigns a group |
| `fetch_subscriber_by_email(email)` | Looks up an existing subscriber |
| `assign_mailer_lite_subscriber_to_group(email, group_name)` | Fetches the subscriber and assigns them to the named group |

### Where sync happens

| Trigger | MailerLite action |
|---|---|
| Email verification (new user) | Create subscriber; assign to `trial` when a trial was granted |
| `add_subscription` | Assign subscriber to the new row's `type` |
| `update_subscription` | Assign subscriber to the new `type`; `monthly`/`annual` without `payment_customer_id` → `disengaged` |
| `delete_subscription` (admin remove) | Assign subscriber to `disengaged` |

### Group mapping

| Local subscription state | MailerLite group |
|---|---|
| Trial granted | `trial` |
| Monthly | `monthly` |
| Annual | `annual` |
| Lifetime | `lifetime` |
| Monthly/annual cancelled (no Stripe customer id) | `disengaged` |
| Subscription removed | `disengaged` |

### Behavior notes

- The `role` custom field is copied from the user record at subscriber creation; the code comment documents `3` = Free User, `4` = Pro User.
- Group assignment only works if the email already exists as a MailerLite subscriber. Subscriber creation currently happens only in the legacy email-verification flow, which active GoTrue signups no longer reach (SPEC-039 M2), so new users and imported users may not receive group updates until a subscriber exists.
- Every assignment call is wrapped in `try/except` in `utils_subscription.py`; a MailerLite error is logged and the subscription grant still succeeds. Email verification is the one place subscriber creation is not wrapped, so a MailerLite outage there could surface as a verification error.

---

## Endpoint Reference

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/stripe-prices?test=` | Price ids / Payment Links from `prices.csv` | Public |
| POST | `/create-stripe-checkout-session` | Create Stripe Checkout Session, return `{url}` | Public (expects user id) |
| GET | `/stripe_checkout_success` | Verify session, grant subscription, redirect to success/error | Public (Stripe redirect) |
| POST | `/webhook-stripe-checkout-session-completed` | Stripe webhook — initial purchase | Stripe signature |
| POST | `/webhook-stripe-subscription-invoice-paid` | Stripe webhook — renewal | Stripe signature |
| GET | `/paypal_checkout_success` | Verify PayPal payment, grant lifetime, redirect | Public (PayPal redirect) |
| POST | `/in_app_purchase_success` | Validate Apple receipt, grant lifetime | Public (app call) |
| GET | `/user-subscription` | Return current subscription | Supabase JWT |
| POST | `/cancel-subscription-at-end-of-period` | Cancel Stripe subscription at period end | Public (app call) |
| POST | `/verification_email` | Send verification code — **legacy/unused by active clients** (still Directus-backed; see SPEC-039 M5) | Public |
| POST | `/verification_email/verify` | Verify code, activate user, grant trial, create MailerLite subscriber — **legacy/unused by active clients** | Public |
| POST | `/admin/update_or_add_subscription` | Legacy admin upsert by email | Ungated (Classic compat; see ADR-0032) |
| GET | `/admin/check_user_subscription?email=` | Legacy admin lookup | Ungated |
| POST | `/admin/users/<user_id>/subscriptions` | Admin grant | Admin JWT |
| PATCH | `/admin/subscriptions/<id>` | Admin change | Admin JWT |
| DELETE | `/admin/subscriptions/<id>` | Admin remove | Admin JWT |

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Backend owns subscription state | One grant path for all frontends; apps only read status and redirect |
| Webhooks are the durable grant/renewal path | Payment Links have no return redirect; webhooks survive browser redirect failures |
| `prices.csv` + `/stripe-prices` as single price source | One place to change plans/prices; frontends never hardcode ids |
| Local row updates in place (`update_or_add_subscription`) | Simple state model: one current subscription per user |
| MailerLite sync as best-effort side effect | Mailing list must not block revenue-critical payment processing |
| Free trial logic lives in the legacy verification flow | Historically one controlled, one-time 7-day entry point; needs re-homing to the GoTrue path (SPEC-039 M1) |

---

## Known Limitations & Notes

- **WeChat Pay / Alipay do not auto-renew.** Monthly/annual CNY purchases are one-time Payment Links; the user must re-purchase when the plan expires.
- **PayPal and Apple IAP are lifetime-only.**
- **Mobile IAP is not implemented yet** (SPEC-014); the React Native app still relies on web-based Stripe/Payment-Link flows.
- **Renewal recomputes expiry from payment time** (`now + 32/367 days`) rather than stacking onto the previous expiry.
- **MailerLite creation is limited to email verification**, so group assignment for pre-existing subscribers depends on them already being in MailerLite.
- **Free trial + MailerLite subscriber creation are not wired to the GoTrue signup/verify flow** (SPEC-039 M1/M2) — new users currently get neither.
- **Legacy admin subscription endpoints are still ungated** server-side for Classic compatibility; gating/retiring them is tracked in ADR-0032.

---

## References

- [ARCH-015 — Payment Methods & Renewal Strategy](015-payment-methods-plan-support.md)
- [SPEC-014 — Subscription & Payment System](../specs/014-subscription-payment-system.md)
- [SPEC-054 — Subscription & Payment Testing](../specs/054-subscription-payment-testing.md)
- [SPEC-060 — Admin Console User Management](../specs/060-admin-console-user-management.md)
- [SPEC-039 — Full Database Migration to Supabase](../specs/039-full-database-migration-supabase.md)
- [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md)
- [ADR-0032 — Admin Console App](../adr/0032-admin-console-app.md)
