# SPEC-014: Subscription & Payment System

## Metadata

- **Spec ID**: SPEC-014
- **Feature**: Subscription purchase, verification, and management across web, mobile, and Classic
- **Status**: Active — implementation mostly landed; testing is tracked in SPEC-054
- **Created**: 2026-07-25 · **Updated**: 2026-08-10
- **Based on**: ARCH-015 (payment method constraints), ADR-0013 (app store strategy), SPEC-048 (store release)
- **See also**:
  - `docs/arch/022-payment-subscription-mailerlite.md` — as-built architecture
  - `docs/specs/054-subscription-payment-testing.md` — phased test plan
  - `docs/specs/048-mobile-release-plan.md` — App Store / Play release plan
  - `zerotohero-python-server/routes/payments.py` — payment routes + `/stripe-prices`
  - `zerotohero-python-server/routes/subscriptions.py` — subscription routes
  - `zerotohero-python-server/app_stripe_checkout.py` — Stripe integration
  - `zerotohero-python-server/app_paypal_checkout.py` — PayPal integration
  - `zerotohero-python-server/app_in_app_purchase.py` — Apple IAP receipt validation
  - `zerotohero-python-server/utils_subscription.py` — subscription CRUD + grants
  - `zerotohero-python-server/data/prices.csv` — single source of truth for pricing

---

## TL;DR

One Python backend owns pricing, purchase verification, and subscription grants.
All frontends read the same `/stripe-prices` and `/user-subscription` endpoints,
and every purchase flow ends in the same `user_subscriptions` row.

**Store-policy rule:** digital Pro sold inside a mobile app must go through the
store's billing (Apple IAP on iOS, Google Play Billing on Android). Stripe card,
WeChat, Alipay, and PayPal are website payments (and Classic payments) — the
same backend grant makes them work in the apps once the user logs in.

---

## Payment methods by platform

### Target (what we want to support)

| Payment method | Plans | Classic | Web | Mobile iOS | Mobile Android |
|---|---|---|---|---|---|
| Stripe credit card (USD) | monthly / annual / lifetime | ✅ | ✅ | 🚫 in-app — buy on website | 🚫 in-app — buy on website; Play Billing later |
| WeChat Pay (CNY) | all | ✅ | ✅ | 🚫 in-app — buy on website | 🚫 in-app — buy on website; Play Billing later |
| Alipay (CNY) | all | ✅ | ✅ | 🚫 in-app — buy on website | 🚫 in-app — buy on website; Play Billing later |
| PayPal | lifetime only | ✅ | ✅ (direct, planned) | 🚫 in-app — buy on website | 🚫 in-app — buy on website; Play Billing later |
| Apple IAP | lifetime | ✅ (`pro`) | — | ✅ (`pro_go`) | — |
| Google Play Billing | lifetime | — | — | — | ⬜ planned (blocked on Play account) |

Legend: ✅ supported · 🟡 partial (link-out / not yet direct) · ⬜ planned ·
🚫 intentionally not offered in-app (use the website).

### Today (2026-08-10)

| Payment method | Classic | Web | Mobile iOS | Mobile Android |
|---|---|---|---|---|
| Stripe credit card | ✅ | ✅ | ⚠️ browser checkout in-app (policy risk) | ✅ web checkout (stopgap) |
| WeChat Pay | ✅ | ✅ | ⚠️ browser checkout in-app (policy risk) | ✅ web checkout (stopgap) |
| Alipay | ✅ | ✅ | ⚠️ browser checkout in-app (policy risk) | ✅ web checkout (stopgap) |
| PayPal | ✅ | 🟡 links to Classic | 🚫 hidden on iOS (IAP available) | 🟡 links to Classic (stopgap) |
| Apple IAP | ✅ | — | ✅ | — |
| Google Play Billing | — | — | — | ⬜ not implemented |

Per-platform notes:

- **Classic** — full set: Stripe card, WeChat, Alipay, PayPal (lifetime), and
  Apple IAP (`pro`, lifetime). Legacy; stays live as "Language Player 2".
- **Web** — Stripe card, WeChat, Alipay for all plans. PayPal currently links
  out to Classic; direct PayPal is planned. Sale UI is still missing.
- **Mobile iOS** — only lifetime is selectable; monthly/annual are gated off
  (store policy). Today the app also offers Stripe card / WeChat / Alipay via
  browser checkout, which is a review risk; target is Apple IAP only in-app.
- **Mobile Android** — all plans via browser web-checkout today (launch
  stopgap per SPEC-048). Play Billing is the target in-app method once the
  Play account + billing setup exist.

### Why the split (store policy)

- **Apple (Guideline 3.1.1):** digital goods/subscriptions consumed in the app
  must use IAP. External payment links inside the app are circumvention (narrow
  EU/US external-purchase entitlements exist but come with fees and consent
  flows).
- **Google Play:** digital content consumed in the app must use Play Billing;
  external payment links are prohibited outside Google's limited
  alternative-billing programs.
- **Web / Classic:** not store-distributed, so they can offer Stripe, WeChat,
  Alipay, and PayPal directly.

The practical pattern: buy on the website (or Classic), log into the mobile
app, and Pro is already there — same `user_subscriptions` row.

---

## Identifiers & IAP

### App identifiers and IAP products

| App | Store | Identifier | IAP product | Status |
|---|---|---|---|---|
| Classic — "Language Player 2" | App Store | `ca.zerotohero.app` | `pro` (non-consumable) | ✅ Live since 2023 |
| GO Legacy — "Language Player GO" | App Store | `ca.zerotohero.go` | `pro_go` (non-consumable) | ✅ Shipped 2024-07; being replaced |
| New mobile — "Language Player 3" | App Store (replaces GO) | `ca.zerotohero.go` | `pro_go` | ✅ Configured; ASC-verified 2026-08-10 |
| New mobile — "Language Player 3" | Google Play (new launch) | `ca.zerotohero.go` | ⬜ Play Billing product TBD | ⬜ Not started |

Key facts:

- The GO listing's product is **`pro_go`** ("Lifetime Pro Account",
  Non-Consumable, Approved). The new iOS app keeps the GO bundle ID and
  product, so existing GO buyers can restore.
- Classic's `pro` belongs to `ca.zerotohero.app` and is a separate product.
- The backend cannot distinguish which app sent a receipt — it does not need
  to; it validates against Apple and grants lifetime.

### Apple receipt validation

- `APPLE_SHARED_SECRET` env var (`zerotohero-python-server/.env`, gitignored)
  — account-level, works for every bundle under the developer account.
- `app_in_app_purchase.py` validates with `bundle_id = 'ca.zerotohero.go'`
  (updated 2026-08-10) via `inapppy`'s `AppStoreValidator`; sandbox/live
  retry is automatic (`auto_retry_wrong_env_request = True`).
- Always grants **lifetime** (`type=lifetime`, `payment_processor=app-store`);
  only the `transaction_id` is stored.

### GO Legacy lesson

The old GO app shipped with `react-native-iap` and product `pro_go`; the SDK 57
migration removed it (`b6fe809`) and left `IOSPaymentMethods.tsx` as a stub.
The new app does **not** copy Classic's `pro` — it uses the GO listing's
`pro_go`, which is the only product visible under `ca.zerotohero.go`.

---

## Flows

### Stripe — card, WeChat, Alipay

1. `GET /stripe-prices` → plan cards (USD prices + CNY payment links).
2. Card: `POST /create-stripe-checkout-session` → Stripe Checkout URL.
   WeChat/Alipay: open the CNY Stripe Payment Link directly.
3. `checkout.session.completed` webhook → grant/update subscription row.
4. User lands on `/go-pro-success`, which polls `/user-subscription`.

### PayPal (lifetime only)

1. `POST /create-paypal-order` → PayPal order.
2. Buyer approves → `POST /paypal_checkout_success` with `order_id`.
3. Backend captures/verifies via Orders v2 and grants lifetime.

### Apple IAP (lifetime, iOS)

1. `connectAsync()` to the payment queue.
2. `purchaseItemAsync("pro_go")` → Apple payment sheet.
3. Receipt → `POST /in_app_purchase_success { user_id, receipt }`.
4. On success: `finishTransactionAsync()` → refresh subscription → success screen.
5. Restore: `getPurchaseHistoryAsync()` → validate each receipt via the same
   endpoint (idempotent).

Nuxt reference (`PurchaseiOS.vue`) → mobile (`expo-in-app-purchases`):

| Nuxt (`@ionic-native/in-app-purchase-2`) | Mobile (`expo-in-app-purchases`) |
|---|---|
| `register([{ id: "pro", type: NON_CONSUMABLE }])` | `InAppPurchases.connectAsync()` |
| `order("pro")` | `InAppPurchases.purchaseItemAsync("pro_go")` |
| `.approved()` → `product.verify()` | Handled by StoreKit |
| `product.transaction.appStoreReceipt` | Purchase result contains receipt |
| `POST /in_app_purchase_success` | Same endpoint, same payload |
| `product.finish()` | `finishTransactionAsync()` |

### Subscription state

`GET /user-subscription?user_id=X` → `SubscriptionContext` (mobile) /
`useSubscription` (web). Derived state: `isPro`, `planType`, `isLifetime`,
`isExpired`, `willAutoRenew`, `daysUntilExpiry`. Expired rows render as free.

### Renewal & cancellation

- Stripe renewals arrive as `invoice.paid` webhooks; expiry recomputes
  monthly +32d / annual +367d.
- Cancel at period end: `POST /cancel-subscription-at-end-of-period` (Stripe
  only). Auto-renewing subscriptions block new purchases until cancelled
  (Option A, SPEC-054).

See ARCH-022 for the full as-built flow diagrams.

---

## Backend API

| Endpoint | Method | Purpose |
|---|---|---|
| `/stripe-prices` | GET | Parsed `prices.csv` (regular + sale) |
| `/user-subscription` | GET | Current subscription for a user |
| `/create-stripe-checkout-session` | POST | Create Stripe Checkout session, return URL |
| `/stripe_checkout_success` | GET | Stripe success callback |
| `/webhook-stripe-checkout-session-completed` | POST | Initial-purchase grant |
| `/webhook-stripe-subscription-invoice-paid` | POST | Renewal grant |
| `/create-paypal-order` | POST | Create PayPal order (Orders v2) |
| `/paypal_checkout_success` | GET | Verify/capture + grant lifetime |
| `/in_app_purchase_success` | POST | Apple receipt validation + grant |
| `/cancel-subscription-at-end-of-period` | POST | Cancel Stripe auto-renew |
| `/admin/update_or_add_subscription` | POST | Admin grant/change |
| `/admin/check_user_subscription` | GET | Admin lookup |

---

## Edge cases & states

| State | Handling |
|---|---|
| Active subscription | "Current Plan" badge, expiry, cancel button |
| Lifetime | Lifetime badge, no expiry, no cancel |
| Auto-renewing | "Auto-renews in X days"; after cancel, "Cancels on X" |
| Expired | Expired badge + renew; re-purchase allowed |
| iOS non-IAP plans | Monthly/annual gated with "Only lifetime available on iOS" |
| Sale active | Banner + discounted lifetime price |
| Price fetch fails | Fall back to hardcoded defaults, retry |
| Subscription fetch fails | Treat as free tier; retry on next mount |
| Stripe Checkout fails | Error + retry button |
| IAP fails / receipt invalid | Error (keep receipt for support) |
| IAP restore finds nothing | "No purchases to restore" |
| Same Apple ID, multiple devices | `restorePurchases()` + backend idempotency |

---

## Implementation status

Implemented (see SPEC-048 checklist / SPEC-054 for verification):

- Shared subscription/price utilities and web `useSubscription` hook
- Mobile `SubscriptionContext` + subscription-aware profile/go-pro UI
- Stripe card + WeChat/Alipay on web and mobile
- Apple IAP (`pro_go`) with restore on mobile
- Cancel-at-period-end on web and mobile
- Sale pricing on Classic and mobile

Open work:

- **Web sale UI** — price helpers exist; banner/discount display still missing
- **Web direct PayPal** — currently links to Classic
- **Play Billing (Android)** — blocked on new Play Developer account + billing
  setup; web-checkout is the launch stopgap
- **Store-policy cleanup** — remove in-app browser checkout from iOS (and
  eventually Android) so the apps only use store billing in-app
- **Mobile IAP sandbox verification** — SPEC-054 Phase 4 (A1/A2)

---

## Prerequisites

1. **Apple App Store** — done: the GO listing's `pro_go` (Non-Consumable,
   Approved) is reused; no new product needed. Classic's `pro` is untouched.
2. **IAP dependency** — `expo-in-app-purchases` installed in `apps/mobile`
   (SDK 57 compatible).
3. **PayPal for web** — optional `@paypal/react-paypal-js`; link-to-Classic
   works until direct integration lands.
4. **Google Play** — no Play listing exists yet (developer account was deleted
   after a failed business-info renewal). Before Play Billing:
   create the Play account, create the app under `ca.zerotohero.go`, configure
   the billing product, build the AAB, and roll through test tracks.
5. **Env vars** (`zerotohero-python-server/.env`, gitignored):
   `APPLE_SHARED_SECRET`, `STRIPE_TEST_KEY`, `STRIPE_LIVE_KEY`,
   `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `DIRECTUS_TOKEN`/Supabase equivalents.

---

## Backward compatibility

- Classic and existing subscriptions are unaffected.
- Backend endpoints are shared and unchanged.
- The new mobile app inherits the GO listing's bundle + IAP product, so
  existing GO buyers keep restore continuity.

---

## References

- ARCH-015 — payment method constraints
- ARCH-022 — as-built payment/subscription/MailerLite architecture
- ADR-0013 — app store strategy & naming
- SPEC-048 — mobile release plan (QA + stores)
- SPEC-054 — subscription & payment testing
- Stripe test mode docs · PayPal Orders v2 docs · Apple StoreKit docs
