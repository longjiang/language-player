# SPEC-048: Mobile Release Plan — Human QA + App Store & Play Store Distribution

## Metadata
- **Spec ID**: SPEC-048
- **Feature**: Pre-release (informal, human) testing + releasing `apps/mobile/` to the Apple App Store and Google Play Store
- **Status**: draft
- **Created**: 2026-08-06
- **Related**: [ADR-0027 — Defer Automated E2E — Human QA](../adr/0027-defer-automated-e2e-human-qa.md) · [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md) · [SPEC-023 — Mobile E2E Testing](023-mobile-e2e-testing.md) (deferred) · [SPEC-014 — Subscription/Payment](014-subscription-payment-system.md) · [SPEC-025 — Payment E2E](025-payment-e2e-testing.md)

## Overview

This is the **release plan for the mobile app**. It covers the full path from
code to store on both platforms:

1. **Pre-release QA** — informal, checklist-based **human** testing (per
   [ADR-0027](../adr/0027-defer-automated-e2e-human-qa.md), automated Maestro
   E2E is deferred).
2. **Apple App Store (iOS)** — build the Release archive, verify it, upload to
   App Store Connect, submit for review.
3. **Google Play Store (Android)** — register a new Play Developer account,
   build the Android AAB, and publish through Play Console.

The iOS build details and the two hard-won gotchas from the first archive
remain documented here so future releases are one-command and correct.

## Current app identity (as of 2026-08)

| Property | iOS | Android |
|---|---|---|
| App name | Language Player 3 | Language Player 3 |
| Identifier | `ca.zerotohero.go` (bundle ID — replaces the GO listing) | `ca.zerotohero.app` (package, new Play launch) |
| Version | `3.0.0` (build `1`) | `3.0.0` (versionCode `1`) |
| Min OS | iOS 16.4 | set in `app.json` |
| Production API URL | `https://pythonvps.zerotohero.ca` | same |

> Version numbers live in `apps/mobile/app.json` (`expo.version`, plus
> `ios.buildNumber` and `android.versionCode`). Bump **both** stores' versions
> on every release; the store-specific build numbers are independent.

### Store strategy (2026-08-06)

Per [ADR-0013 (revised)](../adr/0013-app-store-strategy.md):

- **iOS — Classic stays**: the Classic Nuxt app remains live as **"Language
  Player 2"**. It is **not** replaced by this app.
- **iOS — GO replaced**: this app **replaces the GO Legacy listing** and is
  named **"Language Player 3"**. The iOS build uses the GO bundle ID
  **`ca.zerotohero.go`** (set in `apps/mobile/app.json`
  `ios.bundleIdentifier` and the native project).
  **Why this ID:** a store listing's bundle ID cannot be changed, so updating
  the GO listing requires keeping `ca.zerotohero.go`. Doing so also preserves
  the GO app's IAP product (non-consumable `pro`) and existing installs'
  receipt-validation / restore continuity. It does **not** inherit the Classic
  app's `ca.zerotohero.app` IAP product — that stays with Classic. Signing must
  use a Distribution profile for `ca.zerotohero.go`.
- **Google Play — new launch**: a brand-new **"Language Player 3"** listing on
  a new Play Developer account (see § 4).

## 1. Testing strategy — informal, checklist-based human QA

**Per ADR-0027**, automated Maestro E2E (SPEC-023) is deferred. Releases are
gated by a **human-executed QA checklist** instead. This is deliberately
informal: no CI, no test runner — a reviewer runs the checklist against a
release build and ticks boxes.

The checklist is derived from SPEC-023's Tier 0–9 catalog, converted from
Maestro assertions to manual checks.

### 1.1 How to run

- Test the **exact release build** you intend to ship (install the `.app` /
  `.aab` on a device or simulator — not Expo Go).
- Use a **real device** for any check marked *device* (audio, network,
  payments); otherwise the iOS simulator is fine.
- Recommended minimum: iPhone (real), iPad (simulator), Android phone (real,
  once a build exists).

### 1.2 Pre-release QA checklist

| # | Area | SPEC-023 ref | Manual checks | Run on |
|---|---|---|---|---|
| S | Smoke | Tier 0 | Launch → login screen; login → 4 tabs render; logout returns to login | Sim |
| A | Auth & onboarding | Tier 1 | Login ok / wrong pass / empty fields; register (happy + duplicate email); forgot & reset password (deep link); verify email; delete account; language selection; session persists across background | Sim |
| M | Media | Tier 2 | Explore feed + level filter + pagination; video meta; tap subtitle word → dictionary popup; search (results + empty state); TV shows → episodes; live TV stream + mute; watch history; channel subscribe; video queue | Sim |
| D | Dictionary & vocab | Tier 3 | Search found / not found; save + unsave word; saved list (filter / sort / inline defs / source); word detail (defs + Examples / Inflections / AI Explain tabs); speak button; recent searches; popup from reader; pitch accent (ja); traditional chars (zh) | Sim |
| R | Review (SRS) | Tier 4 | No-cards-due state; card front; rate Good → next card; all-done + stats; undo; daily new-card limit | Sim |
| E | Reading | Tier 5 | Notes create/edit/rename/delete + tokenized tap; EPUB upload / read / resume + word lookup; web reader fetch + TextActionMenu (copy / AI explain / translate / speak) | Sim |
| P | Settings & profile | Tier 6 | Profile info; level change; display theme light/dark/system; playback toggles; speech voice + rate; review settings; settings search; subscription screen (pro/free) | Sim + device |
| O | Offline | Tier 7 | Download + delete offline dict; tokenizer warning (Category E); airplane-mode reading + dictionary popup; offline tokenization; offline → online sync | Device |
| IP | iPad & responsive | Tier 8 | Landscape; 1/3 + 50/50 split view; slide-over; full portrait (820) + landscape (1180); wide-screen content centering | iPad |
| L | Deep links & cross-flow | Tier 9 | `languageplayer://vocab/word/...`; `.../media/watch/...`; password-reset deep link; network loss mid-video; rapid L2 switch | Sim + device |
| Pay | Payments | SPEC-025 | Stripe card; WeChat / Alipay / PayPal; iOS IAP purchase + restore; free-tier gates | Device |

> Audio, visual-layout, offline, and payment checks require a human and
> (mostly) a real device — exactly why they are human checks rather than Maestro
> automation. See SPEC-025 for the detailed payment checklist.

### 1.3 Failure handling

- Any **blocking** failure (crash, broken login, wrong API host, corrupt data)
  stops the release — fix, rebuild, re-verify.
- Non-blocking cosmetic issues may ship but must be logged for the next release.

## 2. Release build — common to both stores

### Production API URL — REQUIRED, not optional

Set `EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca` **explicitly** on the
build command for **both** the iOS archive and the Android AAB. Do **not** rely
on `.env.production.local` — it is not reliably applied during native builds
(see [Problem #2](#2-stale-bundle-embedded-localhost5001)). `lib/api-url.ts`
already defaults Release builds to production via `__DEV__`, but the explicit
env var is the source of truth.

### Version bump

- `apps/mobile/app.json` → `expo.version` (user-facing version) plus
  `ios.buildNumber` and `android.versionCode` (monotonic per store).

## 3. Apple App Store (iOS)

> **Strategy:** this app **replaces the GO Legacy listing** and is renamed
> "Language Player 3"; the Classic app stays live as "Language Player 2". The
> build uses the GO bundle ID **`ca.zerotohero.go`** (set in
> `apps/mobile/app.json` `ios.bundleIdentifier` and the native project) because
> a listing's bundle ID cannot change — see
> [Store strategy](#store-strategy-2026-08-06) for the full reasoning.

### 3.1 Build the Release archive

Run from `apps/mobile/`:

```bash
cd /Users/longjiang/Projects/language-player/apps/mobile

rm -rf ~/Desktop/LanguagePlayer.xcarchive

EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca \
  xcodebuild \
    -workspace ios/LanguagePlayer.xcworkspace \
    -scheme LanguagePlayer \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -allowProvisioningUpdates \
    -archivePath ~/Desktop/LanguagePlayer.xcarchive \
    archive -jobs 4 2>&1 | tee /tmp/lp-archive.log
```

- `-jobs 4` is fine once the module cache is **warm**. On a **cold** DerivedData
  it can hit the RNSVG race — see
  [Problem #1](#1-rnsvg-rnsvgforeignobjectmanagermm-compile-failure-under--jobs-4-transient).
  When in doubt, `-jobs 1` is guaranteed correct (just slower).
- The archive lands at `~/Desktop/LanguagePlayer.xcarchive`.

### 3.2 Verify the archive + embedded bundle

```bash
ARCHIVE=~/Desktop/LanguagePlayer.xcarchive
plutil -p "$ARCHIVE/Info.plist"   # CreationDate, CFBundleShortVersionString, CFBundleVersion, SigningIdentity
ls -la "$ARCHIVE/Products/Applications/LanguagePlayer.app"

BUNDLE="$ARCHIVE/Products/Applications/LanguagePlayer.app/main.jsbundle"
grep -c 'pythonvps.zerotohero.ca' "$BUNDLE"   # expect ≥ 1
grep -c 'localhost:5001'          "$BUNDLE"   # expect 0
grep -c '127.0.0.1:5001'          "$BUNDLE"   # expect 0
```

The bundle is Hermes bytecode, but URL strings are plain text in the string
table, so `grep` works. If `localhost:5001` appears, the bundle is stale/wrong
— see [Problem #2](#2-stale-bundle-embedded-localhost5001).

### 3.3 Upload to App Store Connect

- **Xcode Organizer (recommended):** `open -a Xcode` → **Window → Organizer** →
  select the `LanguagePlayer` archive → **Distribute App** → **App Store
  Connect** (re-signs with the Distribution certificate during export).
- **CLI:** `xcrun notarytool submit <archive> --wait` (or legacy
  `xcrun altool --upload-app`), or drag into **Transporter**.

> **Signing note:** the raw archive is signed with the **Apple Development**
> identity + automatic provisioning (project uses `-allowProvisioningUpdates`).
> For a real submission, export with the **Apple Distribution** certificate —
> either via the project's signing settings or Xcode Organizer's Distribute
> wizard. Because this build replaces the **GO** listing, the Distribution
> profile must be for **`ca.zerotohero.go`** (the new app's production bundle
> ID), not `ca.zerotohero.app`. Confirm the build appears in App Store Connect
> under the GO app record after upload (processing takes a few minutes).

### 3.4 App Store Connect setup

- App name, subtitle, description, keywords, category, and **screenshots**
  (6.7" iPhone + iPad) + app icon.
- **App Privacy / Data Safety** answers (accounts, usage, purchases, etc.).
- **TestFlight** build for beta testers before submitting for review.
- Submit for review with **review notes**: demo account, sample video IDs,
  and a note that the app hits a real backend.

## 4. Google Play Store (Android)

### 4.1 Register a new Play Developer account

The previous Play account was **deleted after failing to renew business info**
([ADR-0013](0013-app-store-strategy.md)), so Android distribution starts from
scratch:

1. Go to [play.google.com/console](https://play.google.com/console) →
   **Create account**.
2. Choose account type:
   - **Organization** — requires business details + a **DUNS number**.
   - **Personal** — requires your name + ID; usually faster for a solo/small
     operation.
3. Provide the **developer name** (shown on the Play listing) and a **contact
   email**.
4. Accept the **Google Play Developer Distribution Agreement**.
5. Pay the **one-time US$25 registration fee**.
6. Complete **verification** (email / phone / ID) — and **keep the business /
   developer info current** thereafter. This is the step that was neglected
   before and cost the original account.

> ⚠️ Play Console's UI and requirements change; verify exact steps and pricing
> at execution time. The one-time $25 fee and the "keep business info current"
> requirement are stable facts (see SPEC-014).

### 4.2 Build the Android release (AAB)

No `android/` native dir or `eas.json` exists in `apps/mobile/` yet — generate
the native project once, then build:

```bash
cd /Users/longjiang/Projects/language-player/apps/mobile

EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca \
  npx expo prebuild --platform android

cd android && ./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

- **AAB** (Android App Bundle) is required by Play — Google derives per-device
  APKs from it. (EAS Build is a possible alternative later; the CLI route
  matches the project's manual build style.)
- **Signing:** generate an **upload key** (`keytool`), and enroll in **Play App
  Signing** — Google holds the app-signing key; you keep the upload key.

### 4.3 Play Console — publish

1. **Create app** — name, default language, app-or-game, free/paid, category.
2. **App content** — data safety form, ads declaration, **content rating**
   (IARC questionnaire), target audience, privacy policy URL, government-app
   declaration.
3. **Release management** — upload the `.aab` and roll through tracks:
   **Internal testing** → **Closed testing** (opt-in testers) → **Open
   testing** → **Production**.
4. **Store listing** — short & full description, screenshots (phone + tablet),
   feature graphic, icon, promo text, contact details.
5. **Rollout** — use a staged rollout (e.g., 10% → 100%) for Production.

### 4.4 Caveats for the first Android release

- **Google Play Billing is not implemented** (SPEC-014) — Android IAP is
  blocked until the new Play account and billing setup exist. Launch with
  free-tier features + web-based payments; add Play Billing later.
- The `pro` lifetime product exists as **iOS IAP only** today, but Pro grants
  are backend-driven — an Android user who purchased via iOS still gets Pro
  through the shared subscription grant.

## 5. Post-release

- Watch store crash reports (App Store Connect / Xcode Organizer; Play Console
  → Android Vitals).
- Keep TestFlight and Play testing tracks fresh for the next build.
- **iOS rollback:** upload a previous build or use App Store Connect's release
  controls. **Android rollback:** pause the staged rollout or unpublish the
  version.

## Problems encountered

Two real failures were hit on 2026-08-06 while producing the first App
Store–ready archive. Both are documented so they are not re-diagnosed from
scratch.

### 1. RNSVG `RNSVGForeignObjectManager.mm` compile failure under `-jobs 4` (transient)

**Symptom:** on a **cold** DerivedData, `xcodebuild archive -jobs 4` failed with:

```
error: .../react-native-svg/apple/ViewManagers/RNSVGForeignObjectManager.mm
CompileC .../RNSVGForeignObjectManager.o ... (in target 'RNSVG' from project 'Pods')
** ARCHIVE FAILED **
```

**Diagnosis:** not a code bug. Re-running the *exact* clang command for that
single file (extracted from the build's `*-common-args.resp` in DerivedData)
compiled successfully in isolation. The failure is a **parallel-build race**:
with `-fmodules` and a cold module cache, concurrent clang processes contend
writing `ModuleCache.noindex`, producing spurious "file not found" / "unknown
type" errors in random pods (RNSVG here).

**Workarounds (pick one):**
- `-jobs 1` — fully serial, guaranteed to pass (slow: a full rebuild can take
  1–2+ h on an M2).
- Rebuild with `-jobs 4` after the module cache is warm — the race does not
  reappear on incremental/warm-cache builds.

**Do not** edit `react-native-svg` source or bump its version to "fix" this.

### 2. Stale bundle embedded `localhost:5001` (production URL not baked in)

**Symptom:** the first `-jobs 1` archive built without an explicit env var
produced a `.app` whose `main.jsbundle` contained `localhost:5001` and **zero**
occurrences of `pythonvps.zerotohero.ca` — even though
`apps/mobile/.env.production.local` existed with the correct value.

**Diagnosis:** the `.env.production.local` fallback is **not reliably applied**
during `xcodebuild archive` (the bundle phase can reuse a stale/cached bundle or
not load the env file depending on how the build is invoked). The archive
silently shipped the localhost dev URL — exactly what must never reach the
stores.

**Fix (must be done every release):**
1. Set `EXPO_PUBLIC_API_URL` **explicitly** in the build command (above).
2. If re-archiving over a previous build, **delete the stale bundle** in
   DerivedData so the bundle phase is forced to re-run:

   ```bash
   DD=~/Library/Developer/Xcode/DerivedData/LanguagePlayer-*/Build/Intermediates.noindex/ArchiveIntermediates/LanguagePlayer/BuildProductsPath/Release-iphoneos
   rm -f "$DD"/main.jsbundle "$DD"/main.jsbundle.meta
   ```

3. **Always** verify the final bundle with the greps in
   [§ 3.2](#32-verify-the-archive--embedded-bundle) before uploading.

### 3. `.env.production.local` is not a reliable source of truth

The file exists and `@expo/env` *does* load it in a clean `export:embed`
production run (verified: `NODE_ENV=production` → loads `.env.production.local`
→ `EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca`). But because the
`xcodebuild` bundle phase can hit a stale bundle path, the file must be treated
as a **defense-in-depth fallback, never the primary mechanism**. The explicit
command-line env var is the source of truth for release builds.

## Release checklist (dual-store)

- [ ] `app.json` version bumped (`expo.version` + `ios.buildNumber` + `android.versionCode`)
- [ ] Human QA checklist (§ 1.2) passed on the release build
- [ ] Build command includes `EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca`
- [ ] Stale bundle removed; bundle verified (`pythonvps` ≥ 1, `localhost:5001` = 0)
- [ ] **iOS:** archive verified → uploaded → App Store Connect build appears → submitted
- [ ] **Android:** Play account verified → `.aab` built & signed → Internal → … → Production
- [ ] Store listings complete (screenshots, privacy policy, data safety, content rating)

## Related docs

- [ADR-0027 — Defer Automated E2E — Human QA](../adr/0027-defer-automated-e2e-human-qa.md) — why releases use human QA, not Maestro
- [ADR-0013 — App Store Strategy & Product Naming](../adr/0013-app-store-strategy.md) — *which* app/listing, bundle ID, IAP, Play gap
- [SPEC-023 — Mobile E2E Testing](023-mobile-e2e-testing.md) — deferred; source of the human QA checklist
- [SPEC-014 — Subscription/Payment System](014-subscription-payment-system.md) — IAP + Play Billing caveats
- [SPEC-025 — Payment E2E Testing](025-payment-e2e-testing.md) — detailed payment checklist
- [AGENTS.md](../../AGENTS.md) — dev-server conventions, Node 22 requirement, "never run builds un-prompted"
