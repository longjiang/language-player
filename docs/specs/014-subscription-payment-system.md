# SPEC-014: Subscription & Payment System

## Metadata

- **Spec ID**: SPEC-014
- **Feature**: Subscription purchase, verification, and management across web, mobile, and Classic
- **Status**: Active — implementation mostly landed; testing is tracked in SPEC-054
- **Created**: 2026-07-25 · **Updated**: 2026-09-22
- **Based on**: ARCH-015 (payment method constraints), ADR-0013 (app store strategy), SPEC-048 (store release)
- **See also**:
  - `docs/arch/022-payment-subscription-mailerlite.md` — as-built architecture
  - `docs/adr/0048-client-side-sale-window-gating.md` — how a sale window and a sale price are resolved
  - `docs/specs/054-subscription-payment-testing.md` — phased test plan
  - `docs/specs/048-mobile-release-plan.md` — App Store / Play release plan
  - `zerotohero-python-server/routes/payments.py` — payment routes + `/stripe-prices`
  - `zerotohero-python-server/routes/subscriptions.py` — subscription routes
  - `zerotohero-python-server/app_stripe_checkout.py` — Stripe integration
  - `zerotohero-python-server/app_paypal_checkout.py` — PayPal integration
  - `zerotohero-python-server/app_in_app_purchase.py` — Apple IAP receipt validation
  - `zerotohero-python-server/utils_subscription.py` — subscription CRUD + grants
  - `zerotohero-python-server/data/prices.csv` — sale/regular price amounts and Stripe ids
  - `packages/shared/src/sale.ts` — the sale window + price resolution both apps use
  - `zerotohero-nuxt/lib/utils/variables.js` — Classic's `SALE` / `SALE_DISCOUNT` constants

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

## Mid-Autumn sale (2026)

A 50%-off lifetime-Pro sale on web and mobile: **0:00 Sep 21 → 23:59:59.999
Sep 27, 2026, in the user's own timezone**. Lifetime only, matching Classic
(`zerotohero-nuxt/components/Pricing.vue` puts `SALE` on the lifetime card alone)
and the only `type=sale` rows that exist in `prices.csv`.

Full rationale: [ADR-0048](../adr/0048-client-side-sale-window-gating.md). The
short version is that the two halves of "50% off until Sep 27" come from
different authorities:

| Question | Authority | Where |
|---|---|---|
| **When** is the sale running? | The device clock, one shared definition | `packages/shared/src/sale.ts` — `SALE_START_LOCAL`, `SALE_END_LOCAL`, `isSaleWindowOpen()`, `isPlanOnSale()` |
| **How much** does it cost? | The backend price rows | `prices.csv` `type=sale` row → Stripe `price_id` / Payment Link |
| What will the **store** bill on mobile? | App Store Connect / Play Console | `getStorePrice()` → StoreKit / Play Billing `displayPrice` |

### Sale prices

| Currency | Regular | Sale | Stripe id |
|---|---|---|---|
| USD | 169 | **84.50** | `price_1QN5p2G5EbMGvOafLuatCuKc` |
| CNY | 1227 | **608** | Payment Link `https://buy.stripe.com/9AQ3fD2krfM7aKk7sM` |

These rows are `status=archived` in `prices.csv`. That is deliberate and
harmless: `findSalePrice()` in `packages/shared/src/sale.ts` ignores `status`,
because the column is an ops flag that is `archived` outside a run and must not
be able to hide a discount the window has opened. **Do not add a `status`
check to that lookup** — the sale becomes invisible again.

The displayed percentage is derived from the rows (`getSaleDiscount()`, → 50%
for both currencies), not from the `SALE_DISCOUNT` constant, so a banner can
never promise a discount that checkout will not honour. The constant remains the
fallback for surfaces that quote no price at all.

### Behaviour per surface

| Surface | Web | Mobile |
|---|---|---|
| go-pro page | Banner, struck-through $169 + $84.50, sale badge on the lifetime card; checkout sends the sale `price_id` / CNY Payment Link | Banner, live store price with strikethrough once the store confirms it |
| Pricing list | Landing section (`components/landing/pricing-section.tsx`) — lifetime row + banner. Price rows fetched only while the window is open | Profile plan list (`app/(tabs)/(me)/profile.tsx`) — same treatment. Mobile has no landing page |
| Upgrade prompts | `SaleNotice` in the transcript footer, subs-search strip, review settings | `SaleNotice` in the same three places |
| Discount claim | Shown; the web checkout charges the sale price | Shown only once the store price proves it |

**iOS / Android store policy.** A store price cannot be discounted by the app:
`pro_go` costs whatever App Store Connect / Play Console say. Mobile therefore
never claims a discount on an IAP button — it displays StoreKit / Play Billing's
own `displayPrice` and only strikes through a regular price when the store's
numeric amount is genuinely below our regular row (`hasStoreDiscount()`). Classic
had the same constraint and commented the warning out
(`zerotohero-nuxt/components/PaymentMethods.vue`).

### Manual step: the store prices (not in this repo)

To make the 50% off real on mobile, `pro_go` must be repriced in **both**
consoles by hand:

1. **Before Sep 21** — lower `pro_go` in App Store Connect and Play Console to
   the equivalent of roughly USD 84.50. Apple only allows its own price points,
   so the achievable value may be **84.99**, not 84.50; prices are per-storefront,
   so other currencies do not follow USD automatically. Google Play price
   changes must be **published** and can go through review.
2. **After Sep 27** — restore both prices to 169-equivalent, or `pro_go` sells
   at half price indefinitely.

This is safe to get wrong in one direction only: if a console price is not
lowered, the mobile UI shows the full store price and claims no discount (the
sale chrome needs `hasStoreDiscount()`). If it is lowered and then forgotten, the
price stays low but the sale banner still stops at the window — the discount
appears as a plain price, with no strike-through.

Nothing server-side is flipped to start or end the sale, so there is no discount
state to forget to revert.

### Known limitations

- **The sale cannot be exercised in Stripe test mode.** `prices.csv` has no
  `test_price_id` for the sale rows, so `findSalePrice()` returns nothing and
  checkout falls back to the regular price. The web go-pro page logs this
  fallback. Add test ids for the sale rows to change that.
- **Client clocks are user-controlled.** Moving the device date shows the sale
  outside the window, and since the checkout honours the price id the client
  sends, a user could buy at the sale price. Accepted: the sale price is a
  legitimate published price. Closing it means enforcing the window in
  `/create-stripe-checkout-session`.
- **Changing the dates needs a deploy** — the window is a client constant. Web
  needs a deploy; mobile needs a build (or an OTA update for the shared package).
- **Storefronts outside USD and CNY get no discount claim on mobile.**
  `hasStoreDiscount()` can only compare the store's amount against a regular row
  we hold, and `prices.csv` has USD and CNY only. In a EUR, GBP, JPY, … storefront
  the mobile UI therefore shows the store price with no strike-through and the
  banner shows no percentage — conservative and never wrong, but the discount is
  invisible in those storefronts even when the console price has been lowered.
  Adding regular rows for those currencies, or a per-storefront regular-price
  source, is what would close it.

### Deliberate non-goals

- **Apple IAP / Google Play Billing discounts.** No discounted store product was
  created; the store price is simply repriced for the window.
- **Archived Classic sales.** Classic keeps its own `SALE_*` constants and its
  own (Feb 2026) window; this sale is the web/mobile pair only.


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
| Sale active | Banner + discounted lifetime price on web, mobile, and Classic — see § Mid-Autumn sale |
| Sale window open but no usable sale price row | Fall back to the regular price and log it (web); the discount is not claimed (mobile). Never charge an amount the UI did not show |
| Sale window open, store price not lowered | Mobile shows the full store price and claims no discount (`hasStoreDiscount`) |
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
- **Sale pricing on web** (`2026-09-22`, ADR-0048) — go-pro page, landing
  pricing section, and the upgrade prompts; the checkout sends the sale price id
  so the charged amount matches the advertised one
- Store-policy cleanup: non-IAP payment UI removed from the mobile app
  (SPEC-054 Phase 3) — iOS is Apple IAP only, Android buys on the website

Open work:

- **Web direct PayPal** — currently links to Classic
- **Sale window enforcement server-side** — `/create-stripe-checkout-session`
  currently trusts the price id the client sends, so a client-side window can be
  bypassed by changing the device clock (ADR-0048, "Costs / limits")
- **Sale test prices** — `prices.csv` has no `test_price_id` for the sale rows,
  so the sale cannot be tested in Stripe test mode
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
