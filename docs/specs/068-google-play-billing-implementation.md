# SPEC-068: Google Play Billing — Implementation & Test Plan

## Metadata

- **Spec ID**: SPEC-068
- **Feature**: Implement Google Play Billing for `apps/mobile` ("Language Player 3") — Play Console setup, mobile purchase flow, backend verification, device testing on a Pixel, and the path to a signed AAB
- **Status**: draft
- **Created**: 2026-08-11
- **See also**: [SPEC-014 — Subscription/Payment](014-subscription-payment-system.md) · [SPEC-054 — Subscription & Payment Testing](054-subscription-payment-testing.md) · [SPEC-067 — Google Play Release Runbook](067-google-play-release-runbook.md) · [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md)

## 1. Current state

- ✅ Play Developer account **verified 2026-08-11**; business info current.
- ✅ Classic "Language Player 2" is live on both the App Store and Google Play
  (`ca.zerotohero.app`).
- ✅ The **"Language Player 3" app exists in Play Console** (package
  `ca.zerotohero.go`, created 2026-08-12).
- ✅ The **`pro_go` billing product is created + activated** (2026-08-13),
  and the release-signed AAB (v1 / 3.0.0) is uploaded to **Internal testing**.
- ✅ **Play Billing is implemented** in `apps/mobile` (Step 2) and the
  backend (Step 3); the Android buy-on-website button was removed.
- ✅ **Dev build installed and QA'd on the Pixel** (Step 4); LogBox warnings
  suppressed; store screenshot sets produced (SPEC-070).
- ✅ **Upload key generated** (`~/.android/lp-upload.jks`, alias `lp-upload`,
  2026-08-12).

## 2. Goal

Android users can buy a lifetime Pro subscription through Play Billing; the
backend verifies the purchase with Google and grants the same lifetime
subscription as iOS IAP. Exit criterion: SPEC-054 § 3.4 (G1–G5, C3/C5/C6/C7 on
Android) is complete and the Android app is store-compliant (no external
payment links). **SPEC-068 is the execution plan for SPEC-054 Phase 3 — the
tests here are the same tests, not duplicates. When a SPEC-068 test passes,
mark the corresponding SPEC-054 § 3.4 item complete.**

## 3. Step 0 — Decisions (confirm before coding)

- [x] **Product ID**: **`pro_go`** (confirmed 2026-08-11) — matches the iOS
  product. Play product IDs cannot be renamed after creation.
- [x] **Test accounts**: **Mary/Bob** (`tester.mary@zerotohero.ca` /
  `tester.bob@zerotohero.ca`) as license testers (confirmed 2026-08-11).
- [ ] **Backend test target**: "push to production" here does **not** mean a
  public store release — the AAB stays on the private **Internal testing**
  track. It only means the test build points at the production Flask backend
  (`https://pythonvps.zerotohero.ca`) because internal-track builds need a
  reachable API URL, and G1/G3 will grant real lifetime rows to Mary/Bob in
  the production database (license testers are not charged). This matches how
  Apple IAP was tested. Alternative: point the internal-track build at a
  staging backend instead, which avoids production rows but requires a
  staging Flask server with the Google service account credentials. Or point
  it at local Flask (`http://<mac-lan-ip>:5001`) — no deploy at all, but the
  Pixel and Mac must share a network and the Mac must be running the server
  during the test.

## 4. Step 1 — Play Console setup (human)

- [x] Re-verify account status is green (done 2026-08-11; no action expected).
- [x] Create the app: **Language Player 3**, package `ca.zerotohero.go`,
  Free with in-app purchases (SPEC-067 § 4.2) — created 2026-08-12.
- [x] Create the lifetime **non-consumable** billing product (SPEC-067 § 5) —
  **`pro_go` created + activated 2026-08-13** (merchant account set up
  2026-08-12: existing "Jiang Long" payments profile 1672-5871-2559, business
  "Zero to Hero", Computer Software, jon.long@zerotohero.ca, statement name
  "LanguagePlyr"). Product details: Name "Lifetime Pro", one-time Buy,
  purchase option `lifetime-pro`, base price **US$169** in 173 countries/
  regions (tax-adjusted per region), tax category Digital app sales. Created
  after the release-signed AAB (v1 / 3.0.0) was uploaded to **Internal
  testing** on 2026-08-13 (BILLING permission gate satisfied).
- [x] License testers configured under **Settings → License testing** —
  2026-08-13: selected the "Language Player Internal Testing Email List"
  (license response RESPOND_NORMALLY). The planned
  `longjiang2005+googleplaytester@gmail.com` **was rejected by Play Console**
  ("This email address doesn't exist" — plus aliases are not accepted in
  tester lists), so the canonical **`longjiang2005@gmail.com`** (already on
  the list) is the tester. `tester.mary@`/`tester.bob@zerotohero.ca` were
  also rejected because they are not real Google accounts.
- [x] Enable API access — **done 2026-08-13**:
  - Google Cloud project **`zh-zerotohero`** (existing) hosts the API.
  - **Google Play Android Developer API enabled** in that project
    (androidpublisher.googleapis.com).
  - Reused the existing **`language-player@zh-zerotohero.iam.gserviceaccount.com`**
    service account (already used by `app_google_analytics.py`); created a
    fresh JSON key (`zh-zerotohero-06d7b3c0d121.json`, downloaded to
    ~/Downloads, copied to `zerotohero-python-server/data/` — gitignored).
  - Invited the service account in Play Console → **Users & permissions**
    and granted **View financial data, orders, and cancellation survey
    responses** + **Manage orders and subscriptions** (both required for the
    Play Billing verification API; confirmed checked + saved at Account
    level, user **Active** / never expires). 2026-08-13: removed + re-invited
    the service account with both permissions to force propagation.
  - Backend env (`.env`, gitignored):
    `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=./data/zh-zerotohero-06d7b3c0d121.json`,
    `GOOGLE_PLAY_PACKAGE_NAME=ca.zerotohero.go`,
    `GOOGLE_PLAY_PRODUCT_ID=pro_go`. Flask restarted on port 5001.
  - ⚠️ **Troubleshooting (2026-08-13):** test purchases failed backend
    verification with **401 `permissionDenied`** — a bogus token returns the
    same 401 (both `ca.zerotohero.go` and `ca.zerotohero.app`), so auth is
    fine but the grant was not yet effective in the API (Play's authorization
    cache). Full config audit confirmed correct: key file belongs to
    `language-player@zh-zerotohero.iam.gserviceaccount.com`, service account
    **Active**/never expires, both financial permissions **checked + saved**
    at Account level, Android Publisher API **Enabled** on GCP. Re-invite
    done (2026-08-13). Watcher `/tmp/watch_gp_permission.sh` ran **120 min
    and timed out with all-401** — still within the documented minutes–24–48h
    propagation window. Acceptance test = bogus token returns **404**.
  - ℹ️ **All test orders were REFUNDED (2026-08-13):** `GPA.3377-5570-7018-81586`
    (refunded 03:24 UTC, ~5 min after processing) plus `GPA.3324-2952-3923-56166`,
    `GPA.3363-0458-2728-79942`, `GPA.3381-5857-0619-68235` — all show
    **Refunded / CAD 0.00** in Order management. Because the backend never
    acknowledged the purchases, nothing is restorable on-device ("Can't find
    restorable purchase" is correct behavior). Once the API returns 404, make
    **one fresh test purchase** → Restore Purchases → validate + grant.
  - 🌐 **Production is the target:** the Pixel release build (Closed testing)
    calls `https://pythonvps.zerotohero.ca/play_billing_success` (via
    `EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca` in
    `apps/mobile/.env.production.local`, inlined by Metro in Release builds —
    NOT the local Flask). Backend code + `.env` + service-account key were
    deployed to production 2026-08-12.
- [x] Set up the **Internal testing** track — release published 2026-08-13
  with `app-release.aab` (v1 / 3.0.0); the "Language Player Internal Testing
  Email List" (`longjiang2005@gmail.com`) is the track tester list.
- [x] **Promoted to Closed testing (Alpha) 2026-08-13** — the internal-track
  spend limits blocked the US$169 test purchase ("purchase limit for today" —
  unpublished apps are subject to daily transaction/per-order/daily-spend
  limits; Google docs recommend publishing to closed/open/production to lift
  them). Promoted release 1 (3.0.0) to **Closed testing - Alpha**, added
  **177 countries/regions**, attached the same tester email list, and sent
  **14 changes for review** (status: "Changes in review"). Closed-track opt-in
  links:
  - Android: `https://play.google.com/store/apps/details?id=ca.zerotohero.go`
  - Web: `https://play.google.com/apps/testing/ca.zerotohero.go`
  **Note:** after promotion the Internal opt-in link no longer applies — use
  the Closed testing links above (or Play still treats it as the old track).
  Testers must sign in with `longjiang2005@gmail.com` on the Pixel, opt in,
  install, log in, and retry G1.

## 5. Step 2 — Mobile implementation (Codex/human pair)

### 5.1 `apps/mobile/lib/iap.ts` — make it cross-platform

- [x] `IAP_AVAILABLE` → `Platform.OS === 'ios' || Platform.OS === 'android'`.
- [x] Add `ANDROID_IAP_PRODUCT_ID = 'pro_go'` (or the Step 0 decision).
- [x] `initiatePurchase(userId)`:
  - iOS: unchanged (`apple: { sku, appAccountToken: userId }`).
  - Android: `google: { skus: [ANDROID_IAP_PRODUCT_ID], obfuscatedAccountId: userId }`
    so the backend can bind the purchase to the signed-in user (same security
    model as Apple's `appAccountToken`).
- [x] Purchase listener: accept purchases for either product ID; on Android,
  `purchase.purchaseToken` is the token the backend verifies (same field the
  iOS code already reads as the JWS).
- [x] `finishTransaction({ purchase, isConsumable: false })` — on Android this
  acknowledges the purchase; Google auto-refunds unacknowledged purchases
  after 3 days.
- [x] `restorePurchases()`: `getAvailablePurchases()` already works on Android;
  filter by product ID and return `purchaseToken`.

### 5.2 `apps/mobile/app/(tabs)/(me)/go-pro.tsx`

- [x] Replace the Android "buy on our website" block with the same
  Lifetime purchase + Restore Purchases UI iOS has.
- [x] On Android, POST `{ user_id, purchase_token, product_id }` to
  `POST /play_billing_success` (Step 3).
- [x] Keep monthly/annual gated on Android (store billing is lifetime-only,
  same as iOS).
- [x] Map backend error messages to the existing localized error keys
  (`msg.receipt_validation_failed`, `msg.iap_purchase_failed`,
  `msg.iap_purchase_not_for_account`, etc.).
- [x] Remove the now-unused buy-on-website link and `Linking` import if no
  longer used elsewhere on the page.

### 5.3 Verify

- [x] Typecheck: `cd apps/mobile && ./node_modules/.bin/tsc --noEmit`.

## 6. Step 3 — Backend implementation (Codex)

### 6.1 New module `zerotohero-python-server/app_google_play.py`

- [x] Verify via Play Developer API:
  `GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{packageName}/purchases/products/{productId}/tokens/{token}`
- [x] Authenticate with the service account JSON (scope
  `https://www.googleapis.com/auth/androidpublisher`).
- [x] Accept only:
  - package = `ca.zerotohero.go`
  - product = configured `GOOGLE_PLAY_PRODUCT_ID` (`pro_go`)
  - `purchaseState = 0` (purchased)
  - `obfuscatedExternalAccountId` == requesting `user_id` (reject missing or
    mismatched, mirroring the Apple `appAccountToken` rule)
- [x] Grant via `update_or_add_subscription`:
  - `type=lifetime`, `expires_on=None`, `status=active`
  - `payment_processor='play-billing'`
  - `payment_id=orderId` (the existing unique index makes replay idempotent)
- [x] Return the same `{ type: 'success' | 'error', message }` shape as Apple
  IAP so the mobile error mapping stays uniform.

### 6.2 Route `zerotohero-python-server/routes/payments.py`

- [x] Add `POST /play_billing_success` accepting `user_id`, `purchase_token`,
  `product_id`; 400 on missing fields.

### 6.3 Environment (`zerotohero-python-server/.env`, gitignored)

- [ ] `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — the service account key (JSON
  string or absolute file path; see `zerotohero-python-server/.env.example`).
- [x] `GOOGLE_PLAY_PACKAGE_NAME=ca.zerotohero.go`
- [x] `GOOGLE_PLAY_PRODUCT_ID=pro_go`
- [x] Add `google-auth` to `requirements.txt` (already a transitive dep via
  `google-analytics-data`, but declare it explicitly).

> `zerotohero-python-server/.env.example` documents the Google Play vars;
> copy them into the real `.env` and restart Flask after setting the service
> account key.

### 6.4 Tests (pytest, mirror `test_phase0_subscriptions.py`)

- [x] Mocked successful verification → lifetime row with
  `payment_processor=play-billing`, `payment_id=orderId`.
- [x] Bogus purchase token → no grant, defined error (G5).
- [x] Wrong/missing `obfuscatedExternalAccountId` → rejected (user binding).
- [x] Same token re-POSTed → single grant (idempotency / restore replay).

## 7. Step 4 — Dev build on the Pixel (app QA, no billing)

- [x] `cd apps/mobile && source ~/.nvm/nvm.sh && nvm use 22`
- [x] `npx expo prebuild --platform android`
- [x] `npx expo run:android` (or build a debug APK) and install on the Pixel.
- [x] Smoke-test login, language selection, Explore/video, dictionary, reader,
  offline mode, deep links, back button (SPEC-048 § 1.3 Android subset).
- [x] Confirm the buy/restore UI renders on Android (billing will error until
  Step 5, which is expected).

## 8. Step 5 — Signed AAB → Internal testing (billing starts here)

- [x] Configure the upload key + `android/key.properties` + release signing
  (SPEC-067 § 3.4).
- [ ] `EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca npx expo prebuild --platform android`
  (re-apply signing edits if the project was regenerated) — **deferred**: the
  uploaded AAB predates the `intentFilters`/`associatedDomains` config
  (SPEC-069); regenerate + rebuild before production.
- [x] `cd android && ./gradlew bundleRelease` — built 2026-08-12/13, signed,
  70 MB AAB.
- [x] Verify no `localhost:5001` in the embedded bundle (SPEC-067 § 3.6) —
  `pythonvps.zerotohero.ca` present, no localhost.
- [x] Upload `app-release.aab` to **Internal testing** in Play Console —
  published 2026-08-13.
- [ ] Install from Play on the Pixel using a license-tester account (Mary/Bob).
- [ ] Confirm the production backend has the Google service account env vars
  set and is reachable (`pythonvps.zerotohero.ca`).

## 9. Step 6 — Run the Play Billing test matrix

- [ ] **G1** — license tester → Go Pro → Play Billing button → confirm → backend
  verifies token → `type=lifetime`, `payment_processor=play-billing` → Pro
  unlocks.
- [ ] **G2** — "always declines" test card → purchase fails → no subscription
  row → localized error, no stuck state.
- [ ] **G3** — promote to Closed testing → repeat G1 on the test-track build.
- [ ] **G4** — reinstall or second device → Restore Purchases → token
  re-validated → single re-grant (no duplicate row).
- [ ] **G5** — bogus purchase token → backend rejects (covered by pytest in
  § 6.4; re-verify against the route).
- [ ] **C3** — Android purchase appears as lifetime on web/profile.
- [ ] **C5/C6/C7** — free/Pro gates flip, cancel-at-period-end (N/A for
  lifetime), success/error screens on Android.

## 10. SPEC-054 Phase 3 traceability

Every Play Billing test in this spec maps to a SPEC-054 Phase 3 item. Complete
the SPEC-068 checkboxes first, then copy the ✅ into SPEC-054 § 3.4 — do not
re-run the same scenarios under a different spec number.

| SPEC-068 step | SPEC-054 Phase 3 item | What passing means |
|---|---|---|
| § 6.4 pytest (mocked success, bogus token, user binding, idempotent replay) | G5 + backend grant path | Bogus/unverified tokens never grant; verified purchases create one `play-billing` lifetime row |
| § 9 G1 | G1 — license tester purchase | Play test purchase completes; backend grants `type=lifetime`, `payment_processor=play-billing`; Pro unlocks |
| § 9 G2 | G2 — always-declines instrument | Purchase fails; no subscription row; no stuck state |
| § 9 G3 | G3 — internal/closed test-track build | Same grant path works from a Play-distributed build |
| § 9 G4 | G4 — restore/entitlement sync | Reinstall/second device re-validates; single re-grant, no duplicate row |
| § 9 G5 | G5 — bogus purchase token | Route rejects; defined error response |
| § 9 C3 | C3 — lifetime sync | Android purchase shows as lifetime on web/profile |
| § 9 C5/C6/C7 | C5/C6/C7 on Android | Free/Pro gates, cancel-at-period-end (N/A for lifetime), success/error screens |
| § 11 store compliance | § 3.4 store-compliance checkbox | No external payment links in the Android app |
| § 12 release checklist | § 3.4 exit criterion | Android in-app purchase ready for submission and approval |

## 11. Step 7 — Store compliance & promotion

- [ ] No external payment links in the Android app (buy-on-website removed).
- [ ] SPEC-054 § 3.4 checkboxes updated (implementation + G1–G5 + C3/C5/C6/C7).
- [ ] SPEC-014 / SPEC-048 / SPEC-067 updated with the product ID and final
  backend behavior.
- [ ] Promote Internal → Closed → Open (optional) → Production staged rollout
  (SPEC-067 § 6).

## 12. Release checklist (summary)

- [x] Play Console app created (`ca.zerotohero.go`)
- [x] Billing product created and configured (`pro_go`, US$169, activated
  2026-08-13)
- [ ] License testers added
- [ ] Service account + Android Publisher API enabled
- [x] Mobile purchase/restore flow implemented (iOS + Android)
- [x] Backend `/play_billing_success` implemented + pytest green
- [x] Dev build QA on Pixel passed
- [x] Signed AAB uploaded to Internal testing (v1 / 3.0.0, published
  2026-08-13)
- [ ] G1–G5 passed
- [ ] Store compliance checked (no external payment links)

## 13. Open items / decisions

- ~~Product ID~~ — ✅ `pro_go` confirmed.
- **Backend test target** (Step 0) — ✅ **production** (AAB embeds
  `https://pythonvps.zerotohero.ca`); service account env vars still pending
  on the production backend before G1–G5.
- **Universal links** — the uploaded AAB predates
  `intentFilters`/`associatedDomains`; run `expo prebuild` + rebuild before
  production (SPEC-069).
- Service account key + `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` on the chosen
  backend; Flask restart required.
- ~~Upload key~~ — ✅ generated 2026-08-12 (`~/.android/lp-upload.jks`).
- Store listing assets — ✅ produced (SPEC-070); upload/assign in each store
  console remains manual.
