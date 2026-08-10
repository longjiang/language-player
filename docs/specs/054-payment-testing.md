# SPEC-054 — Payment Testing Across Classic, Web & Mobile

## Metadata

- **Spec ID**: SPEC-054
- **Feature**: Payment testing across `zerotohero-nuxt` (Classic), `apps/web` and `apps/mobile`, covering all payment methods
- **Status**: draft
- **Created**: 2026-08-08
- **Scope**: All three active frontends + admin console + `zerotohero-python-server` payment, subscription, auth, and MailerLite paths (no production data should be touched by these tests)
- **Related specs**: [SPEC-014 — Subscription & Payment System](014-subscription-payment-system.md) · [SPEC-025 — Payment E2E Testing (archived)](archive/025-payment-e2e-testing.md) · [SPEC-048 — Mobile Release Plan](048-mobile-release-plan.md) · [SPEC-023 — Mobile E2E Testing](023-mobile-e2e-testing.md) · [SPEC-039 — Full Database Migration (Supabase)](039-full-database-migration-supabase.md) · [SPEC-060 — Admin Console User Management](060-admin-console-user-management.md) · [SPEC-041 — Delete Account](041-delete-account.md)
- **Supersedes**: [SPEC-025 — Payment E2E Testing (archived)](archive/025-payment-e2e-testing.md)
- **Related architecture/ADRs**: [ARCH-015 — Payment Methods & Renewal Strategy](../arch/015-payment-methods-plan-support.md) · [ARCH-022 — Payment, Subscription & MailerLite](../arch/022-payment-subscription-mailerlite.md) · [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md) · [ADR-0027 — Defer Automated E2E — Human QA](../adr/0027-defer-automated-e2e-human-qa.md) · [ADR-0032 — Admin Console App](../adr/0032-admin-console-app.md)

---

## Overview

This spec defines how to test every payment method on every frontend that supports it, using each provider's official test mode / sandbox. Provider-hosted UI flows are **human-run** (per ADR-0027 and SPEC-025) because they cross third-party payment UIs — Stripe Checkout, Stripe Payment Links, PayPal, or the App Store — that cannot be automated reliably with Maestro today.

Since the Directus → Supabase migration (SPEC-039), the backend pipeline has new failure surfaces the provider sandboxes alone do not cover: Supabase JWT auth, legacy Directus id remapping, backfilled `user_subscriptions` rows with no auto-increment ids, webhook idempotency, renewal/trial edge cases, and MailerLite sync. Section [2.6](#26-backend-auth--data-layer-tests-supabase-migration) adds a backend/data-layer matrix for those; most rows can be automated with mocks against a disposable Supabase schema, while the provider-hosted UI flows in 2.1–2.5 stay human-run.

**Platform limitations** (enforced by the providers, not by us):

- **Apple In-App Purchase** exists only on iOS. It is implemented in Classic (Capacitor) and `apps/mobile` (Expo), and it is lifetime-only (`pro`, non-consumable).
- **Google Play Billing** is **not implemented** in any frontend. Android users pay through the web-based flows (Stripe / WeChat / Alipay). The Play test-lab setup below is documented for when Billing is implemented, per SPEC-014.
- **PayPal** is implemented as a direct checkout only in Classic. Web and Mobile offer a link out to Classic's go-pro page instead.
- **WeChat Pay / Alipay** are processed through Stripe Payment Links (CNY, one-time only) on all three frontends.
- **Stripe Credit Card** is the only method supporting recurring monthly/annual subscriptions (Stripe webhook `invoice.paid`).

### Current payment matrix

| Payment method | Classic (`zerotohero-nuxt`) | Web (`apps/web`) | Mobile (`apps/mobile`) |
|---|---|---|---|
| Stripe Credit Card (USD) | ✅ Checkout (vue-stripe) | ✅ backend Checkout session | ✅ backend Checkout session |
| WeChat Pay (CNY) | ✅ Payment Link | ✅ Payment Link | ✅ Payment Link |
| Alipay (CNY) | ✅ Payment Link | ✅ Payment Link | ✅ Payment Link |
| PayPal (lifetime) | ✅ direct button | ⬜ links to Classic | ⬜ links to Classic |
| Apple IAP (`pro`, lifetime) | ✅ Capacitor IAP | N/A (browser) | ✅ iOS only (`expo-in-app-purchases`) |
| Google Play Billing | N/A | N/A | ⬜ not implemented |

### Key implementation files

| Area | Files |
|---|---|
| Classic UI | `zerotohero-nuxt/components/PaymentMethods.vue`, `PurchaseStripe.vue`, `PurchasePayPal.vue`, `PurchaseiOS.vue` |
| Web UI | `apps/web/src/app/[l1]/[l2]/go-pro/page.tsx`, `apps/web/src/lib/prices.ts` |
| Mobile UI | `apps/mobile/app/(tabs)/(me)/go-pro.tsx`, `apps/mobile/lib/iap.ts`, `apps/mobile/app/go-pro-success.tsx`, `apps/mobile/app/go-pro-error.tsx` |
| Backend | `zerotohero-python-server/routes/payments.py`, `app_stripe_checkout.py`, `app_paypal_checkout.py`, `app_in_app_purchase.py`, `data/prices.csv` |
| Backend data layer | `zerotohero-python-server/routes/subscriptions.py`, `utils_subscription.py`, `app_email_verification.py`, `utils_user_data.py` |
| MailerLite | `zerotohero-python-server/utils_mailer_lite.py` |
| Admin | `zerotohero-python-server/routes/admin_users.py`, `apps/admin` |
| Subscription state | `apps/web/src/providers/subscription-provider.tsx`, `apps/web/src/hooks/use-subscription.ts`, `apps/mobile/contexts/SubscriptionContext.tsx`, `apps/mobile/app/(tabs)/(me)/profile.tsx` |

---

## 1. Environment Setup (per provider)

### 1.1 Stripe (credit card + WeChat/Alipay Payment Links)

Stripe's test mode is a full sandbox: separate API keys, prices, payment links, webhook signing secrets, and cards. Nothing in test mode charges a real card. Reference: <https://docs.stripe.com/testing/overview>.

**Backend (`zerotohero-python-server`)**

1. In `app_stripe_checkout.py`, set `stripe_test = True` so the backend uses `STRIPE_TEST_KEY` and test price IDs/links from `prices.csv`.
2. Set environment variables (e.g. in the run script / shell):
   - `STRIPE_TEST_KEY` — test secret key `sk_test_...` from the Stripe Dashboard → Developers → API keys.
   - Keep `APPLE_SHARED_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` unset or irrelevant for Stripe-only runs.
3. Restart the Flask process (the user's responsibility — do not manage the server process from Codex).
4. Sanity check: `GET /stripe-prices?test=true` returns the test price IDs (`price_1PSNOW...`, etc.) and `test_payment_link` URLs; `GET /stripe-prices` (no query) returns live IDs.

> ⚠️ **Known gap:** `stripe_test` and both webhook signing secrets are hardcoded in `app_stripe_checkout.py` (lines ~17 and ~194/267). There is no env toggle. Before test mode can be run safely, move these to env vars (e.g. `STRIPE_MODE=test`, `STRIPE_WEBHOOK_SECRET_TEST`, `STRIPE_WEBHOOK_SECRET_LIVE`). This is a **precondition** for running the Stripe tests against a shared server and is tracked in [Open Questions](#5-open-questions-and-known-gaps).

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

The CLI prints a signing secret (`whsec_...`) — use the **test** secret currently hardcoded in `app_stripe_checkout.py` (or, after the env-var cleanup, `STRIPE_WEBHOOK_SECRET_TEST`) when running the backend in test mode. Trigger canned events with:

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
2. Set `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET` env vars to the **sandbox business app's** credentials.
3. **Required code change (precondition):** the backend `app_paypal_checkout.py` currently hardcodes the live URL `https://api-m.paypal.com/v1/payments/payment/{pay_id}`. For sandbox testing it must call `https://api-m.sandbox.paypal.com/...` — e.g. a `PAYPAL_MODE=sandbox` env switch (PayPal's Payments v1 API is also deprecated; see Open Questions).
4. **Required code change (precondition):** `PurchasePayPal.vue` hardcodes `env="production"` (though it already carries `sandbox` client credentials). Switch to `env="sandbox"` or make it follow the `TEST` flag. **Never ship `env="sandbox"` in production.**
5. In Classic go-pro, choose Lifetime → PayPal, log in as the sandbox **buyer** account, approve the payment.
6. Expected: Classic redirects to `{PYTHON_SERVER}/paypal_checkout_success?pay_id=...&user_id=...&host=...`; backend verifies `state == 'approved'` and grants a **lifetime** subscription (`expires_on` null, `payment_processor = 'paypal'`); user lands on `/go-pro-success`.
7. Cancel test: abandon/close the PayPal approval dialog → user returns to go-pro with the cancelled/error message; no subscription record.

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
5. The product is the non-consumable `pro` (lifetime). It must exist in App Store Connect → In-App Purchases with the same ID on the target app's bundle ID.

Run the tests per [2.4 Apple IAP](#24-apple-iap-ios-only).

> ⚠️ **Critical risk:** the backend `app_in_app_purchase.py` validates receipts with `bundle_id = 'ca.zerotohero.app'`, while `apps/mobile/app.json` uses iOS bundle `ca.zerotohero.go` (Classic's Capacitor app is `ca.zerotohero.app`). Sandbox receipts from the new mobile binary will likely fail validation against the `.app` bundle ID unless the validator is made bundle-aware or the mobile app's sandbox product is verified under `.app`. See [Open Questions](#5-open-questions-and-known-gaps) — **resolve before shipping mobile IAP**.

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
| P1 | Classic | Sandbox preconditions (1.3) → Lifetime → PayPal → log in as sandbox buyer → approve | Redirect to `/paypal_checkout_success`; backend verifies approved state; lifetime granted: `payment_processor=paypal`, `expires_on=null`, no `payment_customer_id`; lands on `/go-pro-success` |
| P2 | Classic | Approve with a **declined/failed** sandbox payment (or force an unapproved state) | Redirect to `/go-pro-error?paypal_pay_id=...`; no subscription row |
| P3 | Classic | Cancel the PayPal dialog | `paypalPaymentStatus = 'cancelled'` warning on go-pro; no subscription |
| P4 | Classic | Purchase twice with two sandbox buyers | Second purchase updates/keeps one lifetime record per user (no duplicate charge without consent; verify idempotency) |
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

> ⚠️ A1/A2 both depend on the bundle-ID question in [1.4](#14-apple-in-app-purchase-ios). Until resolved, A2 is expected to **fail** validation for `ca.zerotohero.go` receipts.

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
| B11 | Delete the current max-id row, then insert | New id is `max(remaining)+1`; no collision or constraint error |
| B12 | Two concurrent `add_subscription` calls for different users | Both succeed with unique ids (advisory lock serializes id allocation) |
| B13 | Concurrent first purchase for the same user (success callback + webhook race) | Exactly one subscription row. Duplicates would be a bug — there is no dedupe/idempotency key today |
| B14 | Same Stripe event / `payment_id` delivered twice sequentially | Second delivery updates the existing row; no duplicate row |
| B15 | Backfilled row with a legacy Directus numeric owner id | Resolved through `user_id_map`; `/user-subscription` and admin detail return the canonical auth UUID |
| B16 | Post-GoTrue user with no `user_id_map` entry | Found via `auth.users` email lookup (`_user_by_email` / `_email_for_user`) |
| B17 | `POST /acquisition_survey` for a fresh user | Row saved **without an explicit id**; verifies `user_acquisition.id` has a real default (SPEC-039 M4 — currently unverified) |

#### 2.6.3 Webhooks & idempotency

| # | Case | Expected result |
|---|---|---|
| B20 | Valid `checkout.session.completed` with `payment_status=paid` | Grant created/updated; `client_reference_id` → owner; `payment_customer_id` and `payment_email` stored |
| B21 | `checkout.session.completed` with `payment_status != paid` | 400; no grant |
| B22 | `checkout.session.completed` missing `client_reference_id` | Defined error / no grant (current code would attempt an empty owner — verify behavior) |
| B23 | Payment Link webhook with `session.customer = null` | Grant still succeeds via `customer_details.email`; `payment_customer_id` null; MailerLite group mapping verified |
| B24 | `invoice.paid` for a known Stripe customer | Expiry set to now + 32d (monthly) / 367d (annual); `payment_date` and notes updated |
| B25 | `invoice.paid` with an unknown customer id | 400 “Subscription not found”; no crash |
| B26 | `invoice.paid` when the local row has no owner but has `payment_email` | Owner resolved from email; renewal succeeds |
| B27 | `invoice.paid` with an unknown price id / type | No crash; handler logs and returns (currently still 200 with a null result — decide intended behavior) |
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
| B40 | New user signs up and verifies through GoTrue (`/auth/register` → `/auth/verify-email` or confirmation link) | **Desired:** trial row created (`type=trial`, `expires_on` = +7d) and MailerLite subscriber created with `role`/`user_id` fields and group `trial`. **Known gap:** the current GoTrue path grants neither (SPEC-039 audit M1/M2) — this row fails until the hooks are ported |
| B41 | Re-verify the same email | No second trial; no duplicate row |
| B42 | User already has an active monthly or lifetime subscription | No trial granted |
| B43 | User has an expired subscription | Trial granted by updating the expired row; new 7-day window |
| B44 | Wrong verification code | 400; no activation and no trial |
| B45 | Banned email | Verification blocked |
| B46 | Acquisition source submitted with verification | `user_acquisition` row saved with source/details |
| B47 | Trial expiry | `/user-subscription` returns the expired trial row; frontends compute free; gates close |
| B48 | MailerLite down during verification | Document/decide: current code calls MailerLite unwrapped, so verification may fail; consider isolating it |
| B49 | Legacy `/verification_email` / `/verification_email/verify` routes | No active client calls them after GoTrue cutover; they still hit Directus (`app_email_verification.py`). Decide remove-or-migrate before decommission (SPEC-039 M5) |

#### 2.6.6 Cancellation & subscription management

| # | Case | Expected result |
|---|---|---|
| B50 | Cancel a valid Stripe subscription | Stripe `cancel_at_period_end=true`; local `payment_customer_id` cleared; MailerLite group `disengaged`; `/user-subscription` no longer advertises auto-renew |
| B51 | Cancel with a missing/invalid customer id | Defined 4xx (currently likely 500 on a Stripe error — fix or explicitly accept) |
| B52 | Cancel a lifetime subscription / no customer id | API does not clear the lifetime row; frontends hide the cancel control |
| B53 | `/go-pro-success` polling | After a grant, `/user-subscription` returns active within ~20s; success page flips to Pro |
| B54 | Delete account while an auto-renewing subscription is active | Blocked until cancelled (SPEC-041) |
| B55 | Delete account (no active auto-renew) | GoTrue user removed; `user_subscriptions`, `user_acquisition`, and `user_id_map` rows removed; MailerLite subscriber unsubscribed/removed (SPEC-039 M6 — MailerLite cleanup currently missing) |

#### 2.6.7 MailerLite sync

| # | Case | Expected result |
|---|---|---|
| B60 | New subscriber creation payload | `email`, `name`, `last_name`, `role`, `user_id` sent; group `trial` when a trial was granted |
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
| B82 | `POST /create-stripe-checkout-session` with an invalid price/mode | Defined error (currently 500 — verify) |
| B83 | `GET /stripe_checkout_success` missing `session_id` / `user_id` / `host` | Defined redirect/error (currently likely 500 — verify) |
| B84 | `GET /stripe_checkout_success` with an unpaid session | Redirect to error page; no grant |
| B85 | `GET /stripe-prices` live vs test | IDs/links/amounts match `prices.csv` (10/90/169 USD; 73/653/1227 CNY; sale lifetime 84.50/608; legacy 6/59) |
| B86 | `GET /paypal_checkout_success` missing `pay_id` / `user_id` / `host` | Defined behavior; no crash |
| B87 | PayPal unapproved state | Redirect to error; no grant |
| B88 | `POST /in_app_purchase_success` missing `user_id` / `receipt` | 400 / error; no grant |
| B89 | `GET /user-subscription` with no rows | `{"subscription": null}` |
| B90 | `GET /user-subscription` with only an expired row | Returns the expired row; frontends treat it as free |

### 2.7 Automation notes

- B1–B6, B10–B17, and B20–B92 can be automated in CI with mocked Stripe / PayPal / Apple / MailerLite and a disposable Supabase schema. The existing `test_app.py` / `test_admin_users.py` cover a few of these shallowly (several are marked “to be implemented” or compare against stale recorded fixtures); most rows are missing.
- Concurrency rows (B12, B13) need a threaded Flask test client or two parallel processes against the same schema.
- Provider-hosted UI rows (S/W/P/A) remain human-run per ADR-0027.

---

## 3. Cross-app checks

| # | Check | Steps | Expected result |
|---|---|---|---|
| C1 | Price parity | Load go-pro on all three apps in test mode | Same plans/amounts (USD + CNY); sale lifetime price appears only when `SALE`/`status=sale` applies consistently |
| C2 | Subscription sync | Purchase monthly via Stripe on Web → open Mobile with same user | Mobile shows Pro with matching expiry; profile shows processor `stripe` |
| C3 | Purchase on iOS device → same account on Android/Web | Buy IAP lifetime on iOS → log into Web | Lifetime Pro active everywhere; profile shows `app-store` processor |
| C4 | Existing subscription not overwritten | Have an active annual subscription → complete a second purchase of the same plan | Expiry extends rather than resets (verify `update_or_add_subscription` behavior in test mode) |
| C5 | Free tier gates after payment | Before purchase, transcript truncated + 2 word examples; after grant, full transcript + unlimited examples | Gates flip with subscription state on all frontends |
| C6 | Cancel at period end (Stripe only) | Cancel subscription in Stripe test Dashboard or via cancel flow | `cancel_at_period_end` set; user keeps Pro until expiry, then falls back to free |
| C7 | Success/error screens | Force each failure path (declined card, cancelled PayPal, bogus receipt, abandoned Payment Link) | `/go-pro-error` or inline error shown; no Pro grant; no stuck loading state |

---

## 4. Test execution cadence

| Trigger | Scope | Device | Estimated time |
|---|---|---|---|
| Before every App Store submission | A1–A7 + S1–S15 + W1–W7 + C1–C7 | Real iPhone (sandbox account) + simulators + browser | ~60 min |
| Before every web release | S9–S15 + W5–W7 + C1, C5, C7 | Browser (test backend) | ~25 min |
| After any payment backend change (`routes/payments.py`, `app_stripe_checkout.py`, `app_paypal_checkout.py`, `app_in_app_purchase.py`, `prices.csv`) | S1–S15, W1–W7, P1–P4, A1–A7 | As appropriate per change | ~45 min |
| After any Supabase/auth/data-layer change (`utils_subscription.py`, `routes/subscriptions.py`, `routes/admin_users.py`, `app_email_verification.py`, `utils_mailer_lite.py`) | B1–B92 | CI/test schema (automated where possible) | ~30 min |
| Quarterly (renewal regression) | S13, C6 + test-mode renewals | Browser + real device | ~20 min |

---

## 5. Open Questions and Known Gaps

1. **Backend IAP bundle ID mismatch (blocking for mobile IAP shipping):** `app_in_app_purchase.py` validates with `bundle_id='ca.zerotohero.app'` (Classic), but `apps/mobile` builds with `ca.zerotohero.go`. Verify whether a sandbox receipt from `ca.zerotohero.go` passes validation (it should not), and make the validator accept both bundle IDs (e.g. retry with the receipt's own `bundle_id` from the validated response, or per-request bundle override) before mobile IAP can ship. See ADR-0013 for the strategy.
2. **PayPal has no sandbox switch:** backend hardcodes `https://api-m.paypal.com` and Classic hardcodes `env="production"`. Sandbox testing requires temporary local edits or an env-driven `PAYPAL_MODE` switch. PayPal's Payments v1 API is deprecated — worth flagging for a future migration to Orders v2, which also has proper sandbox support.
3. **Stripe test/live toggles are hardcoded:** `stripe_test = False` and webhook secrets in `app_stripe_checkout.py`; `TEST = false` in `zerotohero-nuxt/lib/utils/variables.js`. These must become env/flag-driven (and never committed as `True`) before teams share a backend for test runs.
4. **Web/Mobile PayPal cannot be sandbox-tested** because they link to the production Classic go-pro page. Options: run a test Classic deployment on a test host and point the links there, or implement PayPal directly in Web/Mobile (SPEC-014).
5. **Google Play Billing is not implemented** — the sandbox guide in 1.5 is reference-only until SPEC-014 work lands.
6. **Payment Link purchases have no return redirect** — verification relies on webhooks. The test must confirm the `checkout.session.completed` event arrives with `client_reference_id` intact; if webhooks are down, grants silently fail.
7. **Automation** (SPEC-025's mock backend: `/mock-stripe-checkout`, `/mock-wechat-pay`, etc.) is still future work; provider-hosted UI rows remain human-run, but the backend/data-layer rows in 2.6 are automatable with mocks.
8. **No idempotency key on subscription grants:** no unique constraint on `payment_id` / `payment_customer_id` is visible in the migration tooling/data layer (verify DDL), and `update_or_add_subscription` is check-then-insert. A concurrent first purchase (success redirect + webhook) can create duplicate rows. Add a unique partial index or an idempotency key, and cover with B13/B14.
9. **`max(id)+1` id allocation:** the advisory lock only guards the id select inside `add_subscription`; the surrounding check-then-insert in `update_or_add_subscription` is not atomic. Verify with B12/B13; consider a real sequence/identity column or `ON CONFLICT`.
10. **MailerLite subscriber creation only happens at email verification:** group assignment for users who are not already MailerLite subscribers fails silently. Decide whether payment/renewal paths should upsert subscribers (B66).
11. **`/user-subscription` returns the first row even when expired:** confirm every frontend treats expired rows as free; consider returning `{"subscription": null}` when no active row exists (B47/B89/B90).
12. **Existing automated payment tests are shallow:** several `test_app.py` rows are marked “to be implemented” or assert against stale recorded JSON fixtures; replace them with the mock-based cases in 2.6.
13. **`user_acquisition.id` default is unverified:** the WS-6 backfill inserted explicit Directus ids, but `add_user_acquisition` inserts without `id` (SPEC-039 M4; B17).
14. **Delete-account does not remove the MailerLite subscriber:** `DELETE /auth/delete-account` only deletes the GoTrue user; define unsubscribe/removal semantics and verify cascades (SPEC-039 M6; B55).

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
5. Backend/data-layer rows B1–B92 pass against a disposable Supabase schema (or the gaps in §5 items 8–14 are explicitly accepted/fixed).
