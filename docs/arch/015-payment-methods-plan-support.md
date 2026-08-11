# Payment Methods — Supported Plans & Renewal Strategy

## Metadata
- **Arch ID**: ARCH-015
- **Feature**: Payment methods, supported subscription plans, and auto-renewal behavior
- **Type**: reference
- **Status**: accepted
- **Created**: 2026-07-13
- **Last Updated**: 2026-07-25
- **ROADMAP Phase**: Cross-cutting (payment infrastructure)
- **Scope**: Nuxt Classic (legacy), GO (legacy), Python Backend (active), Next.js Web (active), React Native Mobile (active)
- **Supersedes**: ADR-0005
- **See also**:
  - `docs/adr/0005-payment-methods-plan-support.md` — Original ADR (moved here)
  - `zerotohero-nuxt/components/Pricing.vue` — Plan selection UI with sale logic
  - `zerotohero-nuxt/components/PaymentMethods.vue` — Routes to correct payment component per plan
  - `zerotohero-nuxt/components/PurchaseStripe.vue` — Stripe Checkout + WeChat/Alipay via Payment Links
  - `zerotohero-nuxt/components/PurchasePayPal.vue` — PayPal button (lifetime-only gate)
  - `zerotohero-nuxt/components/PurchaseiOS.vue` — iOS IAP (non-consumable, lifetime-only)
  - `zerotohero-nuxt/plugins/ios-in-app-purchase.js` — Capacitor IAP plugin wrapper
  - `zerotohero-nuxt/plugins/stripe.js` — Stripe Checkout plugin
  - `zerotohero-nuxt/plugins/paypal.js` — PayPal plugin
  - `zerotohero-nuxt/store/subscriptions.js` — Vuex subscription store
  - `apps/mobile-go-legacy/contexts/SubscriptionContext.tsx` — GO app subscription status
  - `apps/mobile-go-legacy/app/go-pro.tsx` — GO Go Pro screen
  - `apps/mobile-go-legacy/components/IOSPaymentMethods.tsx` — Stubbed (removed for SDK 57)
  - `apps/mobile/app/(tabs)/(me)/go-pro.tsx` — Mobile Go Pro screen
  - `zerotohero-python-server/app_stripe_checkout.py` — Stripe checkout, webhooks, auto-renewal
  - `zerotohero-python-server/app_paypal_checkout.py` — PayPal verification (lifetime hardcoded)
  - `zerotohero-python-server/app_in_app_purchase.py` — iOS receipt validation (lifetime hardcoded)
  - `zerotohero-python-server/utils_subscription.py` — CRUD for Directus `subscriptions` collection
  - `zerotohero-python-server/data/prices.csv` — Price definitions (USD + CNY)

---

## Overview

Language Player offers three subscription plans (monthly $10, annual $90, lifetime $169) across five payment methods (Stripe Credit Card, PayPal, iOS In-App Purchase, WeChat Pay, Alipay). Not all methods support all plans, and renewal behavior differs across processors. This document maps the constraints and the architectural reasons behind them.

Two of the four frontend codebases have payment implementations:

| App | Payment Support | IAP | Identifier / product |
|---|---|---|---|
| **Nuxt Classic** (`zerotohero-nuxt/`) | ✅ Stripe, PayPal, iOS IAP, WeChat, Alipay | ✅ `@ionic-native/in-app-purchase-2` (Capacitor/Cordova) | `ca.zerotohero.app` / `pro` |
| **GO legacy** (`apps/mobile-go-legacy/`) | ✅ Stripe (web-based) | ❌ Stubbed (`react-native-iap` removed for SDK 57) | `ca.zerotohero.go` / `pro_go` (shipped; being replaced) |
| **Next.js Web** (`apps/web/`) | ✅ Stripe, WeChat, Alipay | N/A (browser-based) | — |
| **React Native Mobile** (`apps/mobile/`) | ✅ Apple IAP (iOS); browser web-checkout today (being removed — SPEC-014) | ✅ `expo-iap` (`pro_go`) | `ca.zerotohero.go` (iOS + Android) / `pro_go` |

> Canonical identity reference (bundle IDs + IAP products):
> [SPEC-014 "Identifiers & IAP"](../specs/014-subscription-payment-system.md).
> The backend validator accepts **both** `ca.zerotohero.go` and
> `ca.zerotohero.app` receipts — both iOS apps stay public.

---

## Payment Methods & Plan Support

| Payment Method | Monthly | Annual | Lifetime | Auto-Renewal | Processor Integration |
|---|---|---|---|---|---|
| **Stripe (Credit Card)** | ✅ $10/mo | ✅ $90/yr | ✅ $169 | ✅ (Stripe webhook `invoice.paid`) | Stripe Checkout + Webhooks |
| **PayPal** | ❌ | ❌ | ✅ $169 | ❌ | PayPal Orders v2 (create/capture) |
| **iOS In-App Purchase** | ❌ | ❌ | ✅ $169 | ❌ | Apple App Store (`inapppy` validator) |
| **WeChat Pay** | ✅ ¥73/mo | ✅ ¥653/yr | ✅ ¥1,227 | ❌ | Stripe Payment Links (CNY) |
| **Alipay** | ✅ ¥73/mo | ✅ ¥653/yr | ✅ ¥1,227 | ❌ | Stripe Payment Links (CNY) |

Pricing is defined in `zerotohero-python-server/data/prices.csv` and fetched from Stripe via the `/stripe-prices` endpoint.

---

## Why Some Methods Are Lifetime-Only

### PayPal

PayPal integration uses the legacy Payments API v1 (`/v1/payments/payment/{pay_id}`). The backend (`app_paypal_checkout.py`) hardcodes `type: 'lifetime'` with `expires_on: None`. The frontend (`PurchasePayPal.vue`) only fetches the lifetime USD price.

PayPal supports recurring subscriptions via its newer Subscriptions API, but this was never implemented. The current one-time payment flow was simpler and matched early product needs.

### iOS In-App Purchase

Apple IAP is a **non-consumable** product on both public iOS apps:
Classic uses `IOS_IAP_PRODUCT_ID = "pro"` (`PurchaseiOS.vue`); the new
mobile app uses `pro_go` (`apps/mobile/lib/iap.ts`). Non-consumables are
purchased once and persist forever — they cannot be used for auto-renewable
subscriptions (which require a different product type).

The Nuxt frontend (`PaymentMethods.vue:8`) explicitly gates `PurchaseiOS` behind `v-if="selectedPlan.name === 'lifetime'"` and shows a warning for non-lifetime plans.

The backend (`app_in_app_purchase.py`) validates receipts via Apple's
`verifyReceipt` endpoint against **both** public bundles
(`ca.zerotohero.go` first, then `ca.zerotohero.app`) and hardcodes
`type: 'lifetime'` with `expires_on: None`.

### WeChat Pay & Alipay

Both use **Stripe Payment Links** — one-time payment URLs that redirect to Stripe-hosted pages supporting WeChat/Alipay as payment methods. Payment Links are one-shot by nature:

- They generate a single `checkout.session.completed` event
- There is no mechanism to set up recurring billing through a Payment Link
- Stripe does not support creating subscriptions via Payment Links for WeChat/Alipay
- The user must manually re-purchase when their monthly/annual plan expires

If recurring support is needed in the future, the options are:
- Implement Stripe Checkout Sessions with WeChat/Alipay as payment method types (requires additional Stripe configuration)
- Use a different payment processor that supports WeChat/Alipay recurring billing

---

## Auto-Renewal

Only **Stripe Credit Card** (USD) supports automatic renewal:

1. User purchases via Stripe Checkout → `checkout.session.completed` webhook creates subscription
2. Subscription has a `payment_customer_id` (Stripe customer ID)
3. Each billing cycle, Stripe charges the card and fires `invoice.paid` webhook
4. Python backend (`app_stripe_checkout.py`) extends `expires_on` by 32 days (monthly) or 367 days (annual)

The GO app's `SubscriptionContext` exposes `subscriptionWillAutoRenew()` which checks:
```ts
["monthly", "annual"].includes(subscription.type) &&
subscription.payment_customer_id !== ""
```

Subscription records store `payment_customer_id` — only Stripe populates this field (PayPal and IAP leave it empty).

---

## Subscription Record Structure

All methods create a subscription record in the Directus `subscriptions` collection:

| Field | Description |
|---|---|
| `owner` | Directus user ID |
| `type` | `monthly`, `annual`, `lifetime`, or `trial` |
| `expires_on` | Expiry date (or `null` for lifetime) |
| `payment_processor` | `stripe`, `paypal`, or `app-store` |
| `payment_customer_id` | Stripe customer ID (empty for non-Stripe) |
| `payment_id` | Payment ID (PayPal pay_id, Stripe session_id, Apple transaction_id) |
| `payment_date` | Date of payment |
| `payment_email` | User's payment email |

---

## Frontend Payment Components

### Nuxt Classic

| Component | File | Purpose |
|---|---|---|
| `Pricing` | `zerotohero-nuxt/components/Pricing.vue` | Plan selection UI with sale logic |
| `PaymentMethods` | `zerotohero-nuxt/components/PaymentMethods.vue` | Route to correct payment component per plan |
| `PurchaseStripe` | `zerotohero-nuxt/components/PurchaseStripe.vue` | Stripe Checkout + WeChat/Alipay via Payment Links |
| `PurchasePayPal` | `zerotohero-nuxt/components/PurchasePayPal.vue` | PayPal button (lifetime-only gate) |
| `PurchaseiOS` | `zerotohero-nuxt/components/PurchaseiOS.vue` | iOS IAP (non-consumable, lifetime-only) |
| `SubscriptionStatus` | `zerotohero-nuxt/components/SubscriptionStatus.vue` | Active subscription display |

### GO Legacy

| Component | File | Purpose |
|---|---|---|
| `SubscriptionContext` | `apps/mobile-go-legacy/contexts/SubscriptionContext.tsx` | Subscription state + auto-renew check |
| `PaymentMethods` | `apps/mobile-go-legacy/components/PaymentMethods.tsx` | Buttons: Credit Card, Apple Pay, PayPal, Alipay, WeChat Pay |
| `IOSPaymentMethods` | `apps/mobile-go-legacy/components/IOSPaymentMethods.tsx` | **Stub** — `react-native-iap` removed for SDK 57 |

### React Native Mobile

| Component | File | Purpose |
|---|---|---|
| Go Pro screen | `apps/mobile/app/(tabs)/(me)/go-pro.tsx` | Stripe, WeChat, Alipay, PayPal (lifetime) via Stripe Payment Links |
| IAP | `apps/mobile/lib/iap.ts` | ✅ iOS `pro_go` (lifetime) — purchase + restore |

---

## Backend Files

| File | Purpose |
|---|---|
| `zerotohero-python-server/app_stripe_checkout.py` | Stripe checkout, webhooks, auto-renewal |
| `zerotohero-python-server/app_paypal_checkout.py` | PayPal verification (lifetime hardcoded) |
| `zerotohero-python-server/app_in_app_purchase.py` | iOS receipt validation (lifetime hardcoded) |
| `zerotohero-python-server/utils_subscription.py` | CRUD for Directus `subscriptions` collection |
| `zerotohero-python-server/data/prices.csv` | Price definitions (USD + CNY) |

---

## Known Limitations

- **WeChat/Alipay users on monthly/annual plans must manually re-purchase** when their plan expires. No recurring billing.
- **iOS users cannot purchase monthly/annual plans** in-app. They must use the web (Stripe) for recurring plans. On the React Native app, non-lifetime iOS plans show an `OnlyLifetimePlan` message.
- **PayPal users cannot purchase recurring plans.** Lifetime is the only option.
- **React Native mobile has Apple IAP on iOS** (`pro_go`, lifetime). Its
  non-IAP in-app browser checkout is being removed (SPEC-014); Android gets
  Play Billing later.
