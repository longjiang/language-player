# ADR-0013: App Store Strategy & Product Naming

**Date**: 2026-07-25
**Status**: accepted

## Context

We have two iOS apps live on the App Store, both offering essentially the same product (language learning with video content) but built on different tech stacks and named differently:

| App | Store Name | Bundle ID | Tech | App Store Link |
|---|---|---|---|---|
| **Classic Nuxt** | Language Player 2 | `ca.zerotohero.app` | Ionic/Capacitor wrapper around Nuxt web app | [App Store](https://apps.apple.com/ca/app/language-player-2/id1623985525) |
| **GO Legacy** | Language Player GO | `ca.zerotohero.go` | React Native (Expo SDK ~51) | [App Store](https://apps.apple.com/ca/app/language-player-go/id6520385296) |
| **New app (dev)** | Language Player | `ca.zerotohero.languageplayer` | React Native (Expo SDK 57) — not yet submitted | — |

We have **no app in the Google Play Store** — our account was deleted after we neglected to renew our business information.

### Naming Constraint

The plain name "Language Player" is already taken by another developer on the App Store. Attempting to use it as an app name produces Apple's error:

> English (U.S.) Name couldn't be saved because the app name you entered is already being used. If you have trademark rights to this name and would like it released for your use, [submit a claim](https://www.apple.com/legal/internet-services/itunes/appnamenotices/).

We could potentially register a trademark for "Language Player" and file a dispute to claim the name, but this would require legal action and is unlikely to be worth the effort for a descriptive name used by multiple apps. This option is not explored further in this ADR.

This is why the existing apps are named "Language Player 2" and "Language Player GO" — the "2" suffix was the original disambiguator for the Nuxt app.

### IAP Situation

Both apps have their own separate (but functionally identical) non-consumable IAP product at USD $169 for a lifetime subscription. The Python backend validates both via `app_in_app_purchase.py` and grants the same lifetime subscription regardless of which app the purchase was made in. The single source of truth for pricing is the Python backend's `/stripe-prices` endpoint (see ARCH-015).

### The New App

The new React Native/Expo app at `apps/mobile/` (Expo SDK 57) is now the active development target. It has:
- Stripe credit card, WeChat Pay, Alipay, and PayPal payment flows
- **No IAP yet** (the GO legacy's `react-native-iap` was removed for SDK 57 compatibility)
- Feature parity with `apps/web`
- Offline tokenization for most supported L2s
- Offline dictionary downloads for English L1

---

## Decision

**Option B** is selected: remove the GO app from the store, replace the Nuxt app's binary with the new `apps/mobile` build under the existing bundle ID `ca.zerotohero.app`, and rename the listing to "Language Player 3". See the full evaluation below.

---

## Decision Options

### Option A: Three Apps — Keep Both Legacy Apps, Launch New App

Keep both existing apps as-is on the store, rename them to signal their deprecated status, and submit the new app under a fresh listing.

| App | Proposed Name | Action |
|---|---|---|
| Classic Nuxt | "Language Player 2 (Legacy)" or "LP Classic" | Keep, rename, mark as deprecated in description |
| GO Legacy | "Language Player GO (Legacy)" | Keep, rename, mark as deprecated in description |
| New app | "Language Player 3" | New submission |

**Pros:**
- No disruption for existing users — both apps continue working
- Existing IAP users unaffected
- No risk of accidentally breaking a live app during migration

**Cons:**
- **Three apps with nearly identical names** on the store searching "Language Player" will show 3 results plus the unrelated competitor's app
- User confusion: "Which one should I download?"
- App Store review for the new app starts from scratch (no guarantee of acceptance)
- Maintenance burden: three apps to keep alive
- The "3" suffix suggests there will be a "4" later — a branding dead end
- Existing downloads and ratings split across three listings

### Option B: Replace the Nuxt Binary, Remove GO

Remove the GO app from the store. Replace the release binary of the Classic Nuxt app (Language Player 2) with the new `apps/mobile` build, and rename it to "Language Player 3".

| App | Action |
|---|---|
| Classic Nuxt | Replace binary with apps/mobile build, rename to "Language Player 3" |
| GO Legacy | Remove from App Store |
| New app | (uses existing bundle ID `ca.zerotohero.app`) |

**Pros:**
- **Single app** on the store — no confusion
- **Preserves existing IAP product** — the new app shares the same bundle ID (`ca.zerotohero.app`), so Apple's `verifyReceipt` will recognize the existing non-consumable product. Users who already purchased see their lifetime subscription carry over automatically
- Retains existing ratings, reviews, and download history
- One app to maintain
- No need for Apple to approve a new app entry (it's an update to an existing listing)

**Cons:**
- **Risk during the transition** — a buggy release affects all users; no canary
- Must ensure the new binary handles the existing IAP receipt validation correctly before shipping
- Existing Language Player 2 users get a significantly different UI/UX — potentially jarring
- Loses the GO app's ratings/reviews (which are separate from the Nuxt app's listing)
- Renaming to "Language Player 3" still signals version churn

### Option C: Single App — Brand New Name

Create a brand-new app listing with a distinct name (not "Language Player X") and phase out both legacy apps over time. E.g., "Zero to Hero" (matching the domain name).

**Pros:**
- Clean break from the legacy brand
- No confusion with the competitor's "Language Player"
- Can build fresh App Store presence (ratings, screenshots, description)
- New name can be trademarked

**Cons:**
- **Zero existing user base** on the new listing
- Existing users don't auto-migrate — need to communicate the transition
- Existing IAP products are attached to the old bundle IDs — no automatic carry-over
- Must handle the transition gracefully (could prompt existing users to verify their purchase against the old app's receipt?)
- App Store review from scratch
- Brand recognition loss — "Language Player" is descriptive and searchable

---

## Recommendations

| Criteria | A (3 apps) | B (Replace+rename) | D (New name) |
|---|---|---|---|
| User confusion | 🔴 High | 🟢 Low | 🟢 Low |
| Existing IAP carry-over | 🟢 Seamless | 🟢 Seamless | 🔴 Broken |
| Dev maintenance | 🔴 3 apps | 🟢 1 app | 🟢 1 app |
| Ratings/reviews preserved | 🟢 All | 🟡 Half | 🔴 None |
| User trust (fresh start) | 🟡 OK | 🟡 OK | 🟢 Clean |

**Option B** is selected: replace the Nuxt app binary with the new `apps/mobile` build under the existing bundle ID and rename to "Language Player 3". This:

1. Preserves the existing IAP product and bundle ID — users who purchased get restoration
2. Keeps a single app on the store — no confusion
3. Retains the Nuxt app's ratings and reviews
4. Drops the GO app which is the older codebase

**Prerequisites before executing Option B:**
1. Implement IAP in `apps/mobile` using RevenueCat or `expo-in-app-purchases`
2. Verify receipt validation against the existing `ca.zerotohero.app` bundle ID
3. Test `restorePurchases()` with an account that has the legacy IAP product
4. Remove the GO app from the store
5. Push the update as a new version of "Language Player 3"

## Consequences

The critical dependency for Options B is IAP. The new app needs a working IAP implementation before it can replace the Nuxt binary (otherwise existing users lose the ability to purchase the lifetime subscription in-app on iOS).

The Nuxt/Capacitor app and the GO app each have their own IAP products with separate bundle IDs (`ca.zerotohero.app` and `ca.zerotohero.go`), but they share the same backend validation endpoint (`POST /in_app_purchase_success`). The Python backend checks the receipt against Apple's `verifyReceipt` endpoint and grants a lifetime subscription regardless of which bundle ID was used.

**Key constraint**: Apple's `restoreCompletedTransactions` only restores purchases for the current app's bundle ID. The Nuxt app uses `ca.zerotohero.app`, while the new app currently uses `ca.zerotohero.languageplayer` in its Expo config.

**For Option B** (replace Nuxt binary), we would change the new app's bundle ID from `ca.zerotohero.languageplayer` to `ca.zerotohero.app` for the App Store release build. This preserves:
- The existing app listing and reviews
- Existing IAP — `restorePurchases()` works because the bundle ID matches
- Users who purchased via the Nuxt app see their lifetime subscription carry over

The `ca.zerotohero.languageplayer` bundle ID can remain for development/testing builds (side-loaded via Expo Go or TestFlight).

**Option B preserves the Nuxt bundle ID** (`ca.zerotohero.app`), meaning `restorePurchases()` from the existing app works. This is a strong argument for this option.

---

**Prerequisites before executing Option C:**
1. Implement IAP in `apps/mobile` using RevenueCat or `expo-in-app-purchases`
2. Verify receipt validation against the existing `ca.zerotohero.app` bundle ID
3. Test `restorePurchases()` with an account that has the legacy IAP product
4. Remove the GO app from the store
5. Push the update as a new version of "Language Player 2"

## Consequences

- If we remove the GO app, its IAP product becomes inaccessible for new purchases. Existing purchasers can still restore via App Store (the product remains in their purchase history).
- The Google Play Store gap remains. If we want Android distribution, we'd need to re-register and submit as a new developer account with the new app.
- If the competitor's "Language Player" app causes confusion, a rebrand to "Zero to Hero" (matching the domain) remains an option for a future major version.
