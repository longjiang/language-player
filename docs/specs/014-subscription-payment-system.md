# SPEC-014: Subscription & Payment System — Unified Implementation

## Metadata
- **Spec ID**: SPEC-014
- **Feature**: Subscription purchase, verification, and management across web and mobile
- **Status**: draft
- **Created**: 2026-07-25
- **ROADMAP Phase**: Cross-cutting (payment infrastructure)
- **Based on**: ARCH-015 (payment methods), ADR-0013 (app store strategy)
- **See also**:
  - `docs/arch/015-payment-methods-plan-support.md` — Payment method constraints
  - `docs/adr/0013-app-store-strategy.md` — App Store naming + IAP strategy
  - `zerotohero-python/routes/payments.py` — Python payment routes
  - `zerotohero-python/routes/subscriptions.py` — Python subscription routes
  - `zerotohero-python/app_stripe_checkout.py` — Stripe integration
  - `zerotohero-python/app_paypal_checkout.py` — PayPal integration
  - `zerotohero-python/app_in_app_purchase.py` — Apple IAP receipt validation
  - `zerotohero-python/utils_subscription.py` — Directus subscription CRUD
  - `zerotohero-python/data/prices.csv` — Single source of truth for pricing
  - `zerotohero-nuxt/components/PurchaseiOS.vue` — Reference IAP UI + flow
  - `zerotohero-nuxt/plugins/ios-in-app-purchase.js` — Reference IAP plugin setup

---

## Overview

Language Player has a mature payment and subscription system in the Python backend and Classic Nuxt app, but the implementation across the four frontend codebases is inconsistent. The GO legacy mobile app had a partial implementation that was broken during the SDK 57 migration. The Next.js web app and React Native mobile app have Stripe credit card + WeChat/Alipay working but lack subscription state management, PayPal integration, and IAP.

This spec defines a unified architecture for `apps/web` and `apps/mobile` that:
1. Reuses the proven Python backend endpoints unchanged
2. Adds shared subscription state management (web hook + mobile context)
3. Fills the remaining gaps (PayPal for web, IAP for mobile)
4. Handles all edge cases (existing subscriptions, cancellation, expiry)

---

## Architecture

### Data Flow (All Frontends)

```
User taps "Buy" on plan card
  │
  ├─ ► Stripe Credit Card: POST /create-stripe-checkout-session
  │     → { url } → redirect to Stripe Checkout
  │     → Webhook: checkout.session.completed → create subscription in Directus
  │     → User redirected to /go-pro-success
  │     → /go-pro-success polls /user-subscription until active
  │
  ├─ ► WeChat / Alipay: Open Stripe Payment Link
  │     → Webhook: checkout.session.completed → create subscription
  │     → User redirected to /go-pro-success
  │
  ├─ ► PayPal: POST /create-paypal-order (NEW) or redirect to classic
  │     → PayPal approval → POST /paypal_checkout_success
  │     → Hardcodes lifetime subscription
  │
  └─ ► IAP (mobile only): Purchase via RevenueCat / StoreKit
        → Verify receipt via POST /in_app_purchase_success
        → Hardcodes lifetime subscription
```

### Subscription Status Flow

```
App launch → check auth → fetch /user-subscription?user_id=X
  → set isPro / planType / expiresOn / autoRenew
  → UI adapts (show/hide pro features, show subscription card)
  → On expiry: isPro = false, prompt to re-subscribe
```

### Price Loading

```
App mount → fetch /stripe-prices
  → cache in memory for session
  → filter status=current, type=regular
  → display plan cards (monthly $10, annual $90, lifetime $169)
```

---

---

## IAP Configuration (Concrete Values)

### Product IDs

| Codebase | Product ID | Type | Status |
|---|---|---|---|
| Nuxt Classic (`zerotohero-nuxt/`) | `"pro"` | Non-consumable | ✅ Live on App Store since 2023 |
| GO Legacy (`language-player-3/`) | `"pro_go"` | Non-consumable | ✅ Implemented + shipped 2024-07; `react-native-iap` removed in SDK 57 upgrade (`b6fe809`), stub now returns null |
| New mobile (`apps/mobile/`) | `"pro_go"` | Non-consumable | ⬜ Use the GO listing's ID — the app replaces GO under `ca.zerotohero.go` (Phase 5) |

### Bundle IDs

| Build | Bundle ID | Used By |
|---|---|---|
| Nuxt/Capacitor production | `ca.zerotohero.app` | App Store listing "Language Player 2" |
| GO legacy production | `ca.zerotohero.go` | App Store listing "Language Player GO" |
| New mobile (all builds) | `ca.zerotohero.go` | `apps/mobile/app.json` — replaces the GO listing as "Language Player 3" (SPEC-048) |

### Apple Shared Secret

The shared secret is stored in the environment variable `APPLE_SHARED_SECRET` in `zerotohero-python-server/.env`. It is **account-level** (not app-specific). It works for all bundle IDs under this developer account.

### Python Backend Receipt Validation (`app_in_app_purchase.py`)

- Uses `inapppy`'s `AppStoreValidator`
- Hardcodes `bundle_id = 'ca.zerotohero.go'` — this is the bundle ID expected in the receipt
- Auto-retries on wrong environment (sandbox vs production) via `auto_retry_wrong_env_request = True`
- Always grants **lifetime** subscription (the only IAP product type)
- Strips receipt data to just `transaction_id` for storage in Directus
- Endpoint: `POST /in_app_purchase_success` with `{ user_id, receipt }`
- Returns `{ type: 'success', message, user_id, receipt, validation_result }` on success

### Nuxt IAP Flow (Reference for Mobile Port)

Source: `zerotohero-nuxt/components/PurchaseiOS.vue`

1. **Register**: `$inAppPurchase2.register([{ id: "pro", type: NON_CONSUMABLE }])`
2. **Refresh**: `$inAppPurchase2.refresh()` — loads product info + restores past purchases
3. **Purchase**: `$inAppPurchase2.order("pro")` → shows Apple payment sheet
4. **Approve**: `.approved()` handler calls `product.verify()` (server-side receipt check)
5. **Verified**: `.verified()` handler extracts `product.transaction.appStoreReceipt`
6. **Elevate**: `POST /in_app_purchase_success` with `{ user_id, receipt }`
7. **Redirect**: On success → `/go-pro-success`
8. **Finish**: `product.finish()` — marks transaction as complete

For mobile port, map:
- `$inAppPurchase2.register()` → `InAppPurchases.connectAsync()`
- `$inAppPurchase2.order()` → `InAppPurchases.purchaseItemAsync()`
- `product.transaction.appStoreReceipt` → result from `purchaseItemAsync`
- The receipt POST endpoint and payload shape are identical

### GO Legacy IAP (Failed Attempt — Learn From)

The GO legacy app at `apps/mobile-go-legacy/` removed `react-native-iap` during SDK 57 migration. The stubbed `IOSPaymentMethods.tsx` returns `null`. The git history (`git show b6fe809^`) shows the original used `react-native-iap` with product ID `'pro_go'` — a **different** product from the Nuxt app's `"pro"`. This means:
- Users who purchased via the GO app used product `"pro_go"` under bundle
  `ca.zerotohero.go`
- The Python backend validates it fine (shared secret is account-level, and
  the validator now uses the `.go` bundle)
- The new mobile app keeps the GO listing/bundle and therefore **inherits
  `"pro_go"`** — existing GO buyers can restore their purchase

**Lesson**: Use the GO listing's product ID **`"pro_go"`**, not Classic's
`"pro"`. `"pro"` belongs to `ca.zerotohero.app` (Classic / Language Player
2) and is **not** visible under the GO listing's bundle.

---

## Current State Audit

### What Works Across All Frontends

| Component | Classic Nuxt | GO Legacy | Web (apps/web) | Mobile (apps/mobile) |
|---|---|---|---|---|
| Stripe Credit Card | ✅ | ✅ (stub) | ✅ | ✅ |
| WeChat Pay (CNY) | ✅ | ✅ (stub) | ✅ | ✅ |
| Alipay (CNY) | ✅ | ✅ (stub) | ✅ | ✅ |
| PayPal | ✅ Lifetime only | ❌ | 🟡 Link to classic | 🟡 Link to classic |
| iOS IAP | ✅ Lifetime only | ❌ Stubbed | N/A | ❌ Missing |
| Google Play Billing | ❌ No Play listing | ❌ No Play listing | N/A | ❌ Missing |
| Subscription status check | ✅ Vuex store | ✅ SubscriptionContext | ✅ useSubscription hook | ❌ Missing |
| Auto-renew check | ✅ | ✅ | ✅ | ❌ Missing |
| Cancel subscription | ✅ | ✅ | ✅ | ❌ Missing |
| Sale pricing | ✅ | ❌ | ❌ | ❌ |
| Feature comparison | ✅ FeatureComparison | ❌ | ✅ | ✅ Inline per-plan |

### API Client State

| Endpoint | Nuxt | GO Legacy | apps/web | apps/mobile |
|---|---|---|---|---|
| `GET /stripe-prices` | ✅ | ✅ | ✅ `lib/prices.ts` | ✅ Inline fetch |
| `GET /user-subscription` | ✅ | ✅ | ✅ `use-subscription.ts` | ❌ Missing |
| `POST /create-stripe-checkout-session` | ❌ (uses old stripe-checkout.js) | ❌ | ✅ | ✅ |
| `POST /in_app_purchase_success` | ✅ | ✅ `subscription.ts` | N/A | ❌ Missing |
| `POST /cancel-subscription-at-end-of-period` | ✅ Vuex action | ✅ CancelSubscription | ❌ Missing | ❌ Missing |

---

## Implementation Plan

### Phase 1: Shared Types

**File**: `packages/shared/src/types.ts`

Add subscription types:

```typescript
/** Raw subscription record from the Directus `subscriptions` collection. */
interface Subscription {
  id: number;
  owner: number;
  type: 'monthly' | 'annual' | 'lifetime' | 'trial';
  expires_on: string | null; // ISO date string, null for lifetime
  payment_processor: 'stripe' | 'paypal' | 'app-store' | null;
  payment_customer_id: string | null;
  payment_id: string | null;
  payment_date: string | null;
  payment_email: string | null;
  status: string;
  notes: string | null;
}

/** Computed subscription state resolved by hooks/contexts. */
interface SubscriptionState {
  sub: Subscription | null;
  loaded: boolean;
  isPro: boolean; // lifetime = true, or expires_on > now
  planType: 'monthly' | 'annual' | 'lifetime' | 'trial' | null;
  isLifetime: boolean;
  isExpired: boolean;
  willAutoRenew: boolean;
  daysUntilExpiry: number | null;
}
```

### Phase 2: Shared Price Utilities

**File**: `packages/api-client/src/prices.ts`

```typescript
interface StripePrice {
  plan: 'monthly' | 'annual' | 'lifetime';
  type: 'regular' | 'sale';
  mode: 'subscription' | 'payment';
  currency: 'usd' | 'cny';
  amount: number;
  id: string;
  paymentLink?: string;
}

async function fetchPrices(): Promise<StripePrice[]>;
function findUsdPrice(prices: StripePrice[], plan: string, type?: string): StripePrice | undefined;
function findCnyPrice(prices: StripePrice[], plan: string, type?: string): StripePrice | undefined;
function getActivePrices(prices: StripePrice[]): StripePrice[];
```

### Phase 3: Web — Subscription Hook & API Client

**File**: `packages/api-client/src/subscriptions.ts`

```typescript
async function getUserSubscription(userId: string): Promise<Subscription | null>;
async function createStripeCheckoutSession(priceId: string, userId: string, host: string, mode: string): Promise<{ url: string }>;
async function cancelSubscriptionAtEndOfPeriod(customerId: string): Promise<void>;
```

**File**: `apps/web/src/hooks/use-subscription.ts` (already exists — verify and extend)

The existing hook fetches `/user-subscription?user_id=X`. Ensure it also exposes:
- `willAutoRenew`: `['monthly','annual'].includes(type) && payment_customer_id !== null && !isExpired`
- `cancelAtEndOfPeriod()`: POSTs to `/cancel-subscription-at-end-of-period`

**File**: `apps/web/src/app/[l1]/[l2]/go-pro/page.tsx` (already exists — verify gaps)

Gaps to fill:
- **PayPal**: Add a button that creates a checkout on the web (Stripe-hosted) or links to languageplayer.io/go-pro. Currently shows a text message; replace with a direct PayPal button using the PayPal JS SDK.
- **Sale**: Add sale banner + sale price logic when {SALE} is active (prices with `type: 'sale'`).
- **Cancel subscription**: Add a cancel button in the subscription status section.
- **Caching**: The price fetch should have a stale-while-revalidate pattern (currently plain fetch).

### Phase 4: Mobile — Subscription Context

**New file**: `apps/mobile/contexts/SubscriptionContext.tsx`

Modeled after the GO legacy's `SubscriptionContext.tsx` but with the same API as the web's `useSubscription` hook.

```typescript
interface SubscriptionContextValue {
  subscription: Subscription | null;
  isPro: boolean;
  planType: string | null;
  isLifetime: boolean;
  willAutoRenew: boolean;
  daysUntilExpiry: number | null;
  loaded: boolean;
  fetchSubscription: () => Promise<void>;
  cancelSubscription: () => Promise<void>;
}

function SubscriptionProvider({ children }: { children: ReactNode }): JSX.Element;
function useSubscription(): SubscriptionContextValue;
```

Key behaviors:
- On mount: if user is logged in, fetch `/user-subscription?user_id=X`
- `subscriptionIsActive`: lifetime = true; else `new Date(expires_on) > new Date()`
- `subscriptionWillAutoRenew`: monthly or annual + has `payment_customer_id` + active
- `cancelSubscription`: POST `/cancel-subscription-at-end-of-period` with `customer_id`
- Store result in context, accessible via `useSubscription()`

### Phase 5: Mobile — IAP Implementation

**New file**: `apps/mobile/lib/iap.ts`

Use `expo-in-app-purchases` (Expo SDK 57 supports this natively via `expo-in-app-purchases` package — the same package that replaced `react-native-iap` post-SDK-51).

```typescript
/** Product ID must match App Store Connect. Use "pro_go" — the GO listing's
 *  non-consumable product. The new app replaces the GO app under
 *  `ca.zerotohero.go`, so existing GO buyers can restore via this ID.
 *  Classic's "pro" belongs to `ca.zerotohero.app` and is NOT used here. */
const IOS_IAP_PRODUCT_ID = "pro_go";
const NON_CONSUMABLE = "non-consumable"; // or use expo-in-app-purchases constant

interface PurchaseResult {
  /** Base64-encoded App Store receipt (same as `product.transaction.appStoreReceipt` in Nuxt) */
  receipt: string;
  transactionId: string;
}

async function purchaseLifetime(): Promise<PurchaseResult>;
async function restorePurchases(): Promise<boolean>;
```

**Purchase flow** (mapped from Nuxt `PurchaseiOS.vue`):

| Nuxt (`@ionic-native/in-app-purchase-2`) | Mobile (`expo-in-app-purchases`) |
|---|---|
| `register([{ id: "pro", type: NON_CONSUMABLE }])` | Connect on mount: `InAppPurchases.connectAsync()` |
| `order("pro")` | `InAppPurchases.purchaseItemAsync("pro_go")` |
| `.approved()` → `product.verify()` | (Handled by StoreKit automatically) |
| `.verified()` → `product.transaction.appStoreReceipt` | Result contains receipt data |
| `POST /in_app_purchase_success { user_id, receipt }` | **Same endpoint, same payload shape** |
| `/go-pro-success` redirect | Navigate to success screen |
| `product.finish()` | `InAppPurchases.finishTransactionAsync()` |

**Full flow**:
1. On mount: `connectAsync()` to set up the payment queue
2. User taps "Pay $169" on lifetime plan → `purchaseItemAsync("pro_go")`
3. Apple shows payment sheet → user approves → resolves with receipt + transaction data
4. POST `{ user_id, receipt }` to `PYTHON_API_URL + "/in_app_purchase_success"`
5. Python backend validates via `AppStoreValidator` with `bundle_id = 'ca.zerotohero.go'`
6. On success (`res.data.type === "success"`): call `finishTransactionAsync()` and navigate to success
7. Refresh subscription state via `fetchSubscription()`

**Restore purchases**:
- Add a "Restore Purchases" button below payment options
- Calls `InAppPurchases.getPurchaseHistoryAsync()` (iOS 15+, falls back to StoreKit receipt refresh)
- Finds the "pro_go" purchase, extracts receipt
- POST the receipt to `/in_app_purchase_success` (same endpoint — idempotent, skips if already granted)
- On success: refresh subscription state, show "Restore complete" toast
- If no purchase found: show "No purchases to restore" message

**Important**: The bundle ID is now `ca.zerotohero.go` for all builds (dev,
TestFlight, production) — the GO listing's bundle, which the new app
replaces (SPEC-048). Apple's `verifyReceipt` works against the GO listing,
and `restorePurchases()` finds the existing GO `"pro_go"` product. Classic's
`ca.zerotohero.app` / `"pro"` stays with the Classic app.

**Important**: The Python backend hardcodes `bundle_id = 'ca.zerotohero.go'`
in `app_in_app_purchase.py`. This must match the production app's bundle
ID — it now does (2026-08-10).

**Important**: Since `expo-in-app-purchases` uses the same StoreKit framework, the receipt format is identical to what the Nuxt app sends. The Python backend cannot distinguish between a purchase from the old app and the new app — which is the desired behavior for Option B.

### Phase 6: Mobile — Go Pro Screen Refinements

**File**: `apps/mobile/app/(tabs)/(me)/go-pro.tsx`

Gaps to fill:
- **Subscription status**: Show current plan badge if user has active subscription, with expiry date and auto-renew status. Add "Cancel" button for auto-renewing plans.
- **Plan restrictions on iOS**: Follow GO legacy pattern — on iOS, only show lifetime plan (no monthly/annual) unless the user already has an active monthly/annual subscription. Show "Only lifetime plan available on iOS" message (reuse `OnlyLifetimePlan` pattern).
- **IAP button**: Add "Pay with Apple Pay / Buy" button for lifetime plan on iOS.
- **Restore Purchases**: Add restore button below payment options.
- **Sale banner**: Add sale pricing when applicable (prices with `type: 'sale'`).
- **Feature comparison**: Consider adding a side-by-side comparison like the web's FeatureComparison.

### Phase 7: Mobile — Subscription-Aware UI

Files that need subscription awareness:
- `apps/mobile/app/(tabs)/(me)/profile.tsx` — Show subscription card (plan type, expiry, cancel button)
- `apps/mobile/app/(tabs)/(me)/index.tsx` — Show "Go Pro" badge or "Pro" badge on profile menu
- Settings screen — Add "Subscription" row that navigates to Go Pro or shows status
- Various pro-feature gates (transcript lines, examples count) — already partially implemented?

### Phase 8: Web — PayPal Direct Integration

Replace the current "PayPal available on the Classic app" text with a direct PayPal button:

```typescript
// apps/web/src/app/[l1]/[l2]/go-pro/page.tsx
// For lifetime plan only (PayPal only supports lifetime):
// Use @paypal/react-paypal-js
// Flow: createOrder → onApprove → POST /paypal_checkout_success
// Redirect to /go-pro-success on completion
```

### Phase 9: Sale Pricing

The Python backend already has sale pricing in `prices.csv` (type: 'sale', e.g. $84.50 lifetime USD). The Classic app shows a sale banner and applies the sale price. The web and mobile apps should do the same:

1. Check if any prices with `type: 'sale'` exist in the price list
2. If yes, show a sale banner with discount percentage
3. Replace the regular price with the sale price for the affected plan

**Sale detection** (from `zerotohero-nuxt/lib/utils/variables.js`):
```typescript
const SALE = SALE_START_DATE && SALE_END_DATE && new Date() >= SALE_START_DATE && new Date() <= SALE_END_DATE;
```

Move this to `packages/shared` or `packages/api-client` so both apps share the same logic.

---

## Files to Touch

| Phase | File | Change |
|---|---|---|
| 1 | `packages/shared/src/types.ts` | Add `Subscription`, `SubscriptionState` types |
| 2 | `packages/api-client/src/prices.ts` | **NEW** — Price fetching + helpers |
| 2 | `packages/api-client/src/subscriptions.ts` | **NEW** — Subscription API client |
| 3 | `apps/web/src/hooks/use-subscription.ts` | Extend with cancel, auto-renew |
| 3 | `apps/web/src/app/[l1]/[l2]/go-pro/page.tsx` | Add PayPal, sale, cancel button |
| 4 | `apps/mobile/contexts/SubscriptionContext.tsx` | **NEW** — Subscription state |
| 5 | `apps/mobile/lib/iap.ts` | **NEW** — IAP purchase + restore |
| 5 | `apps/mobile/app/_layout.tsx` | Wrap with SubscriptionProvider |
| 6 | `apps/mobile/app/(tabs)/(me)/go-pro.tsx` | Add IAP, subscription status, iOS gating, restore, sale |
| 7 | `apps/mobile/app/(tabs)/(me)/profile.tsx` | Add subscription card |
| 7 | `apps/mobile/app/(tabs)/(me)/index.tsx` | Add Pro badge |
| 8 | `apps/web/src/app/[l1]/[l2]/go-pro/page.tsx` | Direct PayPal button |
| 9 | `packages/shared/src/sale.ts` | **NEW** — Sale detection logic |
| — | `translations.csv` | Add any new i18n keys for subscription status |

---

## Python Backend — No Changes Needed

All existing Python endpoints are production-tested and unchanged:

| Endpoint | Method | Purpose |
|---|---|---|
| `/stripe-prices` | GET | Returns parsed `prices.csv` |
| `/user-subscription` | GET | Returns user's current subscription |
| `/create-stripe-checkout-session` | POST | Creates Stripe Checkout Session, returns URL |
| `/stripe_checkout_success` | GET | Stripe success callback |
| `/webhook-stripe-checkout-session-completed` | POST | Stripe webhook — initial purchase |
| `/webhook-stripe-subscription-invoice-paid` | POST | Stripe webhook — recurring payment |
| `/paypal_checkout_success` | GET | PayPal success callback |
| `/in_app_purchase_success` | POST | Apple receipt validation |
| `/cancel-subscription-at-end-of-period` | POST | Cancel Stripe subscription |
| `/admin/update_or_add_subscription` | POST | Admin — create/update subscription |
| `/admin/check_user_subscription` | GET | Admin — lookup by email |

---

## Edge Cases & States

| State | Handling |
|---|---|
| **User has active subscription** | Show plan card with "Current Plan" badge, expiry date, cancel button |
| **User has lifetime subscription** | Show lifetime badge, no expiry, no cancel (non-consumable) |
| **User has auto-renewing subscription** | Show "Cancels on X" after cancellation, "Auto-renews in X days" otherwise |
| **Subscription expired** | Show expired badge with "Renew" button. Allow re-purchase of same or higher plan |
| **User on iOS, no IAP** | Show only lifetime plan. Non-lifetime plans show "Only lifetime available on iOS" message |
| **Sale active** | Show colored banner at top. Discounted price on lifetime plan card |
| **Price fetch fails** | Show plan cards with hardcoded defaults, retry in background |
| **Subscription fetch fails** | Assume free tier (no pro features). Retry on next mount |
| **Stripe Checkout fails** | Show error message with retry button |
| **IAP purchase fails** | Show error, log receipt for debugging |
| **Receipt validation fails** | Show "Contact support" with receipt data |
| **IAP restore finds no purchases** | Show "No purchases to restore" message |
| **Multiple devices, same Apple ID** | `restorePurchases()` returns the purchase on any device; backend uses the same receipt validation |

---

## Backward Compatibility

- Existing Nuxt and GO apps continue working unchanged
- Python backend endpoints are untouched — no migration needed
- Existing subscriptions in Directus are unaffected
- The new `packages/api-client` modules wrap existing endpoints
- The mobile `SubscriptionContext` mirrors the GO legacy's API for easy migration

## Prerequisites

1. **Apple App Store**: No new IAP product needed. The GO listing's existing
   non-consumable `"pro_go"` under bundle ID `ca.zerotohero.go` is already
   live (shipped with the GO app). The new app keeps that bundle ID and
   product, so existing GO buyers can restore. Classic's `"pro"` under
   `ca.zerotohero.app` is untouched.
2. **IAP Dependency**: Install `expo-in-app-purchases` in `apps/mobile` — Expo SDK 57 compatible, replaces `react-native-iap` used by the GO legacy.
3. **PayPal Dependency**: Install `@paypal/react-paypal-js` in `apps/web` (optional — can use link-to-classic approach).
4. **Google Play**: No Google Play listing exists (developer account was deleted after failure to renew business info). Before Google Play Billing can work, the following chain is needed:
   - Create a new Google Play Developer account ($25 fee)
   - Create the app in Play Console (complete store listing, content rating, etc.)
   - Configure IAP product IDs in Play Console (e.g. `"pro"` — these must match what the code uses)
   - Build the AAB with `expo-in-app-purchases` referencing the configured IDs
   - Upload the AAB to an internal test track and add testers
   
   Until that chain is complete, Google Play Billing is blocked at the Play Console setup step. Android IAP is out of scope for this spec — focus on iOS IAP first.
5. **Env variables** (already in `zerotohero-python-server/.env`, gitignored — values not listed here to avoid committing secrets):
   - `APPLE_SHARED_SECRET`
   - `STRIPE_TEST_KEY`, `STRIPE_LIVE_KEY`
   - `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`
   - `DIRECTUS_TOKEN`

## Pricing Reference

Single source of truth: `zerotohero-python-server/data/prices.csv`

### Current Regular Prices

| Plan | USD | CNY | Mode |
|---|---|---|---|
| Monthly | $10 | ¥73 | Subscription |
| Annual | $90 | ¥653 | Subscription |
| Lifetime | $169 | ¥1,227 | One-time payment |

### Sale Prices (when `SALE` flag is active)

| Plan | USD | CNY |
|---|---|---|
| Lifetime (sale) | $84.50 (50% off) | ¥608 |

### Legacy Prices (grandfathered, `status=legacy`)

| Plan | USD |
|---|---|
| Monthly (legacy) | $6 |
| Annual (legacy) | $59 |

Sale detection logic (from `zerotohero-nuxt/lib/utils/variables.js`):

```typescript
const SALE_START_DATE = new Date('2024-07-01');  // Placeholder — check actual dates
const SALE_END_DATE = new Date('2024-08-01');
const SALE = SALE_START_DATE && SALE_END_DATE && new Date() >= SALE_START_DATE && new Date() <= SALE_END_DATE;
```

Actual sale dates should be verified from the Classic app or `prices.csv` metadata before implementing Phase 9.
