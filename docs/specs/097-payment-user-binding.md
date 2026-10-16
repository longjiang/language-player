# SPEC-097: Payment Endpoint User Binding

## Metadata

- **Spec ID**: SPEC-097
- **Feature**: Bind the account a payment endpoint acts on to the caller's
  verified JWT, instead of trusting a `user_id` sent by the client
- **Status**: complete (2026-10-16)
- **Created**: 2026-10-16
- **Implemented**: 2026-10-16 — `zerotohero-python-server` `957743e`,
  `9f21769`; monorepo `dda3b0db`; `zerotohero-nuxt` `41d2fa7b`
- **ROADMAP Phase**: Phase 9: Backend Consolidation (security follow-up)
- **Scope**: Flask backend (`zerotohero-python-server/routes/payments.py`,
  `app_paypal_checkout.py`) and the checkout callers in `apps/web`,
  `apps/mobile` and Classic (`zerotohero-nuxt`).
- **See also**:
  - [ARCH-022 — Payment, Subscription & MailerLite](../arch/022-payment-subscription-mailerlite.md)
  - [SPEC-014 — Subscription Payment System](014-subscription-payment-system.md)
  - [SPEC-054 — Subscription Payment Testing](054-subscription-payment-testing.md)
  - [SPEC-068 — Google Play Billing Implementation](068-google-play-billing-implementation.md)
  - [ADR-0023 — Proxy Supabase Auth Through Flask](<../adr/0023-proxy-supabase-auth-through-flask.md>)
  - [ADR-0032 — Admin Console as a Separate Next.js App](<../adr/0032-admin-console-app.md) (the `is_admin` claim model)

## Overview

Four Flask payment endpoints took a `user_id` from the request body, verified
nothing about the caller, and then acted on that account:

| Endpoint | What it did with the body `user_id` |
|---|---|
| `POST /create-stripe-checkout-session` | Created a Stripe Checkout Session for that account, and first read its subscription rows (an unauthenticated disclosure of whether an arbitrary account is an active subscriber) |
| `POST /create-paypal-order` | Created a PayPal order stamped with that account |
| `POST /in_app_purchase_success` | Granted Pro to that account after verifying an Apple receipt/JWS |
| `POST /play_billing_success` | Granted Pro to that account after verifying a Google Play purchase token |

Any caller could therefore name any account. The grant paths still required a
genuine, verifiable purchase credential, so this was not free-Pro; the real
exposures were the subscription-status read, unattributable session/order
creation, and — separately, and worse — a **replay** hole on the PayPal
success redirect (below).

## The fix

`routes/payments.py::_bind_payment_user(body_user_id, enforce)` verifies the
caller's Supabase JWT (`utils_auth.authenticated_user_id()`) and requires its
`sub` to equal the body's `user_id`:

| Caller | Result |
|---|---|
| no / invalid token | `401` |
| valid token, `sub != user_id` | `403 {"error": "user_id does not match the authenticated user"}` |
| valid token, `sub == user_id` | the handler runs with the verified id |

For `/create-stripe-checkout-session` the binding runs **before** the
active-subscription lookup, so an unauthenticated caller cannot reach it at
all (asserted by a test that fails if the lookup is called).

## Rollout: one endpoint enforced, three flag-gated

Enforcing everywhere at once would have broken live revenue flows, because I
checked every caller and **none of them sent a token**:

| Caller | Endpoint | Sent a token? | Fixed in |
|---|---|---|---|
| `apps/web` go-pro page (`fetch`) | Stripe | no | `dda3b0db` → `authenticatedFetch` |
| Classic `PurchasePayPal.vue` (`fetch`) | PayPal | no | `41d2fa7b` (nuxt repo) → `this.$axios.$post` |
| `apps/mobile` go-pro (`fetch`) | Apple + Play IAP | no | `dda3b0db` → `authenticatedFetch` |

The mobile clients are the constraint: **already-installed App Store / Play
builds cannot be updated on the server's schedule**, so flipping the check on
for IAP would stop real purchases for every user who has not updated.

Therefore:

- **Stripe is enforced unconditionally.** Its only caller is the Next.js
  go-pro page, deployed together with this server.
- **PayPal, Apple IAP and Google Play are gated by
  `ENFORCE_PURCHASE_USER_BINDING`** (env var, default `0`). With the flag off
  the legacy behaviour is preserved exactly; with it on, the same 401/403
  rules apply.

The callers already send the token, so enabling the flag is a deploy-time
decision once a mobile build and the Classic deploy are out:

```bash
# after the next mobile release and the Classic deploy are live
ENFORCE_PURCHASE_USER_BINDING=1   # in the Flask server's environment
```

## The PayPal replay hole (fixed independently of the flag)

`GET /paypal_checkout_success` is the browser redirect PayPal sends the buyer
back to. It read `user_id` from its **query string** and granted a lifetime
subscription there, after verifying only that the *order* was COMPLETED.

`create_paypal_order()` stamps the order with
`purchase_units[0].custom_id = user_id`, but that value was never consulted.
So anyone holding a completed order id could redeem it for their own account
— and order ids leak: the success URL is a plain GET that lands in browser
history, server logs, screenshots and `Referer` headers. Replay is also
reachable deliberately, because capture of an already-captured order returns
`422` and `_capture_order()` then confirms `COMPLETED` via `GET`.

`app_paypal_checkout._order_owner(order_id)` now reads the order's
`custom_id` (falling back to `reference_id`) and the grant uses that, not the
redirect parameter:

- order owner differs from the redirect → grant to the **order owner** and log
  the mismatch;
- order owner unreadable (PayPal read failure) → fall back to the redirect
  value and log, because the order was already verified COMPLETED and a
  transient API error must not cost a paying customer their purchase.

## Tests

`zerotohero-python-server/test_payment_user_binding.py` (24 cases):
`_bind_payment_user` in every mode; Stripe's 401 / 403 / happy path (asserting
`client_reference_id` is the verified sub); the disclosure lookup not being
reached unauthenticated; flag-off legacy behaviour, flag-on 401/403/success
for all three gated endpoints.

`zerotohero-python-server/test_paypal_orders_v2.py`: `_order_owner` reading
`custom_id` / `reference_id` / read failures; the grant going to the order
owner when the redirect claims a different account; the fallback when the
owner is unreadable; plus the pre-existing create/capture cases.

## Known Limitations

- **Client-supplied amounts are still trusted.** `create_paypal_order`
  validates `amount` against `PAYPAL_LIFETIME_AMOUNTS` and Stripe uses a
  server-known `price_id`, so the amount cannot be lowered — but the set is
  hardcoded rather than read from the price catalogue.
- **The Apple/Google grant paths are only as strong as the store
  verification** in `app_in_app_purchase` / `app_google_play`; this spec binds
  *who* receives the grant, not *whether* the purchase is genuine.
- **A demoted or deleted account keeps its JWT until expiry** (ADR-0032's
  known limitation) — the binding checks the token's `sub`, not the account's
  current state.
- **`/paypal_checkout_success` cannot require a JWT**: it is a cross-site
  redirect from PayPal back to the server, so it is protected by the order's
  own binding instead.

## Open Questions

- Should the Apple/Google paths also verify that the purchase was made by the
  authenticated user (e.g. Apple's `appAccountToken`), rather than only that
  the receipt is valid?
- Should `ENFORCE_PURCHASE_USER_BINDING` default to `1` once no client in the
  wild is known to omit the token, and be removed entirely afterwards?
