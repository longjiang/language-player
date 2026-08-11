# SPEC-054 — Subscription & Payment Testing

## Metadata

- **Spec ID**: SPEC-054
- **Feature**: Subscription & payment testing across `zerotohero-nuxt` (Classic), `apps/web` and `apps/mobile`, covering subscription endpoints, all payment methods, renewal, trial, cancellation, and MailerLite sync
- **Status**: draft
- **Created**: 2026-08-08
- **Scope**: All three active frontends + admin console + `zerotohero-python-server` payment, subscription, auth, and MailerLite paths (no production data should be touched by these tests)
- **Related specs**: [SPEC-014 — Subscription & Payment System](014-subscription-payment-system.md) · [SPEC-025 — Payment E2E Testing (archived)](archive/025-payment-e2e-testing.md) · [SPEC-048 — Mobile Release Plan](048-mobile-release-plan.md) · [SPEC-023 — Mobile E2E Testing](023-mobile-e2e-testing.md) · [SPEC-039 — Full Database Migration (Supabase)](039-full-database-migration-supabase.md) · [SPEC-060 — Admin Console User Management](060-admin-console-user-management.md) · [SPEC-041 — Delete Account](041-delete-account.md)
- **Supersedes**: [SPEC-025 — Payment E2E Testing (archived)](archive/025-payment-e2e-testing.md)
- **Related architecture/ADRs**: [ARCH-015 — Payment Methods & Renewal Strategy](../arch/015-payment-methods-plan-support.md) · [ARCH-022 — Payment, Subscription & MailerLite](../arch/022-payment-subscription-mailerlite.md) · [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md) · [ADR-0027 — Defer Automated E2E — Human QA](../adr/0027-defer-automated-e2e-human-qa.md) · [ADR-0032 — Admin Console App](../adr/0032-admin-console-app.md)

---

## Overview

This spec defines how to test every payment method on every frontend that supports it, using each provider's official test mode / sandbox. Provider-hosted UI flows are **human-run** (per ADR-0027 and SPEC-025) because they cross third-party payment UIs — Stripe Checkout, Stripe Payment Links, PayPal, or the App Store — that cannot be automated reliably with Maestro today.

Since the Directus → Supabase migration (SPEC-039), the backend pipeline has new failure surfaces the provider sandboxes alone do not cover: Supabase JWT auth, legacy Directus id remapping, backfilled `user_subscriptions` rows (originally with no auto-increment ids; converted to identity 2026-08-09), webhook idempotency, renewal/trial edge cases, and MailerLite sync. Section [2.6](#26-backend-auth--data-layer-tests-supabase-migration) adds a backend/data-layer matrix for those; most rows can be automated with mocks against a disposable Supabase schema, while the provider-hosted UI flows in 2.1–2.5 stay human-run.

**Platform limitations** (enforced by the providers, not by us):

- **Apple In-App Purchase** exists only on iOS. It is lifetime-only and
  non-consumable: Classic uses `pro` (`ca.zerotohero.app`); `apps/mobile`
  uses `pro_go` (`ca.zerotohero.go`, the GO listing's product).
- **Google Play Billing** is **not implemented** in any frontend. Android users pay through the web-based flows (Stripe / WeChat / Alipay). The Play test-lab setup below is documented for when Billing is implemented, per SPEC-014.
- **Mobile iOS** — Apple IAP (`pro_go`) is the store-compliant in-app method.
  Lifetime is also offered via browser checkout today (policy risk); the
  SPEC-014 target is IAP-only in-app, with card/WeChat/Alipay/PayPal moved to
  the website.
- **PayPal** is implemented as a direct checkout only in Classic. Web and Mobile offer a link out to Classic's go-pro page instead.
- **WeChat Pay / Alipay** are processed through Stripe Payment Links (CNY, one-time only) on all three frontends.
- **Stripe Credit Card** is the only method supporting recurring monthly/annual subscriptions (Stripe webhook `invoice.paid`).

### Current payment matrix (2026-08-10)

| Payment method | Classic | Web (`apps/web`) | Mobile iOS | Mobile Android |
|---|---|---|---|---|
| Stripe Credit Card (USD) | ✅ Checkout (vue-stripe) | ✅ backend Checkout session | ⚠️ browser checkout in-app (lifetime only; policy risk) | ✅ web checkout (stopgap) |
| WeChat Pay (CNY) | ✅ Payment Link | ✅ Payment Link | ⚠️ browser checkout in-app (lifetime only; policy risk) | ✅ web checkout (stopgap) |
| Alipay (CNY) | ✅ Payment Link | ✅ Payment Link | ⚠️ browser checkout in-app (lifetime only; policy risk) | ✅ web checkout (stopgap) |
| PayPal (lifetime) | ✅ direct button | ⬜ links to Classic | 🚫 hidden on iOS (IAP available) | 🟡 links to Classic (stopgap) |
| Apple IAP (lifetime) | ✅ `pro` | N/A (browser) | ✅ `pro_go` (`expo-in-app-purchases`) | — |
| Google Play Billing | N/A | N/A | — | ⬜ not implemented |

**Target (SPEC-014):** in-app mobile payments are store billing only — Apple
IAP on iOS (`pro_go`), Play Billing on Android (planned). Stripe card /
WeChat / Alipay / PayPal move to the website; the same backend grant applies
once the user logs in. The current iOS browser checkout and Android
web-checkout stopgap are policy risks / launch stopgaps to revisit before
store submission.

### Key implementation files

| Area | Files |
|---|---|
| Classic UI | `zerotohero-nuxt/components/PaymentMethods.vue`, `PurchaseStripe.vue`, `PurchasePayPal.vue`, `PurchaseiOS.vue` |
| Web UI | `apps/web/src/app/[l1]/[l2]/go-pro/page.tsx`, `apps/web/src/lib/prices.ts` |
| Mobile UI | `apps/mobile/app/(tabs)/(me)/go-pro.tsx`, `apps/mobile/lib/iap.ts`, `apps/mobile/app/go-pro-success.tsx`, `apps/mobile/app/go-pro-error.tsx` |
| Backend | `zerotohero-python-server/routes/payments.py`, `app_stripe_checkout.py`, `app_paypal_checkout.py`, `app_in_app_purchase.py`, `data/prices.csv` |
| Backend data layer | `zerotohero-python-server/routes/subscriptions.py`, `utils_subscription.py`, `auto_verify_email.py`, `utils_user_data.py` |
| MailerLite | `zerotohero-python-server/utils_mailer_lite.py` |
| Admin | `zerotohero-python-server/routes/admin_users.py`, `apps/admin` |
| Subscription state | `apps/web/src/providers/subscription-provider.tsx`, `apps/web/src/hooks/use-subscription.ts`, `apps/mobile/contexts/SubscriptionContext.tsx`, `apps/mobile/app/(tabs)/(me)/profile.tsx` |

---

## 1. Environment Setup (per provider)

### 1.1 Stripe (credit card + WeChat/Alipay Payment Links)

Stripe's test mode is a full sandbox: separate API keys, prices, payment links, webhook signing secrets, and cards. Nothing in test mode charges a real card. Reference: <https://docs.stripe.com/testing/overview>.

**Backend (`zerotohero-python-server`)**

1. Start the backend with `STRIPE_TEST_MODE=1` so it uses `STRIPE_TEST_KEY`
   and test price IDs/links from `prices.csv` (env-driven since 2026-08-10).
2. Set environment variables (e.g. in the run script / shell):
   - `STRIPE_TEST_KEY` — test secret key `sk_test_...` from the Stripe Dashboard → Developers → API keys.
   - Keep `APPLE_SHARED_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` unset or irrelevant for Stripe-only runs.
3. Restart the Flask process (the user's responsibility — do not manage the server process from Codex).
4. Sanity check: `GET /stripe-prices?test=true` returns the test price IDs (`price_1PSNOW...`, etc.) and `test_payment_link` URLs; `GET /stripe-prices` (no query) returns live IDs.

> ✅ **Resolved 2026-08-10:** the backend toggle is env-driven
> (`STRIPE_TEST_MODE=1`) and webhook secrets are env-only
> (`STRIPE_CHECKOUT_WEBHOOK_SECRET`, `STRIPE_INVOICE_WEBHOOK_SECRET`, or the
> shared `STRIPE_WEBHOOK_SECRET`); a missing secret fails closed with 500.

**Classic Nuxt**

1. In `zerotohero-nuxt/lib/utils/variables.js`, set `export const TEST = true`. This switches the publishable key to `pk_test_...`, the product to the test product, and appends `?test=true` to `/stripe-prices`.
2. Verify the go-pro page now shows the test prices and that clicking **Credit Card** opens a Stripe-hosted Checkout page with the `TEST MODE` badge.
3. Revert `TEST` to `false` after testing — never commit `TEST = true` (it would send test keys/prices to production users).

**Web (`apps/web`)**

1. Web uses the backend endpoint, so it picks up test mode from the backend's `stripe_test` flag automatically for checkout sessions and prices.
2. `apps/web/src/app/[l1]/[l2]/go-pro/page.tsx` has a `TODO: use test key in dev` on a live publishable key, but the page no longer uses that key for card entry (Checkout is Stripe-hosted), so no frontend change is required for Web card tests — just the backend flag. The TODO can be cleaned up while in here.

**Mobile (`apps/mobile`)**

1. Same as Web: mobile posts to `/create-stripe-checkout-session` and opens `session.url` in the browser/WebView, so the backend test flag is the only switch needed.
2. Note mobile passes `host: 'https://languageplayer.io'` to the backend, so after a successful test payment the redirect lands on **Classic's** `/go-pro-success` in the browser, not the app. Verify the subscription syncs back to the mobile app (see [Cross-app checks](#3-cross-app-checks)).

**Test cards** (from Stripe docs — all succeed unless noted):

| Card | Result to verify |
|---|---|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0002` | Card declined |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0000 0000 0119` | Processing error |
| `4000 0025 0000 3155` | Requires 3D Secure authentication |

Any future expiry, any CVC. Use the test email of your choice in Checkout.

**Webhooks (renewal + Payment Link completion)**

`checkout.session.completed` is how the backend learns about WeChat/Alipay Payment Link purchases (there is no return redirect for those — Stripe-hosted Payment Link pages show their own confirmation). `invoice.paid` handles Stripe subscription renewals.

Local forwarding with the Stripe CLI:

```bash
stripe listen --forward-to localhost:5001/webhook-stripe-checkout-session-completed \
  --forward-to localhost:5001/webhook-stripe-subscription-invoice-paid
```

The CLI prints a signing secret (`whsec_...`) — restart the backend with
`STRIPE_WEBHOOK_SECRET=<whsec>` (or the per-endpoint vars) before triggering
events. Trigger canned events with:

```bash
stripe trigger checkout.session.completed
stripe trigger invoice.paid
```

Alternatively, use the Dashboard → Developers → Webhooks → "Send test event" button.

### 1.2 WeChat Pay & Alipay (via Stripe Payment Links)

Reference: Stripe WeChat Pay docs (<https://docs.stripe.com/payments/wechat-pay/accept-a-payment>) and Alipay docs (<https://docs.stripe.com/payments/alipay/accept-a-payment>). Both are **single-use, one-time** payment methods — there is no recurring billing on these links by design (ARCH-015).

In test mode, each frontend uses the `test_payment_link` values from `prices.csv`:

| Plan | Test payment link |
|---|---|
| Monthly ¥73 | `https://buy.stripe.com/test_bIYcNgchLetRaaccMT` |
| Annual ¥653 | `https://buy.stripe.com/test_dR63cG5Tn3Pd3LObIQ` |
| Lifetime ¥1,227 | `https://buy.stripe.com/test_4gwdRk6Xr5XlfuwaEN` |

Steps:

1. Backend in test mode (`stripe_test = True`).
2. On Classic/Web/Mobile go-pro, select the plan and click **WeChat Pay** or **Alipay**; the app opens the test link with `?client_reference_id=<user_id>` appended.
3. In the Stripe-hosted page, choose WeChat Pay or Alipay. Stripe test mode shows a QR code; scanning it (or opening the hosted page) routes to a Stripe-hosted page that simulates authorizing the test payment.
4. Backend webhook `checkout.session.completed` fires and grants the subscription.
5. Because these are one-time links, there is **no auto-renewal**; verify the subscription is the one-time type (lifetime has no expiry; monthly/annual via Payment Link record the initial expiry only).

Note: Language Player does not use WeChat Pay's own sandbox (`https://pay.weixin.qq.com/.../xdc/apiv2sandbox`) or Alipay's sandbox (`https://openapi-sandbox.dl.alipaydev.com/gateway.do`) because the integration is entirely Stripe-hosted. Only if we ever move to direct native WeChat/Alipay integrations would those sandboxes become relevant.

### 1.3 PayPal (Classic direct checkout)

Reference: <https://developer.paypal.com/sandbox-testing/overview>. PayPal sandbox provides personal (buyer) and business (merchant) accounts and a separate API base URL (`https://api-m.sandbox.paypal.com`).

1. Create a **business** (merchant) sandbox account and a **personal** (buyer) sandbox account at <https://developer.paypal.com/developer/accounts>.
2. Set `PAYPAL_SANDBOX_CLIENT_ID` and `PAYPAL_SANDBOX_SECRET` env vars to the **sandbox business app's** credentials (the existing `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET` in `.env` are **live** credentials — do not overwrite them).
3. ✅ Backend sandbox switch implemented 2026-08-10: `PAYPAL_MODE=sandbox` makes `app_paypal_checkout.py` use `https://api-m.sandbox.paypal.com` plus the sandbox credentials; default stays live. (PayPal's Payments v1 API is deprecated — see Open Questions.)
4. ✅ Client ids + env moved out of source (2026-08-10): `PurchasePayPal.vue`
   now reads `PAYPAL_ENV`, `PAYPAL_SANDBOX_CLIENT_ID`, and `PAYPAL_CLIENT_ID`
   from `.env` (via `nuxt.config.js` env block; hardcoded fallbacks removed
   2026-08-10 — `PAYPAL_CLIENT_ID` is required on the Netlify production
   build, which has it set). Local sandbox testing: set `PAYPAL_ENV=sandbox`
   and `PAYPAL_SANDBOX_CLIENT_ID` in `zerotohero-nuxt/.env`, then restart
   Classic. **Never ship `PAYPAL_ENV=sandbox` in production.**
5. In Classic go-pro, choose Lifetime → PayPal, log in as the sandbox **buyer** account, approve the payment.
6. **Flow (Orders v2, implemented 2026-08-10):** the JS SDK button calls
   `POST /create-paypal-order` (backend creates `POST /v2/checkout/orders`),
   the buyer approves in the popup, then the client redirects to
   `{PYTHON_SERVER}/paypal_checkout_success?order_id=...&user_id=...&host=...`;
   the backend captures the order (`POST /v2/checkout/orders/{id}/capture`),
   verifies `status=COMPLETED`, and grants a **lifetime** subscription
   (`expires_on` null, `payment_processor = 'paypal'`); user lands on
   `/go-pro-success`. Retry-safe: an already-captured COMPLETED order is
   verified via GET and grants idempotently.
7. Cancel test: abandon/close the PayPal approval dialog → `onCancel` shows
   the cancelled message; no subscription record.

Web and Mobile only link to `https://languageplayer.io/go-pro` for PayPal — in test mode that link goes to **production Classic**, so the PayPal flow cannot be safely end-tested from Web/Mobile without a test build of Classic running on a test host. Record this limitation rather than clicking the production link.

### 1.4 Apple In-App Purchase (iOS)

References:
- <https://developer.apple.com/help/app-store-connect/test-in-app-purchases/overview-of-testing-in-sandbox/>
- <https://developer.apple.com/documentation/storekit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox>

Setup:

1. In App Store Connect → Users and Access, create one or more **Sandbox Apple Accounts** (never your personal Apple ID).
2. On the test device, enable **Developer Mode** (Settings → Privacy & Security → Developer Mode) if running a development-signed build.
3. Sign in to the App Store / iTunes with the sandbox account (Settings → App Store → Sandbox Account, or the store sign-in prompt that appears on first sandbox purchase).
4. Build with a development signing certificate, or use a **TestFlight** build. IAP works in the sandbox on simulators too, but Apple recommends a physical device for reliability (and SPEC-025 requires it). Purchases in sandbox are **not charged**.
5. The product is the non-consumable `pro_go` (lifetime) on the GO listing
   (`ca.zerotohero.go`) — the new app replaces the GO app and inherits its
   product. Classic's `pro` belongs to `ca.zerotohero.app` and is not used
   here. Verified in App Store Connect 2026-08-10: GO listing has
   "Lifetime Pro Account" / `pro_go` / Non-Consumable / Approved.

Run the tests per [2.4 Apple IAP](#24-apple-iap-ios-only).

> ✅ **Resolved 2026-08-10:** `app_in_app_purchase.py` now validates with
> `bundle_id = 'ca.zerotohero.go'` and the app uses the GO listing's
> non-consumable product `pro_go` — the new app replaces the GO listing in
> the App Store and keeps the GO bundle ID + product (SPEC-048 / ADR-0013
> revised). Classic's `ca.zerotohero.app` / `pro` IAP is no longer validated
> by this endpoint.

### 1.5 Google Play Billing (future)

Reference: <https://developer.android.com/google/play/billing/test>.

Google Play Billing is **not implemented** in any frontend (SPEC-014 / SPEC-048). When it lands, test with:

1. **License testers** — Play Console → Setup → License testing → add tester Gmail accounts. License testers bypass real charges.
2. **Test payment instruments** — Play Console test accounts get "Test card" instruments (always approves, always declines, slow) and can use the payment methods page to simulate outcomes.
3. **Test tracks** — publish an internal/closed test build and test purchases from it; test purchases are not refundable but also not charged to the account.
4. **Accelerated renewals** — Play's sandbox speeds up subscriptions (monthly renews ~5 min, yearly ~30 min, max 6 renewals) — useful for renewal/webhook testing. Play Billing Lab covers trials, price changes, and paused subscriptions.

### 1.6 Supabase migration & backend test setup

The backend rows in [2.6](#26-backend-auth--data-layer-tests-supabase-migration) target `zerotohero-python-server` and the Supabase tables behind it (`public.user_subscriptions`, `public.user_id_map`, `public.user_acquisition`, `auth.users`). **Never run these against production.** Use a disposable Supabase project or schema with seeded fixtures:

1. **Backfilled subscription data** — seed `user_subscriptions` with a known max id (e.g. `30669`, matching the Directus backfill scale) and a mix of auth-UUID owners plus legacy Directus numeric owners (mapped through `user_id_map`).
2. **User fixtures** — one migrated user (legacy Directus id + `user_id_map` → auth UUID), one post-GoTrue user (exists only in `auth.users`), one admin (`app_metadata.is_admin = true`), and one regular user.
3. **JWT fixtures** — valid user token, expired/invalid token, admin token, non-admin token.
4. **External-provider mocks** — Stripe API/Checkout/Webhook signing, PayPal Payments API, Apple `verifyReceipt`, and MailerLite API (both success and failure responses, plus `MAILER_LITE_TOKEN` unset).
5. **Concurrency harness** — two threads/processes calling the same grant path for the id-allocation and webhook-race tests.

Run these through the Flask test client (extend the existing `test_app.py` / `test_admin_users.py` patterns). The provider-hosted UI rows (S/W/P/A) remain human-run.

---

## 2. Test Matrix (concrete steps per app + method)

Preconditions for every row: a fresh or disposable test user account (Mary/Bob per AGENTS.md), backend running in the relevant mode, and no production charge made.

### 2.1 Stripe Credit Card

| # | App | Plan | Steps | Expected result |
|---|---|---|---|---|
| S1 | Classic | Monthly | `TEST=true` → go-pro → Credit Card → `4242...` | Stripe test-mode Checkout completes; redirect through `/stripe_checkout_success` → `/go-pro-success`; subscription row: `type=monthly`, `payment_processor=stripe`, `payment_customer_id` set, expiry ≈ +32 days |
| S2 | Classic | Annual | Same flow, `4242...` | Success; `type=annual`, expiry ≈ +367 days |
| S3 | Classic | Lifetime | Same flow, `4242...` | Success; `type=lifetime`, `expires_on=null` |
| S4 | Classic | Monthly | `4000 0000 0000 0002` | Checkout shows "card declined"; no subscription row created; user stays on Stripe page |
| S5 | Classic | Monthly | `4000 0000 0000 9995` | Insufficient funds error; no subscription |
| S6 | Classic | Monthly | `4000 0000 0000 0119` | Processing error; no subscription |
| S7 | Classic | Monthly | `4000 0025 0000 3155` | 3DS challenge appears; complete it → success; abort it → failure, no subscription |
| S8 | Classic | Monthly | Cancel/close Checkout | Redirect to `/go-pro` (cancel URL); no subscription row |
| S9 | Web | Monthly | go-pro → Credit Card → `4242...` | Backend session created; Stripe test Checkout; success redirects to web `/go-pro-success` (host passed by web); Pro unlocks |
| S10 | Web | Annual + declined card | Repeat S9 with annual price and `4000...0002` | Annual success; declined shows error and no grant |
| S11 | Mobile | Monthly | go-pro → Credit Card → `4242...` (opens in browser) | Test Checkout succeeds; mobile app's subscription state flips to Pro after refetch (may need pull-to-refresh / re-mount) |
| S12 | Mobile | Annual + lifetime | `4242...` for each | Both grant; lifetime has no expiry |
| S13 | All | Renewal | With an active monthly test subscription, run `stripe trigger invoice.paid` (or wait for test-mode renewal) | Backend extends expiry via `invoice.paid` webhook; `/user-subscription` shows new expiry |
| S14 | All | Webhook auth | Send `checkout.session.completed` with wrong signature / no signature | Backend returns 400; no grant applied |
| S15 | All | Price parity | Open `/stripe-prices` and `/stripe-prices?test=true` | Test endpoint returns test IDs/links; live endpoint returns live IDs/links; amounts match `prices.csv` (10/90/169 USD; 73/653/1227 CNY; sale lifetime 84.50 USD / 608 CNY if `SALE` enabled) |

### 2.2 WeChat Pay / Alipay (Stripe Payment Links, CNY)

| # | App | Plan | Steps | Expected result |
|---|---|---|---|---|
| W1 | Classic | Monthly | Select Monthly → WeChat Pay link | Opens `https://buy.stripe.com/test_bIYcNgchLetRaaccMT?client_reference_id=<user>`; authorize the simulated test payment; `checkout.session.completed` webhook grants `type=monthly` (one-time) |
| W2 | Classic | Annual → Alipay | Same with annual test link / Alipay | Granted `type=annual` |
| W3 | Classic | Lifetime → WeChat or Alipay | Lifetime test link `test_4gwdRk6Xr5XlfuwaEN` | Granted `type=lifetime`, no expiry |
| W4 | Classic | Any | Cancel/abandon before authorizing | No webhook, no subscription; user returns to Stripe-hosted page |
| W5 | Web | Monthly/Annual/Lifetime | Open Web go-pro → WeChat/Alipay link | Same as W1–W3; `client_reference_id` present in URL; grant lands on the same user |
| W6 | Mobile | Monthly/Annual/Lifetime | Open Mobile go-pro → WeChat/Alipay link | Same; mobile subscription state updates after refetch |
| W7 | All | Recurrence check | Inspect the created subscription after a monthly/annual Payment Link purchase | `payment_processor=stripe` with **no** `payment_customer_id` / no Stripe subscription — verify renewal is **not** possible (one-time only) |

### 2.3 PayPal (Classic direct; Web/Mobile link out)

| # | App | Steps | Expected result |
|---|---|---|---|
| P1 | Classic | Sandbox preconditions (1.3) → Lifetime → PayPal → log in as sandbox buyer → approve | `create-paypal-order` → JS SDK popup → `/paypal_checkout_success?order_id=...`; backend captures + verifies `COMPLETED`; lifetime granted: `payment_processor=paypal`, `expires_on=null`, no `payment_customer_id`; lands on `/go-pro-success` |
| P2 | Classic | Approve with a **declined/failed** sandbox payment (or force an unapproved state) | Redirect to `/go-pro-error?paypal_order_id=...`; no subscription row — **foregone 2026-08-10** (capture-failure path mocked) |
| P3 | Classic | Cancel the PayPal dialog | `paypalPaymentStatus = 'cancelled'` warning on go-pro; no subscription — **foregone 2026-08-10** (same cancel semantics as S8; client-side only) |
| P4 | Classic | Purchase twice with two sandbox buyers | Second purchase updates/keeps one lifetime record per user (no duplicate charge without consent; verify idempotency) — **foregone 2026-08-10** (`payment_id` unique + `ON CONFLICT`; already-captured COMPLETED order verified via GET, mocked) |
| P5 | Web | Lifetime → PayPal link | Opens `https://languageplayer.io/go-pro` (**production Classic**) — do **not** complete; document that Web has no sandbox PayPal path until a test Classic host exists |
| P6 | Mobile | Lifetime → PayPal link (non-iOS) | Same as P5 — link out only; skip completion in test |

### 2.4 Apple IAP (iOS only)

| # | App | Steps | Expected result |
|---|---|---|---|
| A1 | Classic (Capacitor) | Sandbox account → go-pro → Lifetime → "Pay & Upgrade to Pro Now" → confirm in sandbox dialog | Receipt POSTed to `/in_app_purchase_success`; backend validates via Apple sandbox (`auto_retry_wrong_env_request=True` handles test/live endpoints); success → `/go-pro-success`; `type=lifetime`, `payment_processor=app-store`, `payment_id=transaction_id` |
| A2 | Mobile (Expo) | Sandbox account → go-pro → Apple IAP button → confirm | `expo-in-app-purchases` listener gets the purchase; receipt POSTed to backend; on success `finishTransactionAsync(purchase, false)`; app pushes `/go-pro-success`; Pro state updates |
| A3 | Both | Tap **Restore Purchases** after reinstall / second device with same sandbox account | Restored purchase list non-empty; receipts re-validated; Pro re-granted; no duplicate transaction |
| A4 | Both | Cancel the sandbox confirmation dialog | Purchase callback errors (`USER_CANCELED`); app returns to go-pro with an error message; no grant |
| A5 | Both | Purchase `pro` again on an account that already has it (non-consumable) | App Store returns "You're already subscribed" / no new charge; backend must not create a second lifetime row (verify idempotency) |
| A6 | Mobile | Run on Android | IAP button **hidden** (`IAP_AVAILABLE = Platform.OS === 'ios'`); monthly/annual plans show the iOS gate message; lifetime still offers Stripe/WeChat/Alipay |
| A7 | Backend | Post a bogus receipt (`user_id` + garbage string) | `type: 'error'` response from Apple validation; no subscription granted |

> ✅ A1/A2 bundle-ID question resolved 2026-08-10: the backend validates
> `ca.zerotohero.go` receipts (the new app replaces the GO listing; see
> [1.4](#14-apple-in-app-purchase-ios)).

### 2.5 Google Play Billing

No rows yet — method is not implemented. When Play Billing lands (SPEC-014), add rows here for: license-tester purchase, always-declines instrument, internal-track purchase, subscription renewal acceleration, and restore/entitlement sync, using the setup in [1.5](#15-google-play-billing-future).

### 2.6 Backend, Auth & Data-Layer Tests (Supabase Migration)

These cover the pipeline behind the UI flows: JWT auth, the backfilled `user_subscriptions` table, webhook processing/idempotency, renewal, free trial, cancellation, MailerLite sync, and the admin API. They are listed as concrete cases so they can be automated (see [2.7](#27-automation-notes)); the setup is in [1.6](#16-supabase-migration--backend-test-setup).

#### 2.6.1 Auth & JWT

| # | Case | Expected result |
|---|---|---|
| B1 | `GET /user-subscription` without an Authorization header | 401 |
| B2 | `GET /user-subscription` with an invalid or expired JWT | 401 |
| B3 | `GET /user-subscription` with a valid GoTrue JWT for a migrated user | Returns the remapped row (auth-UUID owner); legacy Directus id resolves via `user_id_map` |
| B4 | Admin routes without a token | 401 |
| B5 | Admin routes with a non-admin JWT (`is_admin=false`) | 403 |
| B6 | Legacy `/admin/update_or_add_subscription` and `/admin/check_user_subscription` | Still function for Classic; server-side gating intentionally absent (ADR-0032) |

#### 2.6.2 Subscription storage & id assignment (backfilled table)

| # | Case | Expected result |
|---|---|---|
| B10 | Seed `user_subscriptions` with max id `30669` (Directus backfill scale), then insert a new subscription | New row gets id `30670` |
| ⚠️ B11 | Delete the current max-id row, then insert | New id comes from the identity sequence (not `max(remaining)+1`); no collision or constraint error — **deferred**: needs disposable-schema harness |
| ⚠️ B12 | Two concurrent `add_subscription` calls for different users | Both succeed with unique ids (identity sequence; manual `max(id)+1` / advisory lock removed 2026-08-09) — **deferred**: needs disposable-schema harness |
| ⚠️ B13 | Concurrent first purchase for the same user (success callback + webhook race) | Exactly one subscription row — partial unique `payment_id` index + `ON CONFLICT` added 2026-08-09 — **deferred**: needs disposable-schema harness |
| ⚠️ B14 | Same Stripe event / `payment_id` delivered twice sequentially | Second delivery updates the existing row (`get_subscription_by_payment_id` + `ON CONFLICT`); no duplicate row — **deferred**: needs disposable-schema harness |
| B15 | Backfilled row with a legacy Directus numeric owner id | Resolved through `user_id_map`; `/user-subscription` and admin detail return the canonical auth UUID |
| B16 | Post-GoTrue user with no `user_id_map` entry | Found via `auth.users` email lookup (`_user_by_email` / `_email_for_user`) |
| B17 | `POST /acquisition_survey` for a fresh user | Row saved **without an explicit id**; verifies `user_acquisition.id` has a real default (SPEC-039 M4 — fixed 2026-08-09) |

#### 2.6.3 Webhooks & idempotency

| # | Case | Expected result |
|---|---|---|
| B20 | Valid `checkout.session.completed` with `payment_status=paid` | Grant created/updated; `client_reference_id` → owner; `payment_customer_id` and `payment_email` stored |
| B21 | `checkout.session.completed` with `payment_status != paid` | 400; no grant |
| B22 | `checkout.session.completed` missing `client_reference_id` | 400 `Missing client_reference_id`; no grant |
| B23 | Payment Link webhook with `session.customer = null` | Grant still succeeds via `customer_details.email`; `payment_customer_id` null; MailerLite group mapping verified |
| B24 | `invoice.paid` for a known Stripe customer | Expiry set to now + 32d (monthly) / 367d (annual); `payment_date` and notes updated |
| B25 | `invoice.paid` with an unknown customer id | 400 “Subscription not found”; no crash |
| B26 | `invoice.paid` when the local row has no owner but has `payment_email` | Owner resolved from email; renewal succeeds |
| B27 | `invoice.paid` with an unknown price id / type | 400 `Unknown subscription type`; no crash |
| B28 | Webhook with an invalid or missing Stripe signature | 400; no grant |
| B29 | Webhook with an unexpected event type | 400 |

#### 2.6.4 Renewal

| # | Case | Expected result |
|---|---|---|
| B30 | Monthly renewal | `expires_on` ≈ now + 32 days |
| B31 | Annual renewal | `expires_on` ≈ now + 367 days |
| B32 | Early renewal while the old expiry is later than now + 32d | Documents current behavior: expiry resets to now + 32d (not stacked on the old expiry) |
| B33 | Renewal after cancellation (`payment_customer_id` null) | Defensive: no row found by customer id → 400; no accidental re-grant |

#### 2.6.5 Free trial & email verification

| # | Case | Expected result |
|---|---|---|
| B40 | New user signs up and verifies through GoTrue (`/auth/register` → `/auth/verify-email` or confirmation link) | Trial row created (`type=trial`, `status=active`, `expires_on` = +7d) and MailerLite subscriber created with `auth_user_id` = auth UUID (TEXT field) and group `trial` — hook implemented 2026-08-10 (SPEC-039 M1/M2); live smoke still pending |
| B41 | Re-verify the same email | No second trial; no duplicate row |
| B42 | User already has an active monthly or lifetime subscription | No trial granted |
| B43 | User has an expired subscription | No trial granted — any existing subscription row (active, lifetime, or expired) blocks the trial |
| B44 | Wrong verification code | 400; no activation and no trial |
| B45 | Banned email | Dropped 2026-08-10: the legacy hardcoded banned-email list was removed with M5; GoTrue has no app-level ban concept — re-add only if real email bans are needed |
| B46 | Acquisition source submitted with verification | Covered by the separate `/acquisition_survey` endpoint (B17) — current clients submit acquisition right after registration, not in the verify payload |
| B47 | Trial expiry | `/user-subscription` returns the expired trial row; frontends compute free; gates close (covered by the expired-row test with `type=trial`) |
| B48 | MailerLite down during verification | Verification still returns 200 and the trial is granted; MailerLite failure is logged (hook + endpoint tests) |
| B49 | Legacy `/verification_email` / `/verification_email/verify` routes | Resolved 2026-08-10: routes and `app_email_verification.py` removed (SPEC-039 M5); `verify_email@zerotohero.ca` support pipe migrated to GoTrue admin + `grant_trial_and_enroll_mailerlite` |

#### 2.6.6 Cancellation & subscription management

| # | Case | Expected result |
|---|---|---|
| B50 | Cancel a valid Stripe subscription | Stripe `cancel_at_period_end=true`; local `payment_customer_id` cleared; MailerLite group `disengaged`; `/user-subscription` no longer advertises auto-renew |
| B51 | Cancel with a missing/invalid customer id | Defined 4xx (currently likely 500 on a Stripe error — fix or explicitly accept) |
| B52 | Cancel a lifetime subscription / no customer id | API does not clear the lifetime row — only the Stripe customer association is removed; missing `customer_id` → 400 |
| B53 | `/go-pro-success` polling | Backend covered with a mocked paid `/stripe_checkout_success` (grant + redirect) and `/user-subscription` returning the active row; ~20s browser polling loop verified with spinner. Finding (2026-08-10): the old timeout fallback claimed "payment received/processing" with no evidence — now a neutral "couldn't confirm subscription yet" state with a spinner during polling |
| B54 | Delete account while an auto-renewing subscription is active | Blocked with 409 until cancelled (SPEC-041); expired or lifetime rows do not block |
| B55 | Delete account (no active auto-renew) | GoTrue user removed; `user_subscriptions`, `user_acquisition`, and `user_id_map` rows removed; MailerLite subscriber GDPR-forgotten via `/api/subscribers/{id}/forget`, best-effort and never blocking deletion (SPEC-039 M6, resolved 2026-08-10) |

#### 2.6.7 MailerLite sync

| # | Case | Expected result |
|---|---|---|
| B60 | New subscriber creation payload | `email`, `name`, `last_name`, `role` sent; `auth_user_id` = auth UUID (TEXT field) for GoTrue users; legacy numeric `user_id` only when a Directus id is known; group `trial` when a trial was granted |
| B61 | `add_subscription` | Subscriber assigned to `trial` / `monthly` / `annual` / `lifetime` matching the row type |
| B62 | `update_subscription` type change | Subscriber moved to the new group (e.g. monthly → lifetime) |
| B63 | Monthly/annual row without `payment_customer_id` | Assigned `disengaged` |
| B64 | `delete_subscription` | Assigned `disengaged` |
| B65 | MailerLite API failure | Grant still committed; failure logged; no rollback |
| B66 | Subscriber not found during assignment | No crash; grant still succeeds |
| B67 | `MAILER_LITE_TOKEN` empty | No crash; sync fails safe |
| B68 | Admin grant/change/remove | MailerLite group updated through the shared `utils_subscription` path |

#### 2.6.8 Admin API

| # | Case | Expected result |
|---|---|---|
| B70 | Grant `monthly` / `annual` / `lifetime` / `trial` without `expires_on` | Auto expiry +30d / +365d / null / +7d |
| B71 | Grant with an explicit `expires_on` | Preserved |
| B72 | PATCH type change without `expires_on` | Expiry recomputed; with `expires_on`, preserved |
| B73 | DELETE subscription | Row removed; MailerLite `disengaged` |
| B74 | Search by email / payment email / payment id / Stripe customer id / legacy Directus id | Finds the user (SPEC-060) |

#### 2.6.9 Endpoint validation & error paths

| # | Case | Expected result |
|---|---|---|
| B80 | `POST /create-stripe-checkout-session` missing `price_id` | 400 |
| B81 | `POST /create-stripe-checkout-session` missing `user_id` | 400 |
| B82 | `POST /create-stripe-checkout-session` with an invalid price/mode | 400 for invalid `mode` or malformed `price_id` |
| B83 | `GET /stripe_checkout_success` missing `session_id` / `user_id` / `host` | 302 redirect to `/go-pro-error?error=missing_params` (host defaults when absent) |
| B84 | `GET /stripe_checkout_success` with an unpaid session | Redirect to error page; no grant |
| B85 | `GET /stripe-prices` live vs test | IDs/links/amounts match `prices.csv` (10/90/169 USD; 73/653/1227 CNY; sale lifetime 84.50/608; legacy 6/59) |
| B86 | `GET /paypal_checkout_success` missing `pay_id` / `user_id` / `host` | 302 redirect to `/go-pro-error?error=missing_params`; no crash |
| B87 | PayPal unapproved state | Redirect to error; no grant |
| B88 | `POST /in_app_purchase_success` missing `user_id` / `receipt` | 400 `Missing user_id or receipt`; no grant |
| B89 | `GET /user-subscription` with no rows | `{"subscription": null}` |
| B90 | `GET /user-subscription` with only an expired row | Returns the expired row; frontends treat it as free |

### 2.7 Automation notes

- B1–B6, B10–B17, and B20–B90 can be automated in CI with mocked Stripe / PayPal / Apple / MailerLite and a disposable Supabase schema. The existing `test_app.py` / `test_admin_users.py` cover a few of these shallowly (several are marked “to be implemented” or compare against stale recorded fixtures); most rows are missing.
- Concurrency rows (B12, B13) need a threaded Flask test client or two parallel processes against the same schema.
- Provider-hosted UI rows (S/W/P/A) remain human-run per ADR-0027.

---

## 3. Cross-app checks

| # | Check | Steps | Expected result |
|---|---|---|---|
| C1 | Price parity | Load go-pro on all three apps in test mode | Same plans/amounts (USD + CNY); sale lifetime price appears only when `SALE`/`status=sale` applies consistently |
| C2 | Subscription sync | Purchase monthly via Stripe on Web → open Mobile with same user | Mobile shows Pro with matching expiry; profile shows processor `stripe` |
| C3 | Purchase on iOS device → same account on Android/Web | Buy IAP lifetime on iOS → log into Web | Lifetime Pro active everywhere; profile shows `app-store` processor |
| C4 | Existing subscription not overwritten | Have an active annual subscription → complete a second purchase of the same plan | Same row updated, no duplicate. **Expiry resets to now + 32/367d** (B32 — intentional: purchases happen after expiry, and each period is a fresh same-day cadence with a 1-day grace; stacking is not a supported flow). |
| C5 | Free tier gates after payment | Before purchase, transcript shows first 10 lines + 5 word-example hits; after grant, full transcript + up to 500 hits (50-hit fast default; Settings → Subtitles Search toggle is Pro-only, greyed out for free users) | Gates flip with subscription state on all frontends |
| C6 | Cancel at period end (Stripe only) | Cancel subscription in Stripe test Dashboard or via cancel flow | `cancel_at_period_end` set; user keeps Pro until expiry, then falls back to free |
| C7 | Success/error screens | Force each failure path (declined card, cancelled PayPal, bogus receipt, abandoned Payment Link) | `/go-pro-error` or inline error shown; no Pro grant; no stuck loading state |

---

## 4. Pre-Launch Phased Testing Plan

Order matters: payments write through the subscription endpoints, so the
backend subscription/data-layer tests come **first** and are the launch gate.
Do not start provider payment E2E until Phase 0 is green.

### Phase 0 — Subscription endpoints & data layer (blocking, do first)

**Goal**: prove `/user-subscription`, auth, storage, free trial, cancellation,
admin, and MailerLite behavior before any payment is made.

**Status: ⚠️ In progress** — Phase 0 mock suites pass (51 subscription +
23 admin + 21 auth + 14 webhook tests) and all 22 schema checks are green; M1–M4/M6 code/schema gaps
are fixed (trial + MailerLite on `/auth/verify-email`, idempotency key,
cascade FKs); manual smoke and the remaining B-rows (disposable-schema
concurrency) are pending.

Scope:

**✅ Green (automated & passing):**

- ✅ B1–B6 — auth/JWT: 401s, valid-token lookup, admin gating
- ✅ B10 — `add_subscription` id allocation (identity column; manual
  `max(id)+1` / advisory lock removed)
- ✅ B17 — acquisition-survey insert omits `id`; `user_acquisition.id` is
  identity (M4 fixed); endpoint test passes against live Supabase
- ✅ B40–B43 — free-trial helper logic + GoTrue verify-email hook
  (`grant_trial_and_enroll_mailerlite`; any existing subscription blocks)
- ✅ B20–B29 — Stripe webhook processing: paid checkout grants with
  `client_reference_id` → owner and customer/email storage; unpaid + missing
  `client_reference_id` → 400 no grant; Payment Link with `customer=null`
  still grants via `customer_details.email`; invoice.paid renewal/unknown
  customer/unknown price → defined 400s; invalid payload/signature/unexpected
  event → 400
- ✅ B30–B33 — renewal expiry recompute (monthly +32d, annual +367d, early
  renewal resets rather than stacks, cancelled customer → 400 no re-grant)
- ✅ B52 — lifetime cancel keeps the row (only `payment_customer_id` is
  cleared); missing customer id → 400
- ✅ B54 — delete-account returns 409 while an active auto-renewing
  subscription exists; expired/lifetime rows don't block
- ✅ B44 — wrong verification token_hash returns 400 and grants no trial
- ✅ B46–B48 — acquisition persists via `/acquisition_survey` (B17); expired
  trial row returned by `/user-subscription`; MailerLite down during
  verification still returns 200 with the trial granted
- ✅ B50 — cancel at period end (mocked Stripe)
- ✅ B51 — cancel with unknown Stripe customer (`resource_missing`) is a no-op
  200; rate-limited/unreachable Stripe returns 429/502; other Stripe errors
  return 400
- ✅ B61–B65 — MailerLite group assignment on add/update/delete + failure isolation
- ✅ B60 — MailerLite new-subscriber payload: `auth_user_id` UUID for GoTrue
  users, legacy numeric `user_id` preserved when known
- ✅ B70–B73 — admin expiry helpers (B70–B72) + admin remove (B73, existing
  `test_admin_users.py`)
- ✅ B74 — admin search: basic query, admin gating, and SQL coverage for
  payment-id / customer-id / legacy Directus id / payment-email search
  (test_admin_users.py)
- ✅ B80–B81 — checkout session validation (missing `price_id` / `user_id`)
- ✅ B82–B88 — invalid price/mode (400), missing success-callback params
  (302 error redirect), unpaid Stripe session (no grant), price parity vs
  `prices.csv`, PayPal missing params/unapproved (no grant), IAP missing
  fields (400)
- ✅ B53 backend — mocked paid `/stripe_checkout_success` grants the
  subscription and redirects to `/go-pro-success`; `/user-subscription`
  returns the active row — no real payment needed
- ✅ B89–B90 — `/user-subscription` no-rows and expired-row behavior
- ✅ B49 — legacy `/verification_email*` routes removed (SPEC-039 M5); the
  migrated `verify_email@zerotohero.ca` support pipe is covered by
  `test_auto_verify_email.py`
- ✅ B66–B67 — MailerLite subscriber-not-found and empty-token paths fail
  safe (no crash; grant still succeeds)
- ✅ B68 — admin grant/change/remove routes trigger MailerLite group sync
  through the shared `utils_subscription` path
- ✅ B15 — legacy Directus numeric owner ids resolve through `user_id_map`
  to the canonical auth UUID before insert
- ✅ B16 — post-GoTrue users with no `user_id_map` row are found through
  `auth.users` (`_user_by_email` / `_email_for_user`)
- ✅ B53 — `/go-pro-success` browser polling loop verified 2026-08-10
  (backend mocked + neutral fallback + spinner during the ~20s poll)

**⬜ Not yet done:**

- ⚠️ B11–B14 — id reuse after delete, concurrent inserts, first-purchase race,
  duplicate webhook delivery — **deferred to a later phase**: requires the
  disposable-schema harness (the unique `payment_id` index and `ON CONFLICT`
  already exist; mocked coverage for the surrounding logic is green)
- ✅ B55 — delete-account MailerLite GDPR-forget + failure isolation
  (`test_auth.py`; GoTrue delete still runs when MailerLite is down)
- ✅ Manual smoke: admin grant/change/remove — completed 2026-08-10 (also
  covered by mocked B68/B70–B74)
- ✅ Manual smoke: Mary/Bob `/user-subscription` — completed 2026-08-10
  (backend smoke + UI pass: Mary returns the active trial row, Bob returns
  `{"subscription": null}`)
- ✅ Manual smoke: cancel flow — completed 2026-08-10 (unknown-customer
  no-op 200 against the live server, missing `customer_id` → 400, DB
  unchanged; the full Stripe-dashboard cancel stays in Phase 1)

Exit criteria:

- ✅ All Phase 0 rows pass, or known gaps are explicitly accepted/fixed —
  the only remaining rows are B11–B14, explicitly deferred to the
  disposable-schema harness (M1–M4/M6 fixed; manual smoke complete; B53
  verified; the live-Stripe cancel test passes).
- ✅ **Phase 0 is green — payment testing may begin** (B11–B14 remain
  deferred to the disposable-schema harness).

**Programmatic coverage (batch 1, 2026-08-09):**

- ✅ `zerotohero-python-server/test_phase0_subscriptions.py` — 51 mocked unit/API
  tests: auth/JWT (B1–B6), `/user-subscription` states (B3/B89/B90), checkout
  validation (B80–B82), acquisition survey (B17), id allocation + MailerLite
  group sync (B10/B60–B65), MailerLite new-subscriber payload (`auth_user_id`
  UUID + legacy numeric `user_id`), subscriber-not-found/empty-token fail-safe
  (B66–B67), legacy Directus remap + post-GoTrue auth.users lookup (B15–B16),
  free-trial logic + GoTrue verify-email hook (B40–B43), cancellation
  (B50–B52), mocked paid/unpaid success callbacks (B53 backend/B84),
  admin expiry helpers (B70–B72), and payment validation/price parity
  (B82–B88).
- ✅ `zerotohero-python-server/test_admin_users.py` — 23 tests including
  admin grant/change/remove MailerLite group sync through the shared
  `utils_subscription` path (B68).
- ✅ `zerotohero-python-server/test_auth.py` — 21 auth-proxy tests including
  `/auth/verify-email` trial + MailerLite enrollment on token-hash, email+token,
  valid-access-token paths, wrong-token rejection with no trial (B44),
  MailerLite-down verification success (B48), delete-account block for active
  auto-renew (B54), and delete-account MailerLite GDPR-forget (B55).
- ✅ `zerotohero-python-server/test_phase0_webhooks.py` — 14 mocked Stripe
  webhook tests (B20–B33): checkout.session.completed grant/unpaid/missing
  reference/Payment-Link-no-customer, invoice.paid monthly/annual/early/
  unknown-customer/no-owner/unknown-price/cancelled, invalid payload,
  invalid signature, and unexpected event type.
- ✅ `zerotohero-python-server/test_auto_verify_email.py` — 4 tests covering
  the migrated DreamHost support pipe: GoTrue admin confirm
  (`email_confirm: true`) + trial/MailerLite enrollment, user-not-found,
  GoTrue rejection, and unreachable GoTrue (B49/M5).
- ✅ `zerotohero-python-server/test_phase0_schema.py` — 22 read-only Supabase
  schema checks, all passing: identity on all 19 converted tables, id defaults,
  cascade FKs to `auth.users` (M6), and the unique `payment_id` index (M3).
- ✅ Existing `test_app.py` payment tests now pass:
  `test_cancel_subscription_at_end_of_period_endpoint` (unknown Stripe
  customer is a no-op 200), `test_acquisition_survey_endpoint` (M4 fixed;
  fixture updated from the legacy Directus duplicate-key shape), Stripe/IAP
  success callbacks with legacy-id resolution.

**Live smokes (disposable user, completed 2026-08-10):**

- ✅ GoTrue free-trial + MailerLite live smoke — disposable user
  `lp-smoke-1786398358@zerotohero.ca`: trial row `active` (+7d) and MailerLite
  subscriber in `trial` with the correct `auth_user_id` UUID.
- ✅ Live MailerLite group movement — admin grant/change/delete moved the
  subscriber through `monthly` → `annual` → `lifetime` → `disengaged`
  (verified via the MailerLite connect API).
- ✅ Live delete-account cascade (B55) — `DELETE /auth/delete-account` returned
  200; `auth.users`, `user_subscriptions`, `user_acquisition` rows gone;
  MailerLite lookup 404 (GDPR-forgotten).
- ⚠️ Concurrency/idempotency against a real schema (B12–B14) — still deferred:
  needs the disposable-schema harness (local Postgres, Supabase preview
  branch, or a dedicated temp schema).

### Phase 1 — Classic (Nuxt) payment E2E — first frontend

**Goal**: prove each payment method through the most complete legacy frontend
before touching web/mobile.

- S1–S8 — Stripe credit card (monthly/annual/lifetime, declined, 3DS, cancel)
- W1–W4 — WeChat Pay / Alipay via Payment Links
- P1–P4 — PayPal lifetime direct checkout + failure/cancel/idempotency
- S13/S14 — renewal webhook + webhook auth
- C4 (existing subscription not overwritten), C6 (cancel), C7 (error screens)

**IAP is deliberately deferred to Phase 4.**

#### Phase 1 runbook — Stripe test-mode setup (do once)

1. **Backend test mode** — `app_stripe_checkout.py` now honors
   `STRIPE_TEST_MODE=1` (added 2026-08-10; default remains live). Restart
   Flask with that env var set:

   ```bash
   STRIPE_TEST_MODE=1 python3.10 app.py   # or add it to the gunicorn env
   ```

   Verify: `curl "http://127.0.0.1:5001/stripe-prices?test=true"` returns
   `price_1PSNOW…` test ids and `…test_bIY…` payment links; the no-`test`
   variant still returns live ids.
2. **Classic in test mode** — `TEST` is hardcoded to `false` in
   `zerotohero-nuxt/lib/utils/variables.js`. For local E2E only, set it to
   `true` (uncommitted; revert before deploying). This switches Classic's
   publishable key, product, and price fetch to Stripe test mode. Classic is
   reference-only for us, so this is a manual one-line local edit.
3. **Servers** — Classic dev (`npm run dev` in `zerotohero-nuxt/`) with
   `PYTHON_SERVER=http://127.0.0.1:5001/` in its `.env`; Flask running in
   test mode from step 1.
4. **Test user** — log in as an existing account or create a disposable one
   (see Phase 0 live-smoke pattern). Use a fresh user for declined/cancel
   rows so no stray subscriptions accumulate.
5. **Local webhook forwarding (required for Payment Links / W rows)** — the
   Stripe test account's registered webhook endpoints point at a `loca.lt`
   tunnel, not local Flask. Forward events locally instead:

   ```bash
   stripe listen --forward-to localhost:5001/webhook-stripe-checkout-session-completed
   ```

   Copy the printed `whsec_…` signing secret and restart Flask with
   `STRIPE_WEBHOOK_SECRET=<whsec>` (env-only; missing secret → 500, fail
   closed). Also note the dashboard-created CNY Payment
   Links redirect to the **production** success page; for local W tests use
   the local-redirect test link created 2026-08-10:
   `https://buy.stripe.com/test_7sY7sL97ba825OzgTrbo40b`
   (`plink_1U32LDG5EbMGvOafOEppFX9W`), appended with
   `?client_reference_id=<user-uuid>`.
6. **PayPal sandbox (P rows)** — sandbox accounts exist
   (`ken-facilitator@chinesezerotohero.com` business,
   `ken-buyer@chinesezerotohero.com` buyer). Put the business app's sandbox
   Client ID/Secret in `PAYPAL_SANDBOX_CLIENT_ID` / `PAYPAL_SANDBOX_SECRET`,
   restart Flask with `PAYPAL_MODE=sandbox`, and locally set
   `PurchasePayPal.vue` `env="sandbox"` (revert before deploy).

#### S1–S8 — Stripe credit card (Classic)

Flow for every success row: `/go-pro` → pick the plan → Credit Card →
Stripe Checkout → pay with the listed test card → backend
`/stripe_checkout_success` → `/go-pro-success` page.

| # | Plan | Card | Steps | Expected |
|---|---|---|---|---|
| S1 | Monthly | `4242 4242 4242 4242` | Full flow | `/go-pro-success` shows Pro; DB row `type=monthly`, `status=active`, `payment_processor=stripe`, `payment_customer_id` set, `expires_on` ≈ now + 32d; MailerLite group `monthly` |
| S2 | Annual | `4242 4242 4242 4242` | Full flow | Same, `type=annual`, expiry ≈ now + 367d |
| S3 | Lifetime | `4242 4242 4242 4242` | Full flow | Same, `type=lifetime`, `expires_on=null` |
| S4 | Monthly | `4000 0000 0000 0002` | Full flow | Stripe shows "Your card was declined"; no subscription row; user stays on Checkout |
| S5 | Monthly | `4000 0000 0000 9995` | Full flow | "Insufficient funds" error; no row |
| S6 | Monthly | `4000 0000 0000 0119` | Full flow | "Processing error" (generic decline); no row |
| S7 | Monthly | `4000 0025 0000 3155` | Full flow; complete the 3DS challenge | Success + row as S1; repeat and **abort** the challenge → failure, no row |
| S8 | Monthly | any card | Start Checkout, then close/cancel | Redirect to `/go-pro` (cancel URL); no subscription row |

Verification per row:

- DB: `select type, status, expires_on, payment_processor, payment_customer_id from user_subscriptions where user_id = '<uuid>' order by id desc limit 1;`
- API: login + `GET /user-subscription` → expected type/expiry.
- MailerLite: after S1–S3 and S7-success, the subscriber's groups include
  the plan group — assigned to the **account email**, not the email typed in
  the Stripe form; after S4–S6/S7-abort/S8, no group change and no new row.
- Cleanup: delete the disposable user via `DELETE /auth/delete-account`
  (also GDPR-forgets MailerLite), or remove the subscription via admin.

#### Phase 1 progress

- ✅ S1 — Monthly success (2026-08-10): DB row `31139` = `status=active`,
  `type=monthly`, expiry ≈ +32d, `payment_customer_id` + test `payment_id`
  set; `/user-subscription` returns it; MailerLite `monthly` group assigned to
  the account email (Mary), not the Stripe form email.
- ✅ S2 — Annual success (2026-08-10): DB row `31140` = `status=active`,
  `type=annual`, expiry ≈ +367d (2027-08-12), `payment_customer_id` set;
  `/user-subscription` returns it; MailerLite `annual` group on the account
  email.
- ✅ S3 — Lifetime success (2026-08-10): DB row `31141` = `status=active`,
  `type=lifetime`, `expires_on=null`, `payment_customer_id` set;
  `/user-subscription` returns it; MailerLite `lifetime` group on the account
  email.
- ✅ S4 — Declined (2026-08-10): `4000 0000 0000 0002` shows "card declined"
  in Stripe; no subscription row created (DB count 0, `/user-subscription`
  null); MailerLite groups unchanged. (S1–S3 rows were manually removed
  after verification.)
- ✅ S5 — Insufficient funds (2026-08-10): `4000 0000 0000 9995` shows
  "insufficient funds" in Stripe; no subscription row created
  (DB count 0, `/user-subscription` null).
- ✅ S6 — Processing error (2026-08-10): `4000 0000 0000 0119` shows a
  processing error in Stripe; no subscription row created (DB count 0,
  `/user-subscription` null).
- ✅ S7 — 3DS (2026-08-10): `4000 0025 0000 3155` — completed challenge
  granted a monthly row (`31142`, `status=active`, ≈ +32d, MailerLite
  `monthly`); failed challenge (after cancel) created no new row (count 1);
  cancel cleared `payment_customer_id` and added MailerLite `disengaged`.
- ✅ S8 — Cancel/close Checkout (2026-08-10): closing the Stripe window
  redirects back to `/go-pro`; no subscription row created (DB count 0,
  `/user-subscription` null).
- ✅ **S1–S8 complete** — Stripe credit-card batch on Classic is done.
- ✅ W1 — Monthly WeChat Pay via test Payment Link (2026-08-10): completed
  the simulated test payment; `checkout.session.completed` webhook granted
  row `31145` (`status=active`, `type=monthly`, ≈ +32d,
  `payment_customer_id=null`, webhook notes); `/user-subscription` returns
  it; MailerLite `monthly` on the account email. Required local webhook
  forwarding (`stripe listen` + `STRIPE_WEBHOOK_SECRET`) and the
  local-redirect test link — see Phase 1 runbook setup.
- ✅ W2–W4 — foregone from live runs (2026-08-10, documented): the Payment
  Link → webhook → grant chain is proven by W1; plan/expiry mapping by
  S2/S3; cancel/abandon by S8; and all three CNY test links (monthly,
  annual, lifetime) resolve HTTP 200. Alipay's hosted completion itself was
  not exercised — it relies on Stripe-hosted checkout.
- ✅ S13 — Renewal (2026-08-10): created a real Stripe test subscription
  (monthly price, test customer `cus_V38q6Pow7afUWf`) and replayed the
  `invoice.paid` event against the running Flask with a valid signature →
  200, row `31145` expiry extended to now + 32d (reset, not stacked). Live
  delivery needed `stripe listen` running; it had been stopped, so the
  replay covered the handler path (live webhook delivery itself proven by W1).
  **Production simulated renewal also verified 2026-08-10 (zero money):**
  after deploying the env-secret webhook code, a signed `invoice.paid` event
  posted to `pythonvps.zerotohero.ca/webhook-stripe-subscription-invoice-paid`
  returned 200 and extended row `31149` to now + 32d; bogus signature → 400;
  disposable user cleaned up.
- ✅ S14 — Webhook auth (2026-08-10): bogus `Stripe-Signature` → 400
  ("No signatures found…"); missing signature → 400 ("Unable to extract
  timestamp…"); no grant applied (row count unchanged).
- ✅ W rows complete — W1 live + W2–W4 foregone (see above).
- ✅ P1 — PayPal lifetime success (2026-08-10, sandbox buyer approved):
  `create-paypal-order` → JS SDK popup → `/paypal_checkout_success?order_id=…`
  → backend captured/verified `COMPLETED`; row `31145` =
  `status=active`, `type=lifetime`, `expires_on=null`,
  `payment_processor=paypal`, `payment_id` = PayPal order id; MailerLite
  `lifetime` group on the account email.
- ✅ P2–P4 — foregone from live runs (2026-08-10, documented): capture-failure
  → error redirect is mocked; cancel is client-side (same as S8); idempotent
  capture-retry (`422` → GET COMPLETED) and `payment_id` `ON CONFLICT` are
  mocked/covered by `test_paypal_orders_v2.py` + M3/B14 groundwork. PayPal's
  hosted declined/cancel UI itself relies on PayPal.
- ✅ C4 — expectation updated 2026-08-10: second purchase resets expiry to
  now + 32/367d (same row, no duplicate; B32/product rule). Same-row update
  and reset are covered by the S13 renewal run + unit tests.
- ✅ C6 — cancel at period end verified live (2026-08-10): Stripe Dashboard
  cancel → `cancel_at_period_end=true`; cancel endpoint 200 → local
  `payment_customer_id` cleared; row `31146` stays `monthly`/active;
  `/user-subscription` still returns it until expiry. Post-expiry free
  fallback covered by B90.
- ✅ C7 — success/error screens verified (2026-08-10): declined/insufficient/
  processing/3DS-fail/abandoned-checkout via S4–S8, WeChat success via W1,
  PayPal success via P1, PayPal-cancel UI shows the cancelled message with no
  row, and the `/go-pro-success` neutral fallback (B53) is fixed.
- ✅ **Phase 1 complete** — Classic Nuxt payment E2E: S1–S8, W1–W4
  (W1 live, W2–W4 foregone), P1–P4 (P1 live, P2–P4 foregone), S13/S14,
  C4/C6/C7.

### Phase 2 — Web (`apps/web`) payment E2E

- S9–S10 — Stripe credit card
- W5 — WeChat Pay / Alipay
- P5 — PayPal link-out (sandbox limitation; document only, do not complete)
- S13/S14, C1 (price parity), C5 (gates), C7 — C2 (subscription sync)
  deferred to Phase 5

#### Phase 2 runbook — Web Stripe (S9–S10)

Prerequisites (2026-08-10):

- Web dev server on a non-Classic port (Classic owns :3000), e.g.
  `npm run dev -w apps/web -- -p 3001` with `NEXT_PUBLIC_STRIPE_TEST=true` in
  `apps/web/.env` (web now fetches test prices/publishable key when set).
- Backend already in test mode (`STRIPE_TEST_MODE=1`, `STRIPE_WEBHOOK_SECRET`
  if Payment Links are used).
- Log in as Mary on the web app.

| # | Plan | Card | Steps | Expected |
|---|---|---|---|---|
| S9 | Monthly | `4242 4242 4242 4242` | Web `/go-pro` → Monthly → Credit Card → Stripe test Checkout | Redirect back to web `/go-pro-success`; Pro unlocks; DB row `monthly`, `status=active`, ≈ +32d; MailerLite `monthly` on Mary |
| S10a | Annual | `4242 4242 4242 4242` | Same, Annual plan | `type=annual`, expiry ≈ +367d |
| S10b | Monthly | `4000 0000 0000 0002` | Same, declined card | Stripe decline; no row; web shows error screen |

Verification: same DB/API/MailerLite checks as S1–S3; web `/go-pro-success`
polling is already covered by B53.

Coverage notes for the rest of Phase 2:

- W5 — same Payment Link path as W1; web CNY buttons use the test links when
  `NEXT_PUBLIC_STRIPE_TEST=true` (covered by W1 + link-resolution checks;
  local-redirect link applies).
- P5 — document-only (links to production Classic; do not complete).
- S13/S14 — already verified in Phase 1 (backend/account-level, app-agnostic).
- C1 — price parity covered by B85/S15 + a visual comparison of web go-pro
  amounts vs `prices.csv`.
- C2 — deferred to Phase 5 (full cross-device sync matrix); the same-backend
  row was confirmed during S9.
- C5 — verified 2026-08-10: before the grant a video page shows first 10
  transcript lines/5 word-example hits; after the grant, full transcript +
  up to 500 hits (default 50, Pro-only toggle in Settings → Subtitles
  Search).
- C7 — web success/error pages render correctly (S9/S10 cover both paths;
  neutral fallback from B53).

#### Phase 2 progress

- ✅ C1 — price parity verified 2026-08-10 (local + production both match
  `prices.csv`; 10 plans).
- ✅ S9 backend preflight — `/create-stripe-checkout-session` with the web
  payload returns a valid test Checkout URL (no payment).
- ✅ S9 — Web monthly success (2026-08-10): web go-pro → Stripe test checkout
  `4242…` → row `31147` = `status=active`, `type=monthly`, expiry ≈ +32d,
  `payment_customer_id` set, web success-callback notes; `/user-subscription`
  returns it; MailerLite `monthly` on Mary.
- ✅ S10a — Web annual success (2026-08-10): upgrading monthly → annual
  updated the same row (`31147`) to `annual`, expiry ≈ +367d (reset, per
  C4/B32), new test `payment_id` + `payment_customer_id`; MailerLite
  `annual` added.
- ✅ S10b — Web declined card (2026-08-10): `4000 0000 0000 0002` shows the
  decline; no subscription row created (count 0, `/user-subscription` null).
- ✅ **S9–S10 complete** — web Stripe credit-card batch done.
- ✅ W5/P5/S13/S14 — covered/foregone per notes above.
- ✅ C7 — web success/error screens covered by S9/S10 + B53 neutral fallback.
- ✅ C5 — verified 2026-08-10: video-page gates flip with subscription state
  (10 transcript lines + 5 hits free → full transcript + 500 hits Pro).
- ⬜ C2 — deferred to Phase 5 (full cross-device subscription sync matrix).

### Phase 3 — Mobile (`apps/mobile`) payment E2E

- S11–S12 — Stripe credit card
- W6 — WeChat Pay / Alipay
- P6 — PayPal link-out (document only)
- C2 (subscription sync), C5 (gates), C6 (cancel), C7; verify mobile
  subscription state refreshes after purchase
- Scope note: current mobile payments are the browser web-checkout stopgap
  (SPEC-014). Play Billing is out of scope until implemented.

### Phase 4 — IAP last (Classic + mobile)

**Why last**: IAP is lifetime-only and sandbox testing needs Apple tooling —
it is not required for the core launch gate. (The bundle-ID blocker was
resolved 2026-08-10.)

- A1–A7 — Classic + mobile purchase, restore, cancel, bogus receipt
- C3 — cross-platform lifetime sync
- ✅ Bundle-ID question resolved 2026-08-10 — backend validates
  `ca.zerotohero.go`; A2 can now run
- ✅ IAP product `pro_go` confirmed in App Store Connect 2026-08-10
  (Non-Consumable, Approved) — matches `apps/mobile/lib/iap.ts`
- ⬜ Store-policy cleanup before submission: remove in-app browser checkout
  from iOS so IAP is the only in-app purchase path (SPEC-014 target)

### Phase 5 — Cross-app & launch gate

- C2 (subscription sync) — deferred from Phase 2 — plus the C1–C7 full
  matrix on all three frontends
- Re-run B1–B90 against a disposable schema after any backend change
- SPEC-039 sunset-readiness payment items: paid-event regression, MailerLite
  enrollment for new GoTrue users, delete-account cleanup

### 4.5 Execution cadence (post-launch / regression)

| Trigger | Scope | Device | Estimated time |
|---|---|---|---|
| Before every App Store submission | A1–A7 + S1–S15 + W1–W7 + C1–C7 | Real iPhone (sandbox account) + simulators + browser | ~60 min |
| Before every web release | S9–S15 + W5–W7 + C1, C5, C7 | Browser (test backend) | ~25 min |
| After any payment backend change (`routes/payments.py`, `app_stripe_checkout.py`, `app_paypal_checkout.py`, `app_in_app_purchase.py`, `prices.csv`) | S1–S15, W1–W7, P1–P4, A1–A7 | As appropriate per change | ~45 min |
| After any Supabase/auth/data-layer change (`utils_subscription.py`, `routes/subscriptions.py`, `routes/admin_users.py`, `auto_verify_email.py`, `utils_mailer_lite.py`) | B1–B90 | CI/test schema (automated where possible) | ~30 min |
| Quarterly (renewal regression) | S13, C6 + test-mode renewals | Browser + real device | ~20 min |

---

## 5. Open Questions and Known Gaps

1. **Backend IAP bundle ID — resolved 2026-08-10:** `app_in_app_purchase.py`
   now validates with `bundle_id='ca.zerotohero.go'`, matching the new app's
   bundle (it replaces the GO listing per SPEC-048 / ADR-0013 revised). The
   app also uses the GO listing's IAP product `pro_go` (not Classic's `pro`).
   Classic's legacy `ca.zerotohero.app` IAP is no longer validated by this
   endpoint; if Classic IAP must be re-supported later, add a per-request
   bundle override.
2. **PayPal sandbox — backend resolved 2026-08-10:** `PAYPAL_MODE=sandbox`
   switches `app_paypal_checkout.py` to `https://api-m.sandbox.paypal.com` +
   sandbox credentials; default stays live. Classic's client still needs a
   temporary `env="sandbox"` edit for sandbox UI runs (revert before deploy).
   PayPal's Payments v1 API is deprecated; Orders v2 is now in use.
3. **Stripe test/live toggles — backend resolved 2026-08-10:**
   `STRIPE_TEST_MODE=1` switches keys/prices, and webhook secrets are
   env-only (`STRIPE_CHECKOUT_WEBHOOK_SECRET`, `STRIPE_INVOICE_WEBHOOK_SECRET`,
   or shared `STRIPE_WEBHOOK_SECRET`). Remaining: Classic
   `zerotohero-nuxt/lib/utils/variables.js` has `TEST = false` as a committed
   constant — keep it false in production; sandbox runs use a temporary edit
   (revert before deploy) or make it env-driven.
4. **Web/Mobile PayPal cannot be sandbox-tested** because they link to the production Classic go-pro page. Options: run a test Classic deployment on a test host and point the links there, or implement PayPal directly in Web/Mobile (SPEC-014).
5. **Google Play Billing is not implemented** — the sandbox guide in 1.5 is reference-only until SPEC-014 work lands.
6. **Payment Link purchases have no return redirect** — verification relies on webhooks. The test must confirm the `checkout.session.completed` event arrives with `client_reference_id` intact; if webhooks are down, grants silently fail.
7. **Automation** (SPEC-025's mock backend: `/mock-stripe-checkout`, `/mock-wechat-pay`, etc.) is still future work; provider-hosted UI rows remain human-run, but the backend/data-layer rows in 2.6 are automatable with mocks.
8. **Idempotency key — resolved 2026-08-09:** `user_subscriptions(payment_id)`
   now has a partial unique index (`payment_id is not null and <> ''`),
   `add_subscription` upserts with `ON CONFLICT`, and
   `update_or_add_subscription` looks up an existing row by `payment_id`
   first. B13/B14 disposable-schema race tests are still pending.
9. **`max(id)+1` id allocation — resolved 2026-08-09:** all backfilled id
   tables now use `GENERATED BY DEFAULT AS IDENTITY`, and `add_subscription`
   no longer allocates ids manually or takes the advisory lock. The remaining
   non-atomic check-then-insert in `update_or_add_subscription` is an
   idempotency problem, not an id-allocation problem (see #8 / M3).
10. **MailerLite subscriber creation only happens at email verification:** group assignment for users who are not already MailerLite subscribers fails silently. Decide whether payment/renewal paths should upsert subscribers (B66).
11. **`/user-subscription` returns the first row even when expired:** confirm every frontend treats expired rows as free; consider returning `{"subscription": null}` when no active row exists (B47/B89/B90).
12. **Existing automated payment tests are shallow:** several `test_app.py` rows are marked “to be implemented” or assert against stale recorded JSON fixtures; replace them with the mock-based cases in 2.6.
13. **`user_acquisition.id` default — resolved 2026-08-09:** converted to
    identity; `add_user_acquisition`'s id-less insert works and the endpoint
    test passes (SPEC-039 M4; B17).
14. **Delete-account MailerLite cleanup — resolved 2026-08-10:** DB rows
    cascade (`user_id` FKs to `auth.users` with `ON DELETE CASCADE`,
    2026-08-09), `user_id_map` is in the explicit cleanup list, and
    `DELETE /auth/delete-account` now GDPR-forgets the MailerLite subscriber
    best-effort (`/api/subscribers/{id}/forget`; SPEC-039 M6; B55).
15. **`/go-pro-success` fallback overclaimed — fixed 2026-08-10 (B53/C7):**
    after the ~20s poll found no subscription, the page claimed "payment
    received / processing" even when no payment evidence existed (direct URL
    visit, failed/never-started payment). The fallback is now a neutral
    "couldn't confirm your subscription yet" state with a spinner during the
    poll; final browser re-smoke (Steps 2–3) pending.
16. **Payment grants `status='active'` + MailerLite uses the account email —
    fixed 2026-08-10 (found during S1):** Stripe/PayPal/IAP/webhook grants now
    insert `status='active'` (previously defaulted to `draft`), and MailerLite
    group assignment prefers `_email_for_user(owner)` over the Stripe
    `payment_email`, so a checkout form email that differs from the account
    email no longer mis-assigns the mailing-list group.
17. **PayPal migrated to Orders v2 + JS SDK v6 — 2026-08-10 (P rows):** the
    deprecated Payments v1 lookup and `vue-paypal-checkout` v4 SDK 401'd in
    sandbox (PayPal disabled the legacy client auth). Classic now loads the
    current JS SDK, creates orders via `POST /create-paypal-order`, and the
    backend captures/verifies via `/v2/checkout/orders/{id}/capture` before
    granting. Backend covered by `test_paypal_orders_v2.py`; sandbox UI run
    pending.
18. **UTC-consistent payment timestamps — fixed 2026-08-10:** `expires_on`
    and `payment_date` are computed from `datetime.now(timezone.utc)`
    (previously naive server-local time stamped `Z`). The 32/367-day cadence
    is unchanged; this just makes the same-day math stable across timezones
    (B32/C4).
19. **Stripe webhook secrets moved to env — 2026-08-10:** the hardcoded
    test/live `whsec_…` fallbacks were removed from `app_stripe_checkout.py`.
    Handlers now read `STRIPE_CHECKOUT_WEBHOOK_SECRET` and
    `STRIPE_INVOICE_WEBHOOK_SECRET` (or the shared `STRIPE_WEBHOOK_SECRET`
    used by local `stripe listen`); a missing secret returns 500 (fail
    closed). Deployers must set the matching secrets in `.env`/server env —
    the account has separate checkout and invoice webhook endpoints with
    different secrets, so both vars are required in production.
    Verified in production 2026-08-10: bogus signature → 400; signed
    simulated `invoice.paid` → 200 + renewal.
20. **Active auto-renewing subscription blocks new purchases — Option A,
    implemented 2026-08-10, matching Classic:** web + mobile go-pro show a
    "cancel your existing subscription first" notice instead of payment
    methods, and `POST /create-stripe-checkout-session` returns 400 when the
    user has a non-trial, unexpired subscription **with a
    `payment_customer_id`** (i.e., an auto-renewing Stripe subscription).
    Cancelling auto-renew clears `payment_customer_id`, which lifts the
    block — exactly Classic's `hasActiveNonTrialSubscription` logic. Trials
    are exempt.
21. **iOS in-app browser checkout — policy risk (SPEC-014 target):** the iOS
    app currently lets lifetime buyers pay via Stripe card / WeChat / Alipay
    in a browser checkout. Apple policy wants digital entitlements sold only
    through IAP. Decide before App Store submission whether to remove those
    buttons (SPEC-014 target matrix marks them 🚫 in-app) or accept review
    risk. Android web-checkout is the documented launch stopgap until Play
    Billing lands.

---

## 7. References (official docs)

- Stripe test mode overview: <https://docs.stripe.com/testing/overview>
- Stripe test cards & webhooks: <https://docs.stripe.com/testing/cards> · <https://docs.stripe.com/webhooks>
- Stripe WeChat Pay: <https://docs.stripe.com/payments/wechat-pay/accept-a-payment>
- Stripe Alipay: <https://docs.stripe.com/payments/alipay/accept-a-payment>
- PayPal sandbox overview: <https://developer.paypal.com/sandbox-testing/overview>
- Apple sandbox IAP: <https://developer.apple.com/help/app-store-connect/test-in-app-purchases/overview-of-testing-in-sandbox/> · <https://developer.apple.com/documentation/storekit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox>
- Google Play Billing test guide: <https://developer.android.com/google/play/billing/test>

## 8. Success criteria

1. Every row in the test matrix (2.1–2.4) passes in test/sandbox mode with **zero production charges**.
2. Platform limitations are respected: IAP only on iOS, Play Billing absent (documented), PayPal direct only in Classic.
3. Renewal, cancellation, restore, and error paths verified, not just the happy path.
4. The blocking gaps in §5 (IAP bundle ID, PayPal sandbox switch, Stripe env toggles) are resolved or explicitly accepted by the team before shipping the affected flow.
5. Backend/data-layer rows B1–B90 pass against a disposable Supabase schema (or the gaps in §5 items 8–14 are explicitly accepted/fixed).
