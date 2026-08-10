# SPEC-054 — Payment Testing Across Classic, Web & Mobile

## Metadata

- **Spec ID**: SPEC-054
- **Feature**: Payment testing across `zerotohero-nuxt` (Classic), `apps/web` and `apps/mobile`, covering all payment methods
- **Status**: draft
- **Created**: 2026-08-08
- **Scope**: All three active frontends + `zerotohero-python-server` payment endpoints (no production data should be touched by these tests)
- **Related specs**: [SPEC-014 — Subscription & Payment System](014-subscription-payment-system.md) · [SPEC-025 — Payment E2E Testing (archived)](archive/025-payment-e2e-testing.md) · [SPEC-048 — Mobile Release Plan](048-mobile-release-plan.md) · [SPEC-023 — Mobile E2E Testing](023-mobile-e2e-testing.md)
- **Supersedes**: [SPEC-025 — Payment E2E Testing (archived)](archive/025-payment-e2e-testing.md)
- **Related architecture/ADRs**: [ARCH-015 — Payment Methods & Renewal Strategy](../arch/015-payment-methods-plan-support.md) · [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md) · [ADR-0027 — Defer Automated E2E — Human QA](../adr/0027-defer-automated-e2e-human-qa.md)

---

## Overview

This spec defines how to test every payment method on every frontend that supports it, using each provider's official test mode / sandbox. All tests are **human-run** (per ADR-0027 and SPEC-025) because every flow crosses a third-party-hosted payment UI — Stripe Checkout, Stripe Payment Links, PayPal, or the App Store — that cannot be automated reliably with Maestro today.

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
| Quarterly (renewal regression) | S13, C6 + test-mode renewals | Browser + real device | ~20 min |

---

## 5. Open Questions and Known Gaps

1. **Backend IAP bundle ID mismatch (blocking for mobile IAP shipping):** `app_in_app_purchase.py` validates with `bundle_id='ca.zerotohero.app'` (Classic), but `apps/mobile` builds with `ca.zerotohero.go`. Verify whether a sandbox receipt from `ca.zerotohero.go` passes validation (it should not), and make the validator accept both bundle IDs (e.g. retry with the receipt's own `bundle_id` from the validated response, or per-request bundle override) before mobile IAP can ship. See ADR-0013 for the strategy.
2. **PayPal has no sandbox switch:** backend hardcodes `https://api-m.paypal.com` and Classic hardcodes `env="production"`. Sandbox testing requires temporary local edits or an env-driven `PAYPAL_MODE` switch. PayPal's Payments v1 API is deprecated — worth flagging for a future migration to Orders v2, which also has proper sandbox support.
3. **Stripe test/live toggles are hardcoded:** `stripe_test = False` and webhook secrets in `app_stripe_checkout.py`; `TEST = false` in `zerotohero-nuxt/lib/utils/variables.js`. These must become env/flag-driven (and never committed as `True`) before teams share a backend for test runs.
4. **Web/Mobile PayPal cannot be sandbox-tested** because they link to the production Classic go-pro page. Options: run a test Classic deployment on a test host and point the links there, or implement PayPal directly in Web/Mobile (SPEC-014).
5. **Google Play Billing is not implemented** — the sandbox guide in 1.5 is reference-only until SPEC-014 work lands.
6. **Payment Link purchases have no return redirect** — verification relies on webhooks. The test must confirm the `checkout.session.completed` event arrives with `client_reference_id` intact; if webhooks are down, grants silently fail.
7. **Automation** (SPEC-025's mock backend: `/mock-stripe-checkout`, `/mock-wechat-pay`, etc.) is still future work; all rows above are human-run.

---

## 6. References (official docs)

- Stripe test mode overview: <https://docs.stripe.com/testing/overview>
- Stripe test cards & webhooks: <https://docs.stripe.com/testing/cards> · <https://docs.stripe.com/webhooks>
- Stripe WeChat Pay: <https://docs.stripe.com/payments/wechat-pay/accept-a-payment>
- Stripe Alipay: <https://docs.stripe.com/payments/alipay/accept-a-payment>
- PayPal sandbox overview: <https://developer.paypal.com/sandbox-testing/overview>
- Apple sandbox IAP: <https://developer.apple.com/help/app-store-connect/test-in-app-purchases/overview-of-testing-in-sandbox/> · <https://developer.apple.com/documentation/storekit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox>
- Google Play Billing test guide: <https://developer.android.com/google/play/billing/test>

## 6. Success criteria

1. Every row in the test matrix (2.1–2.4) passes in test/sandbox mode with **zero production charges**.
2. Platform limitations are respected: IAP only on iOS, Play Billing absent (documented), PayPal direct only in Classic.
3. Renewal, cancellation, restore, and error paths verified, not just the happy path.
4. The blocking gaps in §5 (IAP bundle ID, PayPal sandbox switch, Stripe env toggles) are resolved or explicitly accepted by the team before shipping the affected flow.
