# SPEC-067: Language Player 3 — Google Play Release Runbook

## Metadata

- **Spec ID**: SPEC-067
- **Feature**: End-to-end Google Play release of `apps/mobile` ("Language Player 3") — verified Play account, Android AAB build and signing, Play Console setup, testing tracks, and staged production rollout
- **Status**: draft (ready to execute; blockers listed in [§ 9](#9-known-blockers--open-items))
- **Created**: 2026-08-11
- **See also**: [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md) · [SPEC-014 — Subscription/Payment](014-subscription-payment-system.md) · [SPEC-048 — Mobile Release Plan](048-mobile-release-plan.md) · [SPEC-054 — Subscription & Payment Testing](054-subscription-payment-testing.md) · [SPEC-064 — iOS Development Build Runbook](064-ios-development-build-runbook.md)

## 1. Context

- The Play Developer account is **existing and verified (2026-08-11)** — it
  was never deleted; the business-info renewal lapsed, and reverification is
  now complete (ADR-0013). No account work remains; the remaining Google Play
  setup is creating the "Language Player 3" app and Play Billing.
- Classic **"Language Player 2"** is already live on Google Play under
  `ca.zerotohero.app`. This spec covers the **new** "Language Player 3"
  listing on the same account.
- Language Player 3's Android package is **`ca.zerotohero.go`** (matches the
  iOS bundle ID), version `3.0.0`.
- There is **no committed `android/` native project** — the directory is
  generated locally by `expo prebuild` and ignored by git. Every release
  starts from `apps/mobile/app.json`.
- **Google Play Billing is not implemented yet.** The Android Go Pro screen
  currently shows a clickable "buy on our website" link, which is a Google
  Play policy problem for a production release — see [§ 5](#5-billing--monetization-blocker).

> These are manual runbook steps for a human. Do **not** ask an AI agent to
> execute `expo prebuild` or `gradlew bundleRelease` in this workspace
> (AGENTS.md forbids running builds here).

## 2. Pre-flight checklist

- [x] Play Console account verified (2026-08-11) and business info current
- [ ] Node 22 available (`nvm use 22`)
- [ ] JDK 17+ and Android SDK available (`java -version`, `adb --version`)
- [ ] Upload key generated and passwords stored in a password manager
- [ ] Version bumped in `apps/mobile/app.json`
- [ ] Privacy policy URL confirmed live
- [ ] Store assets ready: icon (512×512), feature graphic (1024×500), phone
      and tablet screenshots
- [ ] Billing decision made: Play Billing implemented, **or** the Android
      buy-on-website link removed ([§ 5](#5-billing--monetization-blocker))

## 3. Build the release AAB

### 3.1 Prerequisites

```bash
cd /Users/longjiang/Projects/language-player/apps/mobile
source ~/.nvm/nvm.sh && nvm use 22
node -v   # must print v22.x
```

### 3.2 Version bump

Edit `apps/mobile/app.json`:

- `expo.version` — user-facing version, e.g. `3.0.0`
- `android.versionCode` — monotonic per Android release; first release is
  `1`. If it is absent, add `"versionCode": 1` under the `android` object so
  future bumps are explicit.
- `ios.buildNumber` — keep in sync for dual-store releases (SPEC-048 § 2).

### 3.3 Generate the native project

```bash
EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca \
  npx expo prebuild --platform android
```

This creates `android/` locally. It is gitignored (global `android` ignore),
so the generated project is per-machine.

- Verify the generated package is `ca.zerotohero.go` and the version/version
  code match `app.json` (check `android/app/build.gradle`).
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

1. **All apps → Create app**.
2. App name: **Language Player 3**.
3. Default language: English (United States) — or the primary store locale.
4. App or game: **App**.
5. Free or paid: **Free** (in-app purchases via Play Billing once
   implemented).
6. Confirm the package `ca.zerotohero.go` matches the AAB.

### 4.3 App content

1. **Privacy policy URL** — the web app serves one at
   `https://languageplayer.io/[l1]/[l2]/docs/privacy-policy`; confirm the
   exact live URL (e.g. `https://languageplayer.io/en/en/docs/privacy-policy`)
   before entering it. Content lives in `packages/docs/content/privacy-policy.md`.
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

1. Short description (80 characters) and full description.
2. Category: **Education**.
3. Contact email (e.g. `jon.long@zerotohero.ca`) and website
   (`https://languageplayer.io`).
4. Icon (512×512), feature graphic (1024×500), phone screenshots (2–8) and
   tablet screenshots.
5. Promo text (optional, short-lived).

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

1. **Internal testing** — upload `app-release.aab`, add internal testers,
   install on a real device, run QA (§ 3.7).
2. **Closed testing** — promote the same build, add opt-in testers via the
   testing link, run the full QA + billing checklist if applicable.
3. **Open testing** (optional) — before production if wider feedback is
   wanted.
4. **Production** — upload the reviewed AAB and roll out **staged**:
   10% → 25% → 50% → 100%. Monitor **Android Vitals** (crashes, ANRs, battery,
   render) after each step.

## 7. Post-release

- Keep the Internal/Closed tracks fresh with the next build.
- Bump `android.versionCode` for every subsequent upload (monotonic).
- If Play Billing is live, monitor subscription grants and restore behavior.
- Rollback: pause the staged rollout, or unpublish the version and roll back
  to the previous AAB.

## 8. Release checklist

- [x] Play account verified / business info current (2026-08-11)
- [ ] `app.json` version + `android.versionCode` bumped
- [ ] AAB built with `EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca`
- [ ] AAB signed with the upload key (`key.properties` + `build.gradle`)
- [ ] No `localhost:5001` in the embedded bundle; `pythonvps` present
- [ ] Human QA passed on a real Android device (internal track)
- [ ] Privacy policy, data safety, content rating, target audience complete
- [ ] Store listing complete (icon, feature graphic, screenshots, descriptions)
- [ ] Billing compliance resolved (§ 5)
- [ ] Production rollout staged and monitored

## 9. Known blockers / open items

- **Play Billing not implemented** — the clickable buy-on-website button must
  be replaced or removed before production submission (§ 5).
- **"Language Player 3" app not created in Play Console yet** — create it
  under `ca.zerotohero.go` (§ 4.2).
- **Play Billing product not created yet** — lifetime non-consumable product
  TBD; create it in Play Console and implement billing per SPEC-054 (§ 5).
- **Upload key not generated yet** — `~/.android/lp-upload.jks` does not exist
  until § 3.4 is run.
- **Store assets not prepared** — screenshots, feature graphic, and final
  descriptions are outstanding.
- **`android.versionCode` not explicit in `app.json` yet** — add `1` for the
  first release.
- **Privacy policy URL to confirm** — verify the live `languageplayer.io`
  route before entering it in Play Console.

## 10. Related docs

- [SPEC-048 § 4 — Mobile Release Plan (concise Android overview)](048-mobile-release-plan.md)
- [SPEC-014 — Subscription/Payment System](014-subscription-payment-system.md)
- [SPEC-054 — Subscription & Payment Testing](054-subscription-payment-testing.md)
- [SPEC-068 — Google Play Billing Implementation](068-google-play-billing-implementation.md)
- [ADR-0013 — App Store Strategy](0013-app-store-strategy.md)
- [SPEC-064 — iOS Development Build Runbook](064-ios-development-build-runbook.md)
