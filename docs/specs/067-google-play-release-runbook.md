# SPEC-067: Language Player 3 — Google Play Release Runbook

## Metadata

- **Spec ID**: SPEC-067
- **Feature**: End-to-end Google Play release of `apps/mobile` ("Language Player 3") — verified Play account, Android AAB build and signing, Play Console setup, testing tracks, and staged production rollout
- **Status**: in progress — Play Console app setup executed 2026-08-12; AAB built & submitted to production for review 2026-08-13; store visual assets remain ([§ 9](#9-known-blockers--open-items))
- **Created**: 2026-08-11
- **Updated**: 2026-08-13
- **See also**: [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md) · [SPEC-014 — Subscription/Payment](014-subscription-payment-system.md) · [SPEC-048 — Mobile Release Plan](048-mobile-release-plan.md) · [SPEC-054 — Subscription & Payment Testing](054-subscription-payment-testing.md) · [SPEC-064 — iOS Development Build Runbook](064-ios-development-build-runbook.md)

## 1. Context

- The Play Developer account is **existing and verified (2026-08-11)** — it
  was never deleted; the business-info renewal lapsed, and reverification is
  now complete (ADR-0013). No account work remains. The "Language Player 3"
  app was created on 2026-08-12; what remains is Play Billing, the AAB build,
  store visual assets, and rollout.
- Classic **"Language Player 2"** is already live on Google Play under
  `ca.zerotohero.app`. This spec covers the **new** "Language Player 3"
  listing on the same account.
- Language Player 3's Android package is **`ca.zerotohero.go`** (matches the
  iOS bundle ID), version `3.0.0`.
- There is **no committed `android/` native project** — the directory is
  generated locally by `expo prebuild` and ignored by git. Every release
  starts from `apps/mobile/app.config.js`.
- **Google Play Billing is not implemented yet.** The Android Go Pro screen
  currently shows a clickable "buy on our website" link, which is a Google
  Play policy problem for a production release — see [§ 5](#5-billing--monetization-blocker).

> These are manual runbook steps for a human. Do **not** ask an AI agent to
> execute `expo prebuild` or `gradlew bundleRelease` in this workspace
> (AGENTS.md forbids running builds here).

## 2. Pre-flight checklist

- [x] Play Console account verified (2026-08-11) and business info current
- [x] Node 22 available (`nvm use 22` — v22.23.1 verified 2026-08-12)
- [x] JDK 17+ and Android SDK available (Java 22 + Android SDK 36
      platform-tools/build-tools installed 2026-08-12)
- [x] Upload key generated (2026-08-12, `~/.android/lp-upload.jks`, alias
      `lp-upload`) — credentials in `~/.android/lp-upload-credentials.txt` +
      `android/key.properties`; **copy them into a password manager**
- [x] Version bumped in `apps/mobile/app.json` (3.0.0, `android.versionCode: 2`)
- [x] Privacy policy URL confirmed live (Netlify preview domain — see § 4.3)
- [~] Store assets partially ready: icon uploaded to the Play asset library as
      "Cropped - icon.png" (512×512, from `apps/mobile/assets/icon.png`) but not
      yet added to the App icon slot; feature graphic (1024×500) and phone/
      tablet screenshots still outstanding
- [x] Billing decision made: Play Billing implemented (SPEC-068 Steps 2–3,
      product ID `pro_go`); the Android buy-on-website link was removed
      ([§ 5](#5-billing--monetization-blocker))

## 3. Build the release AAB

### 3.1 Prerequisites

```bash
cd /Users/longjiang/Projects/language-player/apps/mobile
source ~/.nvm/nvm.sh && nvm use 22
node -v   # must print v22.x
```

### 3.2 Version bump

Edit `packages/shared/src/version.json` (picked up by
`apps/mobile/app.config.js`):

- `PRODUCT_VERSION` — user-facing version, e.g. `3.0.0`; use
  `scripts/bump-product-version.mjs <major|minor|patch>`.
- `PRODUCT_BUILD_NUMBER` — one shared monotonic build number for both stores;
  use `scripts/next-build.mjs`. The versionCode must stay greater than every
  previous upload on any track; never reuse one.

> **SPEC-076 (2026-08-14):** use `scripts/next-build.mjs` to assign the same
> build number to both stores and `scripts/verify-version.mjs` after prebuild
> as a gate. Consumed numbers are recorded in
> `docs/versioning/build-ledger.md` (versionCode 1 and 2 are already there).

### 3.3 Generate the native project

```bash
EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca \
  npx expo prebuild --platform android
```

This creates `android/` locally. It is gitignored (global `android` ignore),
so the generated project is per-machine.

> **Note (2026-08-14):** prebuild **clears** `android/`, which also deletes
> `android/local.properties` and `android/key.properties`. After every
> prebuild, recreate both (SDK path from the machine's Android SDK install;
> key.properties from `~/.android/lp-upload-credentials.txt`), then re-apply
> the release signing config in `android/app/build.gradle` (§ 3.4) — the
> regenerated project signs release builds with the debug key otherwise.

- Verify the generated package is `ca.zerotohero.go` and the version/version
  code match the shared config (check `android/app/build.gradle`).
- If `android/` already exists, prebuild syncs it in place. If the package ID
  or version changes and prebuild reports native code out of sync, you may
  need `--clean` — but that regenerates the project and forces you to re-apply
  the signing config in § 3.4.

### 3.4 Configure release signing (one-time per generated project)

**Generate the upload key** (once, ever):

```bash
mkdir -p ~/.android
keytool -genkeypair -v \
  -keystore ~/.android/lp-upload.jks \
  -alias lp-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Store the keystore password and key password in a password manager. The
`.jks` is gitignored; never commit it.

**Create `android/key.properties`** (also never committed):

```properties
storeFile=/Users/longjiang/.android/lp-upload.jks
storePassword=CHANGE_ME
keyAlias=lp-upload
keyPassword=CHANGE_ME
```

**Wire it into `android/app/build.gradle`.** At the top of the file, add:

```groovy
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

Then in the `android { ... }` block, add a release signing config and point
the release build type at it:

```groovy
signingConfigs {
    release {
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
        storeFile keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
        storePassword keystoreProperties['storePassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
    }
}
```

> Because `android/` is regenerated by prebuild, these edits must be re-applied
> after every `expo prebuild`. Consider saving this as a small helper script
> once the steps are proven.

### 3.5 Build

```bash
cd android
./gradlew bundleRelease
```

Output:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

An **AAB** (Android App Bundle) is required — Google derives per-device APKs
from it. Do not upload an APK to a production release.

### 3.6 Verify the AAB

1. Confirm the file exists and note its size.
2. Confirm the embedded JS bundle points at production, not localhost:

   ```bash
   cd android
   grep -c "localhost:5001" app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle || true   # expect 0
   grep -c "pythonvps.zerotohero.ca" app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle      # expect ≥ 1
   ```

3. Optionally validate the bundle format:

   ```bash
   bundletool validate --bundle=app-release.aab
   ```

### 3.7 Device QA before uploading

Upload the AAB to the **Internal testing** track ([§ 6](#6-release-tracks--rollout))
and install it from Play on a real Android phone. Run the Android subset of
the human QA checklist from SPEC-048 § 1.3 (login, language selection,
Explore/video, dictionary, reader, offline tokenization, deep links, back
button). Confirm in the app or logs that it hits
`https://pythonvps.zerotohero.ca`, never `localhost`.

## 4. Play Console — account & app setup

### 4.1 Use the verified existing account

1. Go to [play.google.com/console](https://play.google.com/console) and sign
   in with the existing developer account.
2. Confirm the account status is green/verified — **verified 2026-08-11**;
   no pending verification or business-info tasks remain.
3. Keep the business/developer info current thereafter.
4. Proceed to create the **Language Player 3** app (§ 4.2) and configure
   Play Billing (§ 5).

> Do **not** pay the one-time US$25 registration fee again — the account
> already exists. Only register a new account if Play Console ever reports
> the existing one is fully closed (ADR-0013 / SPEC-048).

### 4.2 Create the app

**Status: ✅ Done (2026-08-12)** — "Language Player 3" created under
`ca.zerotohero.go` on the verified account (dashboard live, app ID
4975392680448759197).

1. **All apps → Create app**.
2. App name: **Language Player 3**.
3. Default language: English (United States) — or the primary store locale.
4. App or game: **App**.
5. Free or paid: **Free** (in-app purchases via Play Billing once
   implemented).
6. Confirm the package `ca.zerotohero.go` matches the AAB.

### 4.3 App content

**Status: ✅ Done (2026-08-12)** — all declarations completed in Play Console:
privacy policy, sign-in details, ads (No), content rating (IARC), target
audience, data safety, advertising ID (No), government (No), financial (None),
health (None).

1. **Privacy policy URL** — **set to
   `https://language-player.netlify.app/en/en/docs/privacy-policy`**. Note:
   the `languageplayer.io/[l1]/[l2]/docs/...` routes return 404 on the live
   site; the Netlify preview domain serves them, so it is used for Play
   Console. Content lives in `packages/docs/content/privacy-policy.md`
   (updated 2026-08-11 to cover mobile apps and Google Play as a payment
   processor; all 18 locale translations regenerated).
2. **Data safety** — answer accurately per the privacy policy: account info,
   learning data, purchase history, device/usage data, Google Analytics, and
   sharing with service providers.
3. **Ads declaration** — No (confirm no ads in the app).
4. **Content rating** — complete the IARC questionnaire (category: Education).
5. **Target audience** — choose the actual audience; this is not designed as a
   child-directed app.
6. **News app**: No · **Government app**: No · **Health/Financial apps**: No.
7. **App access** — describe what works without an account vs. what requires
   login.

### 4.4 Store listing

**Status: 🟡 Partial (2026-08-12)** — text, category and contact details done;
visual assets pending (items 4).

1. Short description (80 characters) and full description. **Done** — default
   listing draft saved: short = "Learn languages by watching videos with
   interactive subtitles & dictionary." (75 chars), full description = 962
   chars.
2. Category: **Education**. **Done** (Store settings).
3. Contact email (e.g. `jon.long@zerotohero.ca`) and website
   (`https://languageplayer.io`). **Done** (Store settings).
4. Icon (512×512), feature graphic (1024×500), phone screenshots (2–8) and
   tablet screenshots. **Icon uploaded** to the Play asset library as
   "Cropped - icon.png" (512×512) but **not yet added** to the App icon slot
   (manual step: Store listings → edit → App icon → Add assets → select
   "Cropped - icon.png" → Add). Feature graphic and phone/tablet screenshots
   still outstanding.
5. Promo text (optional, short-lived).

#### Store listing graphics — asset requirements

> **See [SPEC-070 — Prepare Graphics for App Stores](070-store-graphics-checklist.md)**
> for the combined App Store + Play Store production checklist (capture once,
> reuse across both stores). This section lists the Play Store requirements.

These are the **only** store-listing graphics Google requires. There is no
splash-screen or banner requirement for the store (splash screens are app-side
assets, not store assets).

**Required:**

| Asset | Format | Size | Max file | Count / notes |
|---|---|---|---|---|
| App icon | 32-bit PNG (sRGB) | 512×512 | 1 MB | Full square — **no** rounded corners or baked-in shadows (Google adds them dynamically); avoid transparency |
| Feature graphic | PNG / JPEG | 1024×500 | 15 MB | |
| Phone screenshots | JPEG / 24-bit PNG (no alpha) | 16:9 or 9:16; each side 320–3840 px (long side ≤ 2× short side) | 8 MB each | 2–8; ≥4 @ ≥1080 px recommended for promotion (min 1920×1080 / 1080×1920) |
| 7-inch tablet screenshots | JPEG / 24-bit PNG | 16:9 or 9:16; 320–3840 px | 8 MB each | up to 8 |
| 10-inch tablet screenshots | JPEG / 24-bit PNG | 16:9 or 9:16; 1080–7680 px | 8 MB each | up to 8 |

**Optional / only if that form factor is supported:**

| Asset | When | Spec |
|---|---|---|
| Preview video (YouTube URL) | Optional | public/unlisted, ads off, not age-restricted |
| TV banner (1280×720) + ≥1 TV screenshot | Only if Android TV | |
| Chromebook screenshots | Only if ChromeOS | 4–8, 16:9 or 9:16, 1080–7680 px |
| Android XR screenshots | Only if XR | 4–8, 8:5, recommended 3840×2400 (min 1920×1200) |
| Wear OS screenshots | Only if Wear app | 1:1, ≥384×384 |

**Content rules (all screenshots):** show real in-app UI only — no device
frames, hands, or people; no store badges or Google Play icons; no ranking/
award claims ("Best", "#1", "Top") or calls-to-action ("Download now");
taglines ≤ ~20% of the image; add alt text (≤140 chars) per screenshot.

**To produce for Language Player 3 (phone + tablet only):**
1. Feature graphic — 1024×500 PNG
2. Phone screenshots — 5–8 @ 1080×1920: Explore, video player with subtitles,
   dictionary popup, saved words / review, reader
3. 7-inch tablet screenshots — 4–8 @ 16:9 (e.g. 1920×1080)
4. 10-inch tablet screenshots — 4–8 @ 16:9 (e.g. 1920×1080)
5. Optional: 30s preview video (YouTube)

### 4.5 API access for browserless uploads (service account)

**Status: ✅ set up and verified (2026-08-14)** — service account
`lp-play-billing-2@zh-zerotohero.iam.gserviceaccount.com` (project
`zh-zerotohero`) has app-level Admin/release access to `ca.zerotohero.go`.
Verified live against the Play Developer API: token minting, edit-session
creation, and track reads all returned 200. This is the first API-upload
credential (the Aug 12 upload was done manually in Play Console).

The one-time setup that led here:

1. Play Console → your app → **Setup → API access** (or Users and permissions
   → API access at account level).
2. **Create a service account** — follow Google's link, then grant it
   **Release** access to this app (the current account has app-level Admin).
3. **Create a JSON key** for the service account and download it.
4. Store the key at `scripts/lp-play-service-account.json` — gitignored,
   never committed — and wire it through the gitignored
   `scripts/.env.upload`:
   `LP_PLAY_SERVICE_ACCOUNT_JSON=/Users/longjiang/Projects/language-player/scripts/lp-play-service-account.json`
   (or export it in the shell; real environment variables take precedence).

> The key is byte-identical to
> `zerotohero-python-server/data/zh-zerotohero-lp-play-billing-2.json`
> (gitignored there too) — the same account already used for Play Billing.

## 5. Billing & monetization (blocker)

Google Play requires digital content consumed in-app to use **Play Billing**,
and prohibits external payment links (outside Google's limited
alternative-billing programs). The Android Go Pro screen
(`apps/mobile/app/(tabs)/(me)/go-pro.tsx`) currently renders a **clickable
"buy on our website" button** — that must not ship to production as-is.

Two acceptable paths:

- **A — Implement Play Billing first (recommended).** Follow SPEC-014 and
  SPEC-054: create the lifetime non-consumable product in Play Console, add
  license testers, implement billing in `apps/mobile`, run G1–G5, and verify
  the backend grant + MailerLite sync.
- **B — Ship free-tier only until billing lands.** Remove the clickable
  payment link and render informational text only (or no Go Pro UI on
  Android), so there is no external payment link in the app. Revisit Play
  Billing in a follow-up release.

If path A is chosen:

1. Play Console → your app → **Monetize with Play** → **Products** → create
   the lifetime non-consumable product (product ID TBD per SPEC-014).
2. Add license testers under **Setup → License testing**.
3. Implement billing in `apps/mobile` and run SPEC-054 G1–G5.
4. Verify a purchase grants `type=lifetime`, `payment_processor=play-billing`,
   and Pro unlocks on Android.

## 6. Release tracks & rollout

### 6.1 Upload without a browser (Play API v3, no EAS)

`scripts/upload.mjs` authenticates with the service account from § 4.5,
creates an edit, uploads the AAB, sets the track/status, and commits:

```bash
# Credentials are loaded from scripts/.env.upload (gitignored, see § 4.5).
# Optional overrides:
export LP_PLAY_SERVICE_ACCOUNT_JSON=/Users/longjiang/Projects/language-player/scripts/lp-play-service-account.json
# optional: export LP_PLAY_PACKAGE="ca.zerotohero.go"  (default)

node scripts/upload.mjs android \
  apps/mobile/android/app/build/outputs/bundle/release/app-release.aab \
  --track internal --status completed --dry-run
node scripts/upload.mjs android \
  apps/mobile/android/app/build/outputs/bundle/release/app-release.aab \
  --track internal --status completed
```

- `--track internal|closed|open|production` (default `internal`).
- `--status draft|inProgress|completed` (default `draft`; use `completed` to
  publish the release).
- `--no-commit` leaves the edit open to finish manually in Play Console.
- `--dry-run` validates flags/version without calling the API.
- After a real upload, record the consumed build number in the ledger:
  `node scripts/record-build.mjs <N> android "<track>" <version> --tag v<version>-b<N>`.
- **Gotcha:** bundle uploads use the media-upload URI
  (`/upload/androidpublisher/...`); the script handles it — a plain API URL
  returns `400 Invalid JSON payload received. Unexpected token. PK…`.
- **Verified 2026-08-14:** 3.1.0 (versionCode 3) uploaded to the Internal
  testing track via this script.

### 6.2 Track progression

1. **Internal testing** — upload `app-release.aab`, add internal testers,
   install on a real device, run QA (§ 3.7).
2. **Closed testing** — promote the same build, add opt-in testers via the
   testing link, run the full QA + billing checklist if applicable.
3. **Open testing** (optional) — before production if wider feedback is
   wanted.
4. **Production** — upload the reviewed AAB and roll out **staged**:
   10% → 25% → 50% → 100%. Monitor **Android Vitals** (crashes, ANRs, battery,
   render) after each step.

   **Production submission (2026-08-13):** release "Production 1 - 3.0.0"
   (versionCode 2) uploaded to the Production track with **full rollout**
   (100% — chosen instead of staged so the app goes live as soon as review
   passes) and **177 countries/regions** configured. Submitted via Publishing
   overview → "Submit 3 changes for review" (3 changes: production release +
   176 countries + rest-of-world countries). Status: **changes in review** —
   quick checks run first (≤14 min), then Google reviews (typically ≤7 days).
   Note: versionCode 2 was required because versionCode 1 was already used by
   the Internal/Closed testing tracks — version codes must be unique across
   ALL tracks.

## 7. Post-release

- Keep the Internal/Closed tracks fresh with the next build.
- Bump `android.versionCode` for every subsequent upload (monotonic).
- If Play Billing is live, monitor subscription grants and restore behavior.
- Rollback: pause the staged rollout, or unpublish the version and roll back
  to the previous AAB.

## 8. Release checklist

- [x] Play account verified / business info current (2026-08-11)
- [x] `app.json` version + `android.versionCode` bumped (3.0.0 / versionCode 2, 2026-08-13)
- [x] AAB built with `EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca` (release AAB, versionCode 2, 2026-08-13)
- [x] AAB signed with the upload key (`key.properties` + `build.gradle`)
- [x] No `localhost:5001` in the embedded bundle; `pythonvps` present
- [x] Human QA passed on a real Android device (internal track; Pixel — Play Billing purchase flow tested)
- [x] Privacy policy, data safety, content rating, target audience complete
- [ ] Store listing complete (icon, feature graphic, screenshots, descriptions)
      — 🟡 text/category/contact done; icon in library (add to App icon slot);
      feature graphic + screenshots outstanding
- [x] Billing compliance resolved (§ 5) — buy-on-website link removed and
      mobile + backend Play Billing implemented (SPEC-068 Steps 2–3); Play
      Console product + G1–G5 still pending
- [x] Production release created + submitted for review (2026-08-13): "Production 1 - 3.0.0", full rollout, 177 countries/regions
- [ ] Production review passed / app live
- [ ] Production rollout monitored (Android Vitals)

## 9. Known blockers / open items

- ~~**Play Billing not implemented**~~ — ✅ implemented (SPEC-068 Steps 2–3,
  2026-08-12); the buy-on-website button was removed (§ 5).
- ~~**"Language Player 3" app not created in Play Console yet**~~ — ✅ created
  under `ca.zerotohero.go` (2026-08-12, § 4.2).
- **Internal testing release published 2026-08-13** — `app-release.aab`
  (v1 / 3.0.0) uploaded and published to the **Internal testing** track
  (release name "1 (3.0.0)", notes "Initial internal testing build...").
  Track shows "Inactive" until testers join; the email list currently has
  `longjiang2005@gmail.com` only (Play requires real Google accounts — the
  app's `tester.mary/bob@zerotohero.ca` logins are not Google accounts).
- **Play Billing product created 2026-08-13** — `pro_go` (Lifetime Pro,
  US$169, 173 regions) active under Monetize → Products → One-time products;
  merchant account (payments profile 1672-5871-2559) set up 2026-08-12.
- ~~**Upload key not generated yet**~~ — ✅ generated 2026-08-12
  (`~/.android/lp-upload.jks`, alias `lp-upload`, RSA 2048); credentials are
  in `~/.android/lp-upload-credentials.txt` and `android/key.properties` —
  copy into a password manager before relying on the local files.
- **Store assets not prepared** — icon uploaded to the Play library
  ("Cropped - icon.png", 512×512) but not yet added to the App icon slot;
  feature graphic and phone/tablet screenshots still outstanding.
- **`android.versionCode` not explicit in `app.json` yet** — add `1` for the
  first release.
- ~~**`android.versionCode`**~~ — ✅ set to `2` in `app.json` + `android/app/build.gradle` (2026-08-13).
  versionCode `1` was already used by the Internal/Closed testing tracks, so
  the production upload was rejected until bumped to `2` (version codes must
  be unique across all tracks).
- **Production release submitted for review 2026-08-13** — "Production 1 -
  3.0.0" (versionCode 2, full rollout, 177 countries/regions) sent via
  Publishing overview (3 changes in review). Awaiting quick checks + Google
  review (≤7 days). If the release passes and goes live, run Android Vitals
  monitoring and re-test Play Billing on the live build.
- **Store visual assets still outstanding** — App icon slot (icon in library,
  not attached), feature graphic (1024×500), phone + tablet screenshots
  (SPEC-070). Play may flag missing store graphics during review.
- ~~**Privacy policy URL to confirm**~~ — ✅ set in Play Console to the Netlify
  domain (2026-08-12, § 4.3). Note `languageplayer.io` v3 routes still 404.

## 10. Related docs

- [SPEC-048 § 4 — Mobile Release Plan (concise Android overview)](048-mobile-release-plan.md)
- [SPEC-014 — Subscription/Payment System](014-subscription-payment-system.md)
- [SPEC-054 — Subscription & Payment Testing](054-subscription-payment-testing.md)
- [SPEC-068 — Google Play Billing Implementation](068-google-play-billing-implementation.md)
- [ADR-0013 — App Store Strategy](0013-app-store-strategy.md)
- [SPEC-064 — iOS Development Build Runbook](064-ios-development-build-runbook.md)
