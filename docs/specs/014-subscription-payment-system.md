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

## Current State Audit

### What Works Across All Frontends

| Component | Classic Nuxt | GO Legacy | Web (apps/web) | Mobile (apps/mobile) |
|---|---|---|---|---|
| Stripe Credit Card | ✅ | ✅ (stub) | ✅ | ✅ |
| WeChat Pay (CNY) | ✅ | ✅ (stub) | ✅ | ✅ |
| Alipay (CNY) | ✅ | ✅ (stub) | ✅ | ✅ |
| PayPal | ✅ Lifetime only | ❌ | 🟡 Link to classic | 🟡 Link to classic |
| iOS IAP | ✅ Lifetime only | ❌ Stubbed | N/A | ❌ Missing |
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

Use `expo-in-app-purchases` (Expo SDK 57 supports this natively).

```typescript
interface IapConfig {
  /** Product ID configured in App Store Connect. Must match the existing non-consumable "pro" used by the Nuxt app. */
  iosProductId: string; // "pro"
  /** Product ID configured in Google Play Console. We have no Google Play listing yet — stub or skip Android. */
  androidProductId: string; // "pro"
}

async function purchaseLifetime(): Promise<void>;
async function restorePurchases(): Promise<boolean>;
```

**Flow**:
1. User taps "Pay $169" on lifetime plan
2. `purchaseLifetime()` → `InAppPurchases.connectAsync()` → `InAppPurchures.purchaseItemAsync("pro")`
3. Apple shows payment sheet → user approves → `purchaseItemAsync` resolves with receipt
4. POST `/in_app_purchase_success` with `{ user_id, receipt }`
5. Python backend validates via `app_in_app_purchase.py` → creates subscription
6. Refresh subscription state via `fetchSubscription()`
7. Show success UI

**Restore**: Add a "Restore Purchases" button in Go Pro screen or Settings. Calls `InAppPurchases.getPurchaseHistoryAsync()`, finds the "pro" purchase, re-validates via backend.

**Important**: The bundle ID for the production app must be `ca.zerotohero.app` (not `ca.zerotohero.languageplayer`) for `verifyReceipt` to match the existing IAP product. See ADR-0013.

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

1. **Apple App Store**: Add the new app's bundle ID (`ca.zerotohero.app` for production) to the existing IAP product in App Store Connect (or verify the existing product works with the new app)
2. **IAP Dependency**: Install `expo-in-app-purchases` in `apps/mobile`
3. **PayPal Dependency**: Install `@paypal/react-paypal-js` in `apps/web` (optional — can use link-to-classic approach)
4. **Google Play**: If Android is desired, a new developer account is needed before Play Billing IAP
