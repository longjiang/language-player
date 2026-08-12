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
| Google Play Billing | lifetime | — | — | — | ⬜ planned (blocked on LP3 app + Play Billing product; account verified) |

Legend: ✅ supported · 🟡 partial (link-out / not yet direct) · ⬜ planned ·
🚫 intentionally not offered in-app (use the website).

### Today (2026-08-10)

| Payment method | Classic | Web | Mobile iOS | Mobile Android |
|---|---|---|---|---|
| Stripe credit card | ✅ | ✅ | 🚫 in-app — buy on website | 🚫 in-app — buy on website; Play Billing later |
| WeChat Pay | ✅ | ✅ | 🚫 in-app — buy on website | 🚫 in-app — buy on website; Play Billing later |
| Alipay | ✅ | ✅ | 🚫 in-app — buy on website | 🚫 in-app — buy on website; Play Billing later |
| PayPal | ✅ | 🟡 links to Classic | 🚫 in-app — buy on website | 🚫 in-app — buy on website; Play Billing later |
| Apple IAP | ✅ | — | ✅ | — |
| Google Play Billing | — | — | — | ⬜ not implemented |

Per-platform notes:

- **Classic** — full set: Stripe card, WeChat, Alipay, PayPal (lifetime), and
  Apple IAP (`pro`, lifetime). Legacy; stays live as "Language Player 2" on
  both iOS and Android.
- **Web** — Stripe card, WeChat, Alipay for all plans. PayPal currently links
  out to Classic; direct PayPal is planned. Sale UI is still missing.
- **Mobile iOS** — only lifetime is selectable; monthly/annual are gated off
  (store policy). Apple IAP is the only in-app payment path; Stripe card /
  WeChat / Alipay / PayPal are website payments (SPEC-054 Phase 3 cleanup).
- **Mobile Android** — no in-app payment methods today; users buy on the
  website (SPEC-054 Phase 3 cleanup). Play Billing is the target in-app
  method once the "Language Player 3" app and billing product exist (the
  Play account is verified).

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

### App identifiers and IAP products (CANONICAL — keep in sync everywhere)

> This table is the single source of truth for which public app uses which
> identifier and IAP product. If anything contradicts it (specs, ADRs,
> code comments), fix the contradiction — do not edit this table to match.

| App | Store | Identifier | IAP product | Status |
|---|---|---|---|---|
| Classic — "Language Player 2" | App Store | `ca.zerotohero.app` | `pro` (non-consumable) | ✅ Live since 2023 |
| Classic — "Language Player 2" | Google Play | `ca.zerotohero.app` | — | ✅ Live |
| GO Legacy — "Language Player GO" | App Store | `ca.zerotohero.go` | `pro_go` (non-consumable) | ✅ Shipped 2024-07; being replaced |
| New mobile — "Language Player 3" | App Store (replaces GO) | `ca.zerotohero.go` | `pro_go` | ✅ Configured; ASC-verified 2026-08-10 |
| New mobile — "Language Player 3" | Google Play (new listing, existing account) | `ca.zerotohero.go` | ⬜ Play Billing product TBD | ⬜ Not started |
| Web — `apps/web` | browser | — (no IAP) | — | ✅ Stripe card / WeChat / Alipay / PayPal |

Key facts:

- The GO listing's product is **`pro_go`** ("Lifetime Pro Account",
  Non-Consumable, Approved). The new iOS app keeps the GO bundle ID and
  product, so existing GO buyers can restore.
- Classic's `pro` belongs to `ca.zerotohero.app` and is a separate product.
- Classic "Language Player 2" is live on **both** the App Store and Google
  Play under `ca.zerotohero.app`. The Play Developer account is **verified
  (2026-08-11)** — it was never deleted; the business-info renewal lapsed,
  and reverification has now been completed.
- **Both iOS apps stay public**, so the backend accepts receipts from
  **both** bundles: `ca.zerotohero.go` (new mobile) and
  `ca.zerotohero.app` (Classic). Apple's response identifies the receipt's
  own bundle, so the backend does not need a client-supplied flag — it tries
  each bundle and grants lifetime on the first success.

### Apple IAP validation (receipt + StoreKit 2 JWS)

- `APPLE_SHARED_SECRET` env var (`zerotohero-python-server/.env`, gitignored)
  — account-level, works for every bundle under the developer account.
- **Legacy receipts (Classic):** `app_in_app_purchase.py` validates with
  `bundle_id = 'ca.zerotohero.go'`
  **and** `bundle_id = 'ca.zerotohero.app'` (both public iOS apps) via
  `inapppy`'s `AppStoreValidator`, trying `.go` first then `.app`; sandbox/
  live retry is automatic (`auto_retry_wrong_env_request = True`).
- **StoreKit 2 JWS (new mobile, 2026-08-11):** `expo-iap` purchases via
  StoreKit 2, which does not reliably produce the legacy receipt file
  (sandbox `Request Canceled` / empty `appStoreReceiptURL`). The app now
  POSTs the signed transaction (`jws`, from `purchase.purchaseToken`) to
  `/in_app_purchase_success`; `app_store_jws.py` verifies the ES256/RS256
  signature against the `x5c` certificate chain anchored to Apple Root CA
  G3 (`data/apple-certs/`), then checks `bundleId` / `productId` /
  `transactionId` / `environment`. No shared secret or Apple call-back is
  needed for the JWS path.
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

1. `initConnection()` → register `purchaseUpdatedListener` /
   `purchaseErrorListener`.
2. `requestPurchase({ request: { apple: { sku: "pro_go" } } })` → Apple sheet.
3. On purchase event → `POST /in_app_purchase_success { user_id, jws }`
   (JWS = `purchase.purchaseToken`; legacy `receipt` sent too when available).
4. On success: `finishTransaction({ purchase, isConsumable: false })` →
   refresh subscription → success screen.
5. Restore: `getAvailablePurchases()` (no `AppStore.sync()` — it fails in
   sandbox without a store session) → validate each JWS via the same endpoint
   (idempotent).

Nuxt reference (`PurchaseiOS.vue`) → mobile (`expo-iap`):

| Nuxt (`@ionic-native/in-app-purchase-2`) | Mobile (`expo-iap`) |
|---|---|
| `register([{ id: "pro", type: NON_CONSUMABLE }])` | `initConnection()` |
| `order("pro")` | `requestPurchase({ request: { apple: { sku: "pro_go" } } })` |
| `.approved()` → `product.verify()` | Handled by StoreKit |
| `product.transaction.appStoreReceipt` | `purchase.purchaseToken` (JWS) + best-effort receipt |
| `POST /in_app_purchase_success` | Same endpoint; body now `{ user_id, jws }` |
| `product.finish()` | `finishTransaction({ purchase, isConsumable: false })` |

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
- Stripe card + WeChat/Alipay on web (mobile moved to the website per
  store policy)
- Apple IAP (`pro_go`) with restore on mobile
- Cancel-at-period-end on web and mobile
- Sale pricing on Classic and mobile
- Store-policy cleanup: non-IAP payment UI removed from the mobile app
  (SPEC-054 Phase 3) — iOS is Apple IAP only, Android buys on the website

Open work:

- **Web sale UI** — price helpers exist; banner/discount display still missing
- **Web direct PayPal** — currently links to Classic
- **Mobile IAP sandbox verification** — SPEC-054 Phase 3 (A1/A2)
- **Play Billing (Android)** — SPEC-054 Phase 3: Play Console developer
  billing setup (account verified 2026-08-11), product configuration,
  implementation, and test-track testing; buy-on-website is the interim path

---

## Prerequisites

1. **Apple App Store** — done: the GO listing's `pro_go` (Non-Consumable,
   Approved) is reused; no new product needed. Classic's `pro` is untouched.
2. **IAP dependency** — `expo-iap` installed in `apps/mobile`
   (SDK 57 compatible).
3. **PayPal for web** — optional `@paypal/react-paypal-js`; link-to-Classic
   works until direct integration lands.
4. **Google Play** — the existing developer account is **verified
   (2026-08-11)**. Classic "Language Player 2" is live on Google Play under
   `ca.zerotohero.app`. Before Play Billing: create the new app under
   `ca.zerotohero.go`, configure the billing product, build the AAB, and
   roll through test tracks.
5. **Env vars** (`zerotohero-python-server/.env`, gitignored):
   `APPLE_SHARED_SECRET`, `STRIPE_TEST_KEY`, `STRIPE_LIVE_KEY`,
   `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `DIRECTUS_TOKEN`/Supabase equivalents.

---

## Backward compatibility

- Classic and existing subscriptions are unaffected.
- Backend endpoints are shared and unchanged; the IAP validator accepts
  receipts from both public iOS apps (`ca.zerotohero.go` and
  `ca.zerotohero.app`), so Classic IAP keeps working.
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
